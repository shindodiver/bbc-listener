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

    // Content-Type が audio/ を含むか検証（HTMLエラーページ等でないか確認）
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

    // サイズが 50KB 以上あるか検証
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

    const prompt = `あなたはBBC Learning English「6 Minute English」の音声文字起こし専門アシスタントです。

【最重要ルール】
1. 添付された音声データの内容だけを忠実に文字起こしすること。内容が聞き取れない場合でも別のエピソードを推測・創作しないこと。
2. 冒頭や途中にポッドキャストの広告・スポンサー紹介・他番組のプロモーションが含まれる場合は文字起こしから除外すること。
3. 「6 Minute English」の本編開始位置（例: "Hello, welcome to 6 Minute English..." や番組イントロの開始時点）を 0 秒基準として、全セグメントの start / end タイムスタンプを算出すること（冒頭に広告があった場合はその広告秒数を差し引いて本編開始を 0 秒とすること）。

出力仕様:
- 本編の最初から最後まで、1〜2文ごと（目安として4〜15秒程度）の自然なセグメントに分割する。
- 各セグメント ("segments") には以下を含める:
  - "id": "seg-1", "seg-2", ... の連番
  - "start": 本編開始位置を 0 秒基準とした開始秒数（数値、例: 0, 4.2, 12.8）
  - "end": 本編開始位置を 0 秒基準とした終了秒数（数値、例: 4.2, 12.8, 20.5）
  - "speaker": 音声内で実際に発話している話者名（例: "Phil", "Georgie", "Neil", "Beth", "Rob", "Pippa", "Guest" など、音声内で名乗っている実際の名前）
  - "text": 実際に発話された英語スクリプト全文
- "idioms": この音声の本編スクリプト内に実際に登場する重要な英語イディオム・熟語・句動詞・定型表現（6〜15個）の配列。本文中の表記と一致する文字列で抽出すること。`;

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
                  "Time-aligned verbatim transcript segments of the 6 Minute English main programme (excluding ads, with main programme start as 0s)",
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
                        "Start time in seconds relative to main programme start (0s)",
                    },
                    end: {
                      type: Type.NUMBER,
                      description:
                        "End time in seconds relative to main programme start (0s)",
                    },
                    speaker: {
                      type: Type.STRING,
                      description: "Speaker name heard in the audio",
                    },
                    text: {
                      type: Type.STRING,
                      description:
                        "Verbatim transcribed English text from the attached audio",
                    },
                  },
                  required: ["id", "start", "end", "speaker", "text"],
                },
              },
              idioms: {
                type: Type.ARRAY,
                description:
                  "Important idioms and multi-word expressions appearing verbatim in the transcript",
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
