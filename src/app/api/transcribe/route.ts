export const maxDuration = 60;
export const preferredRegion = "hnd1";

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { TranscriptData, TranscriptSegment } from "@/types";

const MODEL_FALLBACK_ORDER = [
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-3.8-flash",
] as const;

const MIN_AUDIO_BYTES = 50 * 1024; // 50KB

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
            "環境変数 GEMINI_API_KEY が設定されていません。.env.local または Vercel の環境変数に GEMINI_API_KEY を設定してください。",
        },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { audioUrl } = body as {
      audioUrl?: string;
      episodeTitle?: string;
    };

    if (!audioUrl || typeof audioUrl !== "string") {
      return NextResponse.json(
        { error: "音声URL (audioUrl) が指定されていません。" },
        { status: 400 }
      );
    }

    // 東京リージョン (hnd1) からリダイレクトを追跡して確実にオリジナルMP3を取得
    const audioRes = await fetch(audioUrl, {
      redirect: "follow",
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "audio/mpeg, audio/*, */*",
        "Accept-Language": "ja,en-GB;q=0.9,en;q=0.8",
      },
    });

    if (!audioRes.ok) {
      return NextResponse.json(
        {
          error: `音声ファイルの取得に失敗しました (HTTP ${audioRes.status})`,
        },
        { status: 502 }
      );
    }

    const rawContentType = (
      audioRes.headers.get("content-type") || ""
    ).toLowerCase();

    if (!rawContentType.includes("audio/")) {
      return NextResponse.json(
        {
          error: `取得したURLから音声データが返されませんでした (Content-Type: ${
            rawContentType || "不明"
          })。`,
        },
        { status: 502 }
      );
    }

    const arrayBuffer = await audioRes.arrayBuffer();

    if (arrayBuffer.byteLength < MIN_AUDIO_BYTES) {
      return NextResponse.json(
        {
          error: `取得した音声データのサイズが小さすぎます (${Math.round(
            arrayBuffer.byteLength / 1024
          )}KB)。有効なMP3ファイルではありません。`,
        },
        { status: 502 }
      );
    }

    const base64Audio = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = rawContentType.split(";")[0].trim() || "audio/mpeg";

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `あなたはBBC Learning English「6 Minute English」の音声文字起こし＆英語表現抽出の専門アシスタントです。

【最重要ルール】
1. 添付された音声データの内容だけを忠実に文字起こしすること。内容が聞き取れない場合でも別のエピソードを推測・創作しないこと。
2. 冒頭や途中にポッドキャストの広告・スポンサー紹介・他番組のプロモーションが含まれる場合は文字起こしから除外すること。
3. 「6 Minute English」の本編開始位置（例: "Hello, welcome to 6 Minute English..." や番組イントロの開始時点）を 0 秒基準として、全セグメントの start / end タイムスタンプを算出すること。

【セグメント分割とタイムスタンプ精度ルール】
- 再生中のハイライト追従の遅れやズレを防ぐため、1セグメントは必ず短く（1〜2文・5〜10秒目安、短い相槌や挨拶は1〜4秒）こまめに区切ること。複数の長い段落を1つのセグメントにまとめないこと。
- 各セグメントの "start" と "end" は、そのセリフが実際に発話開始された瞬間と発話終了した瞬間の秒数（小数第1位まで、例: 0.0, 4.2, 9.8）に厳密に一致させること。ジングルや無音の間（ポーズ）はセリフの区切りとして扱い、次のセリフの実際の話し始めを次の "start" にすること。

【イディオム・句動詞・コロケーション抽出ルール ("idioms")】
- エピソード全体から、句動詞（phrasal verbs: 例 "come up with", "find out", "rely on", "turn out", "look into", "give up" 等）・熟語・慣用表現（idioms）・重要コロケーションを漏れなく抽出すること（目安として12〜25個）。
- 必ず「文字起こし本文（segments[].text）の中に実際に出現する表記そのまま（動詞の活用形・時制・所有格・代名詞を辞書の見出し形に変換しない）」の文字列で "idioms" 配列に入れること。
  - 良い例: 本文が "She came up with a great idea" なら "came up with"、本文が "taking it for granted" なら "taking it for granted"
  - 悪い例: 本文にない原形 "come up with" や "take something for granted" に書き換えること`;

    const generateForModel = (model: string) =>
      ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64Audio,
                },
              },
              {
                text: prompt,
              },
            ],
          },
        ],
        config: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              segments: {
                type: Type.ARRAY,
                description:
                  "Short (1-2 sentences, 5-10s) time-aligned verbatim transcript segments of the 6 Minute English main programme",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: {
                      type: Type.STRING,
                      description: "Segment ID such as seg-1, seg-2",
                    },
                    start: {
                      type: Type.NUMBER,
                      description:
                        "Exact utterance start time in seconds relative to main programme start (0s)",
                    },
                    end: {
                      type: Type.NUMBER,
                      description:
                        "Exact utterance end time in seconds relative to main programme start (0s)",
                    },
                    speaker: {
                      type: Type.STRING,
                      description: "Speaker name heard in the audio",
                    },
                    text: {
                      type: Type.STRING,
                      description:
                        "Verbatim transcribed English text for this 5-10s segment",
                    },
                  },
                  required: ["id", "start", "end", "speaker", "text"],
                },
              },
              idioms: {
                type: Type.ARRAY,
                description:
                  "All phrasal verbs, idioms, set phrases, and collocations appearing in the episode, written in the EXACT surface form as they appear in segments[].text",
                items: {
                  type: Type.STRING,
                },
              },
            },
            required: ["segments", "idioms"],
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
            `[transcribe] ${model} で 503/429 エラーが発生したため、1.5秒待機後に ${nextModel} へフォールバックします。`
          );
          await sleep(1500);
          continue;
        }
        throw err;
      }
    }

    if (!response) {
      throw (
        lastError || new Error("すべてのモデルで文字起こし生成に失敗しました。")
      );
    }

    const rawText = response.text;
    if (!rawText) {
      throw new Error("Gemini APIから空のレスポンスが返されました。");
    }

    const parsed = JSON.parse(rawText) as TranscriptData;

    const rawSegments = Array.isArray(parsed.segments) ? parsed.segments : [];
    const normalizedSegments: TranscriptSegment[] = rawSegments
      .map((seg, idx) => {
        const start = Number.isFinite(Number(seg.start))
          ? Math.max(0, Number(seg.start))
          : idx * 5;
        const rawEnd = Number.isFinite(Number(seg.end))
          ? Number(seg.end)
          : start + 5;
        const end = rawEnd > start ? rawEnd : start + 4;
        return {
          id: seg.id || `seg-${idx + 1}`,
          start: Math.round(start * 10) / 10,
          end: Math.round(end * 10) / 10,
          speaker: (seg.speaker || "Host").trim(),
          text: (seg.text || "").trim(),
        };
      })
      .filter((seg) => seg.text.length > 0)
      .sort((a, b) => a.start - b.start);

    const idioms = Array.isArray(parsed.idioms)
      ? Array.from(
          new Set(
            parsed.idioms
              .map((item) => (typeof item === "string" ? item.trim() : ""))
              .filter((item) => item.length >= 2)
          )
        )
      : [];

    const result: TranscriptData = {
      audioUrl,
      segments: normalizedSegments,
      idioms,
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Transcribe API Error:", error);
    const message =
      error instanceof Error
        ? error.message
        : "文字起こし処理中にエラーが発生しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
