import { VocabEntry } from "@/types";

export interface TextToken {
  type: "idiom" | "word" | "other";
  text: string;
  canonicalIdiom?: string;
  isSaved: boolean;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * イディオムの文字列（例: "take something for granted", "break the ice"）から
 * 文中の活用・代名詞変化もある程度許容する正規表現パターンを生成する
 */
function buildIdiomPattern(idiom: string): string {
  const cleaned = idiom.trim();
  if (!cleaned) return "";

  const words = cleaned.split(/\s+/);
  const wordPatterns = words.map((w) => {
    const lower = w.toLowerCase();
    if (
      lower === "someone" ||
      lower === "somebody" ||
      lower === "something" ||
      lower === "one's" ||
      lower === "oneself" ||
      lower === "sb" ||
      lower === "sth"
    ) {
      // 代名詞や1〜2語の挿入を許容
      return "(?:[A-Za-z'’-]+(?:\\s+[A-Za-z'’-]+)?)";
    }
    // 語尾の軽い活用（s, es, ed, ing, d）やそのままの一致を許容
    const escaped = escapeRegExp(w);
    if (w.length >= 4 && /^[A-Za-z]+$/.test(w)) {
      const stem = escapeRegExp(w.slice(0, -1));
      return `(?:${escaped}(?:s|es|d|ed|ing)?|${stem}(?:ed|ing|ies))`;
    }
    return escaped;
  });

  return `\\b(?:${wordPatterns.join("\\s+")})\\b`;
}

/**
 * セグメントの英文を「イディオム（破線下線・1まとまり）」「単語」「記号・空白」に分割し、
 * それぞれが単語ノートに記録済みかどうかを判定する。
 */
export function tokenizeSegmentText(
  text: string,
  episodeIdioms: string[],
  vocabList: VocabEntry[]
): TextToken[] {
  if (!text) return [];

  // 単語ノートに保存済みの語句セットを作成
  const savedSet = new Set<string>();
  const savedIdioms: string[] = [];

  for (const entry of vocabList) {
    const t = entry.term.trim().toLowerCase();
    if (t) {
      savedSet.add(t);
      if (entry.isIdiom || t.includes(" ")) {
        savedIdioms.push(entry.term.trim());
      }
    }
    if (entry.surfaceTerm) {
      const s = entry.surfaceTerm.trim().toLowerCase();
      if (s) {
        savedSet.add(s);
        if (s.includes(" ")) {
          savedIdioms.push(entry.surfaceTerm.trim());
        }
      }
    }
  }

  // エピソードのイディオムと保存済みイディオムを統合し、長い順にソート
  const allIdiomsMap = new Map<string, string>();
  for (const idiom of [...episodeIdioms, ...savedIdioms]) {
    const trimmed = idiom.trim();
    if (trimmed && trimmed.length >= 3) {
      const key = trimmed.toLowerCase();
      if (!allIdiomsMap.has(key)) {
        allIdiomsMap.set(key, trimmed);
      }
    }
  }

  const sortedIdioms = Array.from(allIdiomsMap.values()).sort(
    (a, b) => b.length - a.length
  );

  // まずイディオム区間を検出する
  interface Span {
    start: number;
    end: number;
    text: string;
    canonicalIdiom: string;
  }

  const idiomSpans: Span[] = [];

  for (const idiom of sortedIdioms) {
    const patternStr = buildIdiomPattern(idiom);
    if (!patternStr) continue;
    try {
      const regex = new RegExp(patternStr, "gi");
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        // 既存のイディオム区間と重複しないかチェック
        const overlaps = idiomSpans.some(
          (s) => !(end <= s.start || start >= s.end)
        );
        if (!overlaps) {
          idiomSpans.push({
            start,
            end,
            text: match[0],
            canonicalIdiom: idiom,
          });
        }
      }
    } catch {
      // 正規表現エラー時はスキップ
    }
  }

  idiomSpans.sort((a, b) => a.start - b.start);

  const tokens: TextToken[] = [];
  let cursor = 0;

  const pushNonIdiomSlice = (slice: string) => {
    if (!slice) return;
    // 英単語（アポストロフィやハイフンを含む）とそれ以外に分割
    const wordRegex = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g;
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    while ((m = wordRegex.exec(slice)) !== null) {
      if (m.index > lastIdx) {
        tokens.push({
          type: "other",
          text: slice.slice(lastIdx, m.index),
          isSaved: false,
        });
      }
      const wordText = m[0];
      const lower = wordText.toLowerCase();
      tokens.push({
        type: "word",
        text: wordText,
        isSaved: savedSet.has(lower),
      });
      lastIdx = m.index + wordText.length;
    }
    if (lastIdx < slice.length) {
      tokens.push({
        type: "other",
        text: slice.slice(lastIdx),
        isSaved: false,
      });
    }
  };

  for (const span of idiomSpans) {
    if (span.start > cursor) {
      pushNonIdiomSlice(text.slice(cursor, span.start));
    }
    const lowerSurface = span.text.toLowerCase();
    const lowerCanonical = span.canonicalIdiom.toLowerCase();
    tokens.push({
      type: "idiom",
      text: span.text,
      canonicalIdiom: span.canonicalIdiom,
      isSaved: savedSet.has(lowerSurface) || savedSet.has(lowerCanonical),
    });
    cursor = span.end;
  }

  if (cursor < text.length) {
    pushNonIdiomSlice(text.slice(cursor));
  }

  return tokens;
}
