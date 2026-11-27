import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { WordDefinition } from "@/types";

const MODEL_FALLBACK_ORDER = [
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
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
イディオム判定ヒント: ${isIdiom ? "イディオム・熟語として選択された" : "単語または表現として選択された"}
前後の文脈: "${context || term}"

【最重要ルール：単一単語タップ時のイディオム・句動詞の自動検出】
ユーザーが単一の単語（例: "up", "out", "granted", "beans", "came", "turn", "look" など）をタップした場合でも、渡された「前後の文脈」の中でその単語がイディオム・熟語・句動詞（phrasal verb）・定型表現・重要コロケーションの一部として使われているかどうかを必ず判定してください。
もしイディオムや句動詞の一部として使われている場合は：
1. "term" には、単一単語ではなく**そのイディオム・句動詞全体の基本形（辞書見出し形、例: "come up with", "take for granted", "turn out", "spill the beans"）**を返してください。
2. "matchedText" には、文脈内に実際に出現しているイディオム部分の表記そのまま（例: "came up with", "taking it for granted", "turned out"）を返してください。
3. "isIdiom" を必ず **true** にし、"pos" を **"イディオム"** または **"句動詞"** としてください。
4. "meaningJa", "usage", "exampleEn", "exampleJa" もすべてそのイディオム・句動詞全体に対する解説・例文にしてください。

（逆に、イディオムや句動詞の一部ではなく通常の単語として使われている場合は、その単語の基本形を "term"、文中の表記を "matchedText"、"isIdiom" を false として解説してください。）

出力フィールド仕様:
- "term": 単語または検出されたイディオム全体の見出し表記
- "matchedText": 文脈（context）の中に実際に出現している該当語句・イディオムの文字列
- "isIdiom": イディオム・熟語・句動詞・定型表現であれば true、単一の通常単語であれば false
- "pos": 品詞名または表現種別（日本語で記述。例: "名詞", "動詞", "形容詞", "副詞", "イディオム", "句動詞"）
- "phonetic": イギリス英語（Received Pronunciation）基準のIPA発音記号（例: "/kʌm ʌp wɪð/"）
- "meaningJa": この文脈における自然で分かりやすい日本語の意味（単語ノート一覧の1行表示でも一目で分かるよう、先頭に簡潔な訳語を書くこと）
- "usage": 文脈での使われ方、ニュアンス、コアイメージ、または日常会話での使い方のポイントを日本語で丁寧に解説（2〜3文程度）
- "exampleEn": 覚えやすく実用的な英語の例文（1文）
- "exampleJa": 上記例文の自然な日本語訳`;

    const generateForModel = (model: string) =>
      ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              term: {
                type: Type.STRING,
                description:
                  "Target word headword, OR the full idiom/phrasal verb if the tapped word is part of an idiom/phrasal verb in the context",
              },
              matchedText: {
                type: Type.STRING,
                description:
                  "The exact surface substring in the context corresponding to the word or full idiom",
              },
              isIdiom: {
                type: Type.BOOLEAN,
                description:
                  "True if idiom/phrasal verb/multi-word expression (including when auto-detected from a single tapped word)",
              },
              pos: {
                type: Type.STRING,
                description:
                  "Part of speech in Japanese (e.g. 名詞, 動詞, イディオム, 句動詞)",
              },
              phonetic: {
                type: Type.STRING,
                description: "UK IPA phonetic transcription",
              },
              meaningJa: {
                type: Type.STRING,
                description:
                  "Concise Japanese meaning fitting the context",
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
              "matchedText",
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
    const resolvedTerm = (parsed.term || term).trim();
    const resolvedIsIdiom = Boolean(
      parsed.isIdiom ?? (isIdiom || resolvedTerm.includes(" "))
    );

    const result: WordDefinition = {
      term: resolvedTerm,
      matchedText: (parsed.matchedText || term).trim(),
      isIdiom: resolvedIsIdiom,
      pos: (parsed.pos || (resolvedIsIdiom ? "イディオム" : "単語")).trim(),
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
