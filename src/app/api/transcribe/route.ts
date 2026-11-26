export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { TranscriptData, TranscriptSegment } from "@/types";

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
    const { audioUrl, episodeTitle } = body as {
      audioUrl?: string;
      episodeTitle?: string;
    };

    if (!audioUrl || typeof audioUrl !== "string") {
      return NextResponse.json(
        { error: "音声URL (audioUrl) が指定されていません。" },
        { status: 400 }
      );
    }

    // サーバー側でオリジナルMP3を取得
    const audioRes = await fetch(audioUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
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

    const arrayBuffer = await audioRes.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString("base64");
    const contentType =
      audioRes.headers.get("content-type")?.split(";")[0] || "audio/mpeg";

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are an expert English transcription assistant for BBC Learning English "6 Minute English".
Episode Title: ${episodeTitle || "6 Minute English"}

Task:
1. Transcribe the entire English audio accurately from start to finish.
2. Divide the transcript into natural segments of 1 to 2 sentences each (typically 4 to 14 seconds per segment) so learners can easily follow along on a smartphone screen.
3. For each segment, provide:
   - "id": sequential string id like "seg-1", "seg-2", ...
   - "start": exact start timestamp in seconds from the beginning of the audio (number, e.g. 0, 6.5, 14.2)
   - "end": exact end timestamp in seconds (number, e.g. 6.5, 14.2, 22.0)
   - "speaker": speaker name inferred from the dialogue (e.g. "Neil", "Beth", "Georgie", "Rob", "Pippa", "Sam", "Intro", "Guest")
   - "text": exact English transcript for that segment
4. Extract "idioms": an array of 6 to 15 important English idioms, phrasal verbs, collocations, or key multi-word expressions that actually appear in the transcript. Write each idiom using the exact phrase or words that appear in the segment texts so they can be matched and highlighted in the transcript.`;

    const generateForModel = (model: string) =>
      ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: contentType,
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
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              segments: {
                type: Type.ARRAY,
                description: "Time-aligned transcript segments for the episode",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: {
                      type: Type.STRING,
                      description: "Segment ID such as seg-1, seg-2",
                    },
                    start: {
                      type: Type.NUMBER,
                      description: "Start time in seconds from 0",
                    },
                    end: {
                      type: Type.NUMBER,
                      description: "End time in seconds",
                    },
                    speaker: {
                      type: Type.STRING,
                      description: "Speaker name",
                    },
                    text: {
                      type: Type.STRING,
                      description: "Transcribed English text",
                    },
                  },
                  required: ["id", "start", "end", "speaker", "text"],
                },
              },
              idioms: {
                type: Type.ARRAY,
                description:
                  "Important idioms and multi-word expressions appearing in the episode transcript",
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
            `[transcribe] ${model} で 503/429 エラーが発生したため、${nextModel} へフォールバックします。`
          );
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
