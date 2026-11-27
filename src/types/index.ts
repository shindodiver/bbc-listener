export interface Episode {
  id: string;
  title: string;
  pubDate: string;
  description: string;
  audioUrl: string;
  duration?: string;
}

export interface TranscriptSegment {
  id: string;
  start: number; // 秒
  end: number;   // 秒
  speaker: string;
  text: string;
}

export interface TranscriptData {
  episodeId?: string;
  audioUrl?: string;
  segments: TranscriptSegment[];
  idioms: string[];
  updatedAt?: string;
  isDemo?: boolean;
}

export interface WordDefinition {
  term: string;          // 単語またはイディオム（イディオム検出時はイディオム全体）
  matchedText?: string;  // 本文中で該当する箇所の表記
  isIdiom: boolean;      // イディオム・句動詞かどうか
  pos: string;           // 品詞/イディオム
  phonetic: string;      // 発音記号
  meaningJa: string;     // 日本語訳
  usage: string;         // 使われ方・ニュアンス
  exampleEn: string;     // 例文・英語
  exampleJa: string;     // 例文・日本語
}

export interface VocabEntry extends WordDefinition {
  id: string;
  surfaceTerm?: string; // 文字起こし上で選択された元の表記
  episodeId: string;
  episodeTitle: string;
  timestamp: number;    // セグメントの開始秒数
  contextText: string;  // 登場した文脈英文
  mastered: boolean;    // false: 未習得, true: 覚えた
  createdAt: string;
}

export type PlaybackSpeed = 0.8 | 1.0 | 1.2 | 1.5;

export type PlaybackMode = "normal" | "loop" | "continuous";

export type MainTab = "listening" | "vocab";

export type VocabFilter = "all" | "unlearned" | "mastered";
