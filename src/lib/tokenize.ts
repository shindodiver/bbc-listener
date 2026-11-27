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

const IRREGULAR_VERBS: Record<string, string[]> = {
  be: ["am", "is", "are", "was", "were", "been", "being"],
  take: ["takes", "took", "taken", "taking"],
  make: ["makes", "made", "making"],
  come: ["comes", "came", "coming"],
  go: ["goes", "went", "gone", "going"],
  get: ["gets", "got", "gotten", "getting"],
  give: ["gives", "gave", "given", "giving"],
  put: ["puts", "putting"],
  set: ["sets", "setting"],
  run: ["runs", "ran", "running"],
  bring: ["brings", "brought", "bringing"],
  keep: ["keeps", "kept", "keeping"],
  hold: ["holds", "held", "holding"],
  find: ["finds", "found", "finding"],
  think: ["thinks", "thought", "thinking"],
  break: ["breaks", "broke", "broken", "breaking"],
  fall: ["falls", "fell", "fallen", "falling"],
  catch: ["catches", "caught", "catching"],
  cut: ["cuts", "cutting"],
  let: ["lets", "letting"],
  see: ["sees", "saw", "seen", "seeing"],
  know: ["knows", "knew", "known", "knowing"],
  grow: ["grows", "grew", "grown", "growing"],
  throw: ["throws", "threw", "thrown", "throwing"],
  draw: ["draws", "drew", "drawn", "drawing"],
  stand: ["stands", "stood", "standing"],
  lose: ["loses", "lost", "losing"],
  pay: ["pays", "paid", "paying"],
  meet: ["meets", "met", "meeting"],
  leave: ["leaves", "left", "leaving"],
  feel: ["feels", "felt", "feeling"],
  Lead: ["leads", "led", "leading"],
};

/**
 * イディオム文字列から大文字小文字を無視して文中の出現箇所にマッチする正規表現を構築する。
 * 1. そのままの表記（完全一致）を最優先で含める
 * 2. 代名詞プレースホルダ (someone, something, one's 等) や動詞の活用変化も許容する
 */
function buildIdiomPattern(idiom: string): string {
  const cleaned = idiom.trim().replace(/^["'’]+|["'’.,!?]+$/g, "");
  if (!cleaned) return "";

  const exactEscaped = escapeRegExp(cleaned).replace(/\s+/g, "\\s+");

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
      return "(?:[A-Za-z'’-]+(?:\\s+[A-Za-z'’-]+)?)";
    }

    const escaped = escapeRegExp(w);
    const irregulars = IRREGULAR_VERBS[lower];
    if (irregulars && irregulars.length > 0) {
      const alts = [escaped, ...irregulars.map(escapeRegExp)].join("|");
      return `(?:${alts})`;
    }

    if (w.length >= 3 && /^[A-Za-z]+$/.test(w)) {
      const stem = escapeRegExp(w.slice(0, -1));
      return `(?:${escaped}(?:s|es|d|ed|ing)?|${stem}(?:ed|ing|ies))`;
    }
    return escaped;
  });

  const flexiblePattern = wordPatterns.join("\\s+");
  const startBoundary = /^[A-Za-z0-9]/.test(cleaned) ? "\\b" : "";
  const endBoundary = /[A-Za-z0-9]$/.test(cleaned) ? "\\b" : "";

  return `${startBoundary}(?:${exactEscaped}|${flexiblePattern})${endBoundary}`;
}

/**
 * セグメントの英文を「イディオム（破線下線・1まとまり）」「単語」「記号・空白」に分割し、
 * それぞれが単語ノートに記録済みかどうかを判定する。
 * 長いイディオムから優先的に大文字小文字を無視してマッチさせる。
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
    const candidates = [entry.term, entry.surfaceTerm, entry.matchedText];
    for (const raw of candidates) {
      if (!raw) continue;
      const t = raw.trim().toLowerCase();
      if (!t) continue;
      savedSet.add(t);
      if (entry.isIdiom || t.includes(" ")) {
        savedIdioms.push(raw.trim());
      }
    }
  }

  // エピソードのイディオムと保存済みイディオムを統合し、文字数が長い順（最長一致優先）にソート
  const allIdiomsMap = new Map<string, string>();
  for (const idiom of [...episodeIdioms, ...savedIdioms]) {
    const trimmed = idiom.trim().replace(/^["'’]+|["'’.,!?]+$/g, "");
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
        if (!match[0]) break;
        const start = match.index;
        const end = start + match[0].length;
        // より長いイディオムで既に確定した区間と重複しないかチェック
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
