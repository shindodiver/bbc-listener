import {
  Episode,
  PlaybackMode,
  TranscriptData,
  VocabEntry,
  WordDefinition,
} from "@/types";

const STORAGE_KEYS = {
  TRANSCRIPT_PREFIX: "bbc6min_transcript_v2_",
  LEGACY_TRANSCRIPT_PREFIX: "bbc6min_transcript_v1_",
  SYNC_OFFSET_PREFIX: "bbc6min_sync_offset_v1_",
  DEFINE_CACHE: "bbc6min_define_cache_v2",
  VOCAB_LIST: "bbc6min_vocab_list_v1",
  LAST_EPISODE_ID: "bbc6min_last_episode_id_v1",
  AUTO_SCROLL: "bbc6min_auto_scroll_v1",
  PLAYBACK_MODE: "bbc6min_playback_mode_v1",
} as const;

function isBrowser(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

// --- 文字起こしキャッシュ（id + audioUrl の複合キー） ---

export function makeTranscriptCacheKey(
  episodeId: string,
  audioUrl: string
): string {
  return `${STORAGE_KEYS.TRANSCRIPT_PREFIX}${episodeId.trim()}__${audioUrl.trim()}`;
}

export function getCachedTranscript(
  episodeId: string,
  audioUrl: string
): TranscriptData | null {
  if (!isBrowser() || !episodeId || !audioUrl) return null;
  try {
    const key = makeTranscriptCacheKey(episodeId, audioUrl);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TranscriptData;
    if (!parsed || !Array.isArray(parsed.segments)) return null;
    if (parsed.episodeId && parsed.episodeId !== episodeId) return null;
    if (parsed.audioUrl && parsed.audioUrl !== audioUrl) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setCachedTranscript(
  episodeId: string,
  audioUrl: string,
  data: TranscriptData
): void {
  if (!isBrowser() || !episodeId || !audioUrl) return;
  try {
    const key = makeTranscriptCacheKey(episodeId, audioUrl);
    const payload: TranscriptData = {
      ...data,
      episodeId,
      audioUrl,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(key, JSON.stringify(payload));
    localStorage.removeItem(
      `${STORAGE_KEYS.LEGACY_TRANSCRIPT_PREFIX}${episodeId}`
    );
  } catch (e) {
    console.warn("文字起こしキャッシュの保存に失敗しました:", e);
  }
}

export function removeCachedTranscript(
  episodeId: string,
  audioUrl: string
): void {
  if (!isBrowser()) return;
  try {
    const key = makeTranscriptCacheKey(episodeId, audioUrl);
    localStorage.removeItem(key);
    localStorage.removeItem(
      `${STORAGE_KEYS.LEGACY_TRANSCRIPT_PREFIX}${episodeId}`
    );
  } catch {
    // ignore
  }
}

export function getCachedEpisodeIdSet(episodes: Episode[]): Set<string> {
  const result = new Set<string>();
  if (!isBrowser()) return result;
  for (const ep of episodes) {
    if (getCachedTranscript(ep.id, ep.audioUrl)) {
      result.add(ep.id);
    }
  }
  return result;
}

// --- エピソード単位の同期オフセット (syncOffset) 保存 ---

export function getEpisodeSyncOffset(episodeId: string): number {
  if (!isBrowser() || !episodeId) return 0;
  try {
    const raw = localStorage.getItem(
      `${STORAGE_KEYS.SYNC_OFFSET_PREFIX}${episodeId.trim()}`
    );
    if (!raw) return 0;
    const num = parseFloat(raw);
    return Number.isFinite(num) ? Math.round(num * 10) / 10 : 0;
  } catch {
    return 0;
  }
}

export function setEpisodeSyncOffset(
  episodeId: string,
  offsetSeconds: number
): void {
  if (!isBrowser() || !episodeId) return;
  try {
    const rounded = Math.round(offsetSeconds * 10) / 10;
    const key = `${STORAGE_KEYS.SYNC_OFFSET_PREFIX}${episodeId.trim()}`;
    if (rounded === 0) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, String(rounded));
    }
  } catch {
    // ignore
  }
}

// --- 単語・イディオム解説キャッシュ（文脈依存のイディオム展開に対応するため term + context キーを優先） ---

const memoryDefineCache = new Map<string, WordDefinition>();

function makeDefineCacheKey(term: string, context: string): string {
  return `${term.trim().toLowerCase()}__${context
    .trim()
    .slice(0, 140)
    .toLowerCase()}`;
}

export function getCachedDefinition(
  term: string,
  context: string
): WordDefinition | null {
  const exactKey = makeDefineCacheKey(term, context);

  if (memoryDefineCache.has(exactKey)) {
    return memoryDefineCache.get(exactKey)!;
  }
  if (!isBrowser()) return null;

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DEFINE_CACHE);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, WordDefinition>;
    if (map[exactKey]) {
      memoryDefineCache.set(exactKey, map[exactKey]);
      return map[exactKey];
    }
    return null;
  } catch {
    return null;
  }
}

export function setCachedDefinition(
  term: string,
  context: string,
  definition: WordDefinition
): void {
  const exactKey = makeDefineCacheKey(term, context);
  memoryDefineCache.set(exactKey, definition);

  if (!isBrowser()) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DEFINE_CACHE);
    const map: Record<string, WordDefinition> = raw ? JSON.parse(raw) : {};
    map[exactKey] = definition;

    // 肥大化防止（最大300件）
    const keys = Object.keys(map);
    if (keys.length > 300) {
      for (const k of keys.slice(0, keys.length - 300)) {
        delete map[k];
      }
    }
    localStorage.setItem(STORAGE_KEYS.DEFINE_CACHE, JSON.stringify(map));
  } catch (e) {
    console.warn("辞書キャッシュの保存に失敗しました:", e);
  }
}

// --- 単語ノート ---

export function getVocabList(): VocabEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.VOCAB_LIST);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveVocabList(list: VocabEntry[]): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEYS.VOCAB_LIST, JSON.stringify(list));
  } catch (e) {
    console.warn("単語ノートの保存に失敗しました:", e);
  }
}

export function findVocabEntry(
  term: string,
  surfaceTerm?: string
): VocabEntry | undefined {
  const list = getVocabList();
  const t = term.trim().toLowerCase();
  const s = surfaceTerm?.trim().toLowerCase();
  return list.find((item) => {
    const itemTerm = item.term.trim().toLowerCase();
    const itemSurface = item.surfaceTerm?.trim().toLowerCase();
    const itemMatched = item.matchedText?.trim().toLowerCase();
    if (itemTerm === t || (s && itemTerm === s)) return true;
    if (itemSurface && (itemSurface === t || (s && itemSurface === s)))
      return true;
    if (itemMatched && (itemMatched === t || (s && itemMatched === s)))
      return true;
    return false;
  });
}

// --- UI設定保存 ---

export function getLastEpisodeId(): string | null {
  if (!isBrowser()) return null;
  try {
    return localStorage.getItem(STORAGE_KEYS.LAST_EPISODE_ID);
  } catch {
    return null;
  }
}

export function setLastEpisodeId(episodeId: string): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEYS.LAST_EPISODE_ID, episodeId);
  } catch {
    // ignore
  }
}

export function getAutoScrollPref(): boolean {
  if (!isBrowser()) return true;
  try {
    const val = localStorage.getItem(STORAGE_KEYS.AUTO_SCROLL);
    return val === null ? true : val === "true";
  } catch {
    return true;
  }
}

export function setAutoScrollPref(enabled: boolean): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEYS.AUTO_SCROLL, String(enabled));
  } catch {
    // ignore
  }
}

export function getPlaybackModePref(): PlaybackMode {
  if (!isBrowser()) return "normal";
  try {
    const val = localStorage.getItem(STORAGE_KEYS.PLAYBACK_MODE);
    if (val === "loop" || val === "continuous" || val === "normal") {
      return val;
    }
    return "normal";
  } catch {
    return "normal";
  }
}

export function setPlaybackModePref(mode: PlaybackMode): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEYS.PLAYBACK_MODE, mode);
  } catch {
    // ignore
  }
}
