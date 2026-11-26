import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { WordDefinition } from "@/types";

const MODEL_FALLBACK_ORDER = [
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.8-flash",
] as const;

function is503Or429Error(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { status?: number; code?: number; message?: string };
  if (
    err.status === 503 ||
    err.code === 503 ||
    err.status === 429 ||
    err.code === 429
  ) {
    return true;
  }
  if (typeof err.message === "string") {
    return /503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand|Service Unavailable|Too Many Requests|quota|rate limit/i.test(
      err.message
    );
  }
  return false;
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "your_gemini_api_key_here") {
      return NextResponse.json(
        {
          error:
            "環境変数 GEMINI_API_KEY が設定されていません。.env.local に GEMINI_API_KEY を設定してください。",
        },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { term, context, isIdiom, episodeTitle } = body as {
      term?: string;
      context?: string;
      isIdiom?: boolean;
      episodeTitle?: string;
    };

    if (!term || typeof term !== "string") {
      return NextResponse.json(
        { error: "調べる語句 (term) が指定されていません。" },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `あなたはBBC Learning English「6 Minute English」を聴く日本人英語学習者向けの辞書・解説アシスタントです。
以下の「選択された語句」と「前後の文脈」をもとに、文脈に最も適した日本語解説をJSONで返してください。

エピソード名: ${episodeTitle || "6 Minute English"}
選択された語句: "${term}"
イディオム判定ヒント: ${isIdiom ? "イディオム・熟語の可能性が高い" : "単語または表現"}
前後の文脈: "${context || term}"

出力ルール:
- "term": 選択された単語またはイディオムの見出し表記（イディオムや句動詞の場合はそのまとまり、活用形の場合は原形またはそのまま分かりやすい形）
- "isIdiom": イディオム・熟語・句動詞・定型表現であれば true、単一の単語であれば false
- "pos": 品詞名または表現種別（日本語で記述。例: "名詞", "動詞", "形容詞", "副詞", "イディオム", "句動詞"）
- "phonetic": イギリス英語（Received Pronunciation）基準のIPA発音記号（例: "/ˈɪd.i.əm/"）
- "meaningJa": この文脈における自然で分かりやすい日本語の意味（主要な意味を簡潔に）
- "usage": 文脈での使われ方、ニュアンス、コアイメージ、または日常会話での使い方のポイントを日本語で丁寧に解説（2〜3文程度）
- "exampleEn": 覚えやすく実用的な英語の例文（1文）
- "exampleJa": 上記例文の自然な日本語訳`;

    const generateForModel = (model: string) =>
      ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              term: {
                type: Type.STRING,
                description: "Target word or idiom headword",
              },
              isIdiom: {
                type: Type.BOOLEAN,
                description: "True if idiom/phrasal verb/multi-word expression",
              },
              pos: {
                type: Type.STRING,
                description:
                  "Part of speech in Japanese (e.g. 名詞, 動詞, イディオム)",
              },
              phonetic: {
                type: Type.STRING,
                description: "UK IPA phonetic transcription",
              },
              meaningJa: {
                type: Type.STRING,
                description: "Meaning in Japanese fitting the context",
              },
              usage: {
                type: Type.STRING,
                description: "Usage and nuance explanation in Japanese",
              },
              exampleEn: {
                type: Type.STRING,
                description: "Example sentence in English",
              },
              exampleJa: {
                type: Type.STRING,
                description: "Japanese translation of the example sentence",
              },
            },
            required: [
              "term",
              "isIdiom",
              "pos",
              "phonetic",
              "meaningJa",
              "usage",
              "exampleEn",
              "exampleJa",
            ],
          },
        },
      });

    let response;
    let lastError: unknown;

    for (let i = 0; i < MODEL_FALLBACK_ORDER.length; i++) {
      const model = MODEL_FALLBACK_ORDER[i];
      try {
        response = await generateForModel(model);
        break;
      } catch (err) {
        lastError = err;
        const hasNextModel = i < MODEL_FALLBACK_ORDER.length - 1;
        if (is503Or429Error(err) && hasNextModel) {
          const nextModel = MODEL_FALLBACK_ORDER[i + 1];
          console.warn(
            `[define] ${model} で 503/429 エラーが発生したため、${nextModel} へフォールバックします。`
          );
          continue;
        }
        throw err;
      }
    }

    if (!response) {
      throw (
        lastError || new Error("すべてのモデルで解説の生成に失敗しました。")
      );
    }

    const rawText = response.text;
    if (!rawText) {
      throw new Error("Gemini APIから空のレスポンスが返されました。");
    }

    const parsed = JSON.parse(rawText) as WordDefinition;

    const result: WordDefinition = {
      term: (parsed.term || term).trim(),
      isIdiom: Boolean(parsed.isIdiom ?? isIdiom),
      pos: (parsed.pos || (isIdiom ? "イディオム" : "単語")).trim(),
      phonetic: (parsed.phonetic || "").trim(),
      meaningJa: (parsed.meaningJa || "").trim(),
      usage: (parsed.usage || "").trim(),
      exampleEn: (parsed.exampleEn || "").trim(),
      exampleJa: (parsed.exampleJa || "").trim(),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Define API Error:", error);
    const message =
      error instanceof Error
        ? error.message
        : "語句の解説取得中にエラーが発生しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
