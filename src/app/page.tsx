"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Headphones,
  BookMarked,
  ListMusic,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import {
  Episode,
  MainTab,
  PlaybackSpeed,
  TranscriptData,
  TranscriptSegment,
  VocabEntry,
  WordDefinition,
} from "@/types";
import {
  getAutoScrollPref,
  getCachedDefinition,
  getCachedEpisodeIdSet,
  getCachedTranscript,
  getLastEpisodeId,
  getVocabList,
  removeCachedTranscript,
  saveVocabList,
  setAutoScrollPref,
  setCachedDefinition,
  setCachedTranscript,
  setLastEpisodeId,
} from "@/lib/storage";
import AudioPlayerBar from "@/components/AudioPlayerBar";
import EpisodeSelectorModal from "@/components/EpisodeSelectorModal";
import TranscriptView from "@/components/TranscriptView";
import VocabNotebookView from "@/components/VocabNotebookView";
import WordBottomSheet from "@/components/WordBottomSheet";

export default function HomePage() {
  // タブ状態
  const [activeTab, setActiveTab] = useState<MainTab>("listening");

  // エピソード関連
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
  const selectedEpisodeRef = useRef<Episode | null>(null);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(true);
  const [episodesError, setEpisodesError] = useState<string | null>(null);
  const [isEpisodeModalOpen, setIsEpisodeModalOpen] = useState(false);

  // 文字起こし関連
  const [transcript, setTranscript] = useState<TranscriptData | null>(null);
  const [cachedEpisodeIds, setCachedEpisodeIds] = useState<Set<string>>(
    new Set()
  );
  const [transcribingEpisodeId, setTranscribingEpisodeId] = useState<
    string | null
  >(null);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [syncOffset, setSyncOffset] = useState<number>(0);

  // 音声再生関連
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(360);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1.0);

  // 単語解説ボトムシート関連
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState("");
  const [selectedIsIdiom, setSelectedIsIdiom] = useState(false);
  const [selectedSegment, setSelectedSegment] =
    useState<TranscriptSegment | null>(null);
  const [definition, setDefinition] = useState<WordDefinition | null>(null);
  const [isDefining, setIsDefining] = useState(false);
  const [defineError, setDefineError] = useState<string | null>(null);

  // 単語ノート関連
  const [vocabList, setVocabList] = useState<VocabEntry[]>([]);

  // 初期ロード：localStorageから単語ノート・設定を復元し、RSSを取得
  const fetchEpisodes = useCallback(async () => {
    setIsLoadingEpisodes(true);
    setEpisodesError(null);
    try {
      const res = await fetch("/api/episodes", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.episodes)) {
        throw new Error(data.error || "エピソード一覧の取得に失敗しました。");
      }

      const list: Episode[] = data.episodes;
      setEpisodes(list);
      setCachedEpisodeIds(getCachedEpisodeIdSet(list));

      const savedEpisodeId = getLastEpisodeId();
      const initialEp =
        list.find((e) => e.id === savedEpisodeId) || list[0] || null;
      if (initialEp) {
        selectedEpisodeRef.current = initialEp;
        setSelectedEpisode(initialEp);
      }
    } catch (e) {
      setEpisodesError(
        e instanceof Error
          ? e.message
          : "RSSフィードの読み込みに失敗しました。"
      );
    } finally {
      setIsLoadingEpisodes(false);
    }
  }, []);

  useEffect(() => {
    setVocabList(getVocabList());
    setAutoScroll(getAutoScrollPref());
    fetchEpisodes();
  }, [fetchEpisodes]);

  // エピソード切替時：selectedEpisodeRef を同期し、id + audioUrl に一致するキャッシュのみ読み込む
  useEffect(() => {
    selectedEpisodeRef.current = selectedEpisode;
    if (!selectedEpisode) return;

    setLastEpisodeId(selectedEpisode.id);
    setTranscribeError(null);
    setSheetOpen(false);
    setSyncOffset(0);

    const cached = getCachedTranscript(
      selectedEpisode.id,
      selectedEpisode.audioUrl
    );
    setTranscript(cached);

    // 音声要素のソース更新
    const audio = audioRef.current;
    if (audio) {
      const targetUrl = selectedEpisode.audioUrl;
      if (audio.src !== targetUrl) {
        audio.pause();
        audio.src = targetUrl;
        audio.playbackRate = playbackSpeed;
        audio.load();
        setCurrentTime(0);
        setDuration(360);
        setIsPlaying(false);
      }
    }
  }, [selectedEpisode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Media Session API 対応（iPhoneロック画面・コントロールセンターでの操作）
  useEffect(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;
    if (!selectedEpisode) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: selectedEpisode.title,
        artist: "BBC Learning English",
        album: "6 Minute English",
        artwork: [
          {
            src: "/icon.svg",
            sizes: "512x512",
            type: "image/svg+xml",
          },
        ],
      });

      const audio = audioRef.current;

      navigator.mediaSession.setActionHandler("play", () => {
        audio?.play().catch(() => {});
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        audio?.pause();
      });
      navigator.mediaSession.setActionHandler("seekbackward", (details) => {
        if (!audio) return;
        const offset = details.seekOffset || 5;
        audio.currentTime = Math.max(0, audio.currentTime - offset);
      });
      navigator.mediaSession.setActionHandler("seekforward", (details) => {
        if (!audio) return;
        const offset = details.seekOffset || 5;
        audio.currentTime = Math.min(
          audio.duration || 360,
          audio.currentTime + offset
        );
      });
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (!audio || typeof details.seekTime !== "number") return;
        audio.currentTime = details.seekTime;
      });
    } catch {
      // MediaSession 非対応環境は無視
    }
  }, [selectedEpisode]);

  // 音声再生コントロール関数
  const handleTogglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !selectedEpisode) return;

    if (audio.paused) {
      setIsLoadingAudio(true);
      audio.playbackRate = playbackSpeed;
      audio
        .play()
        .then(() => {
          setIsLoadingAudio(false);
        })
        .catch(() => {
          setIsLoadingAudio(false);
        });
    } else {
      audio.pause();
    }
  }, [selectedEpisode, playbackSpeed]);

  const handleSeek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const clamped = Math.max(0, Math.min(audio.duration || 360, seconds));
    audio.currentTime = clamped;
    setCurrentTime(clamped);
  }, []);

  const handleSeekAndPlay = useCallback(
    (seconds: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      const clamped = Math.max(0, seconds + syncOffset);
      audio.currentTime = clamped;
      setCurrentTime(clamped);
      audio.playbackRate = playbackSpeed;
      audio.play().catch(() => {});
    },
    [playbackSpeed, syncOffset]
  );

  const handleAdjustSyncOffset = useCallback((deltaSeconds: number) => {
    setSyncOffset((prev) => prev + deltaSeconds);
  }, []);

  const handleResetSyncOffset = useCallback(() => {
    setSyncOffset(0);
  }, []);

  const handleSkip = useCallback((delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const maxDur = Number.isFinite(audio.duration) ? audio.duration : 360;
    const next = Math.max(0, Math.min(maxDur, audio.currentTime + delta));
    audio.currentTime = next;
    setCurrentTime(next);
  }, []);

  const handleChangeSpeed = useCallback((speed: PlaybackSpeed) => {
    setPlaybackSpeed(speed);
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = speed;
    }
  }, []);

  // AI文字起こし実行（リクエスト開始時のエピソードID・音声URLと現在選択中のエピソードを厳密に照合）
  const handleGenerateTranscript = useCallback(
    async (forceRegenerate = false) => {
      if (!selectedEpisode) return;

      const reqEpisodeId = selectedEpisode.id;
      const reqAudioUrl = selectedEpisode.audioUrl;
      const reqTitle = selectedEpisode.title;

      if (forceRegenerate) {
        removeCachedTranscript(reqEpisodeId, reqAudioUrl);
        setTranscript(null);
        setCachedEpisodeIds(getCachedEpisodeIdSet(episodes));
      } else {
        const cached = getCachedTranscript(reqEpisodeId, reqAudioUrl);
        if (cached) {
          setTranscript(cached);
          return;
        }
      }

      setTranscribingEpisodeId(reqEpisodeId);
      setTranscribeError(null);

      try {
        const res = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audioUrl: reqAudioUrl,
            episodeTitle: reqTitle,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(
            data.error || "文字起こしの生成中にエラーが発生しました。"
          );
        }

        const transcriptData: TranscriptData = {
          episodeId: reqEpisodeId,
          audioUrl: reqAudioUrl,
          segments: data.segments || [],
          idioms: data.idioms || [],
          updatedAt: new Date().toISOString(),
        };

        // リクエスト対象エピソードのキャッシュとして保存
        setCachedTranscript(reqEpisodeId, reqAudioUrl, transcriptData);
        setCachedEpisodeIds(getCachedEpisodeIdSet(episodes));

        // リクエスト開始時のID・audioUrlと現在選択中のID・audioUrlが一致する場合のみ画面を更新
        const currentEp = selectedEpisodeRef.current;
        if (
          currentEp &&
          currentEp.id === reqEpisodeId &&
          currentEp.audioUrl === reqAudioUrl
        ) {
          setTranscript(transcriptData);
        }
      } catch (e) {
        const currentEp = selectedEpisodeRef.current;
        if (currentEp && currentEp.id === reqEpisodeId) {
          setTranscribeError(
            e instanceof Error
              ? e.message
              : "文字起こし処理に失敗しました。"
          );
        }
      } finally {
        setTranscribingEpisodeId((prev) =>
          prev === reqEpisodeId ? null : prev
        );
      }
    },
    [selectedEpisode, episodes]
  );

  // 自動追従スクロール切替
  const handleToggleAutoScroll = useCallback(() => {
    setAutoScroll((prev) => {
      const next = !prev;
      setAutoScrollPref(next);
      return next;
    });
  }, []);

  // 単語・イディオムをタップして解説を取得
  const fetchWordDefinition = useCallback(
    async (term: string, isIdiom: boolean, segment: TranscriptSegment) => {
      if (!selectedEpisode) return;

      // 前後のセグメントも含めた文脈文字列を作る
      let contextWindow = segment.text;
      if (transcript) {
        const idx = transcript.segments.findIndex((s) => s.id === segment.id);
        if (idx !== -1) {
          const prevText = idx > 0 ? transcript.segments[idx - 1].text : "";
          const nextText =
            idx < transcript.segments.length - 1
              ? transcript.segments[idx + 1].text
              : "";
          contextWindow = [prevText, segment.text, nextText]
            .filter(Boolean)
            .join(" ");
        }
      }

      // キャッシュ確認
      const cached = getCachedDefinition(term, segment.text);
      if (cached) {
        setDefinition(cached);
        setIsDefining(false);
        setDefineError(null);
        return;
      }

      setIsDefining(true);
      setDefineError(null);
      setDefinition(null);

      try {
        const res = await fetch("/api/define", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            term,
            context: contextWindow,
            isIdiom,
            episodeTitle: selectedEpisode.title,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "語句の解説取得に失敗しました。");
        }

        const def: WordDefinition = data;
        setCachedDefinition(term, segment.text, def);
        setDefinition(def);
      } catch (e) {
        setDefineError(
          e instanceof Error
            ? e.message
            : "解説の取得中にエラーが発生しました。"
        );
      } finally {
        setIsDefining(false);
      }
    },
    [selectedEpisode, transcript]
  );

  const handleSelectTerm = useCallback(
    (term: string, isIdiom: boolean, segment: TranscriptSegment) => {
      setSelectedTerm(term);
      setSelectedIsIdiom(isIdiom);
      setSelectedSegment(segment);
      setSheetOpen(true);
      fetchWordDefinition(term, isIdiom, segment);
    },
    [fetchWordDefinition]
  );

  // 現在ボトムシートで開いている語句が単語ノートに保存済みか判定
  const currentSavedEntry = React.useMemo(() => {
    const targetTerm = definition?.term || selectedTerm;
    if (!targetTerm) return undefined;
    return vocabList.find((item) => {
      const t = item.term.toLowerCase();
      const s = item.surfaceTerm?.toLowerCase();
      const defLower = targetTerm.toLowerCase();
      const selLower = selectedTerm.toLowerCase();
      return (
        t === defLower ||
        t === selLower ||
        (s && (s === defLower || s === selLower))
      );
    });
  }, [vocabList, definition, selectedTerm]);

  // ボトムシートのチェックマークボタンで単語ノートへ手動記録／解除
  const handleToggleSaveVocab = useCallback(() => {
    if (!definition || !selectedEpisode || !selectedSegment) return;

    if (currentSavedEntry) {
      const updated = vocabList.filter((v) => v.id !== currentSavedEntry.id);
      setVocabList(updated);
      saveVocabList(updated);
    } else {
      const newEntry: VocabEntry = {
        ...definition,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        surfaceTerm: selectedTerm,
        episodeId: selectedEpisode.id,
        episodeTitle: selectedEpisode.title,
        timestamp: selectedSegment.start,
        contextText: selectedSegment.text,
        mastered: false,
        createdAt: new Date().toISOString(),
      };
      const updated = [newEntry, ...vocabList];
      setVocabList(updated);
      saveVocabList(updated);
    }
  }, [
    definition,
    selectedEpisode,
    selectedSegment,
    selectedTerm,
    currentSavedEntry,
    vocabList,
  ]);

  // 単語ノートでの「未習得／覚えた」切替
  const handleToggleMastered = useCallback(
    (id: string) => {
      const updated = vocabList.map((item) =>
        item.id === id ? { ...item, mastered: !item.mastered } : item
      );
      setVocabList(updated);
      saveVocabList(updated);
    },
    [vocabList]
  );

  // 単語ノートからの削除
  const handleDeleteEntry = useCallback(
    (id: string) => {
      const updated = vocabList.filter((item) => item.id !== id);
      setVocabList(updated);
      saveVocabList(updated);
    },
    [vocabList]
  );

  // 単語ノートから「登場したエピソード＆秒数」へジャンプして再生
  const handleJumpToEpisode = useCallback(
    (episodeId: string, timestamp: number) => {
      setActiveTab("listening");

      if (selectedEpisode && selectedEpisode.id === episodeId) {
        handleSeekAndPlay(timestamp);
        return;
      }

      const targetEp = episodes.find((e) => e.id === episodeId);
      if (targetEp) {
        pendingSeekRef.current = timestamp;
        selectedEpisodeRef.current = targetEp;
        setSelectedEpisode(targetEp);
      } else {
        handleSeekAndPlay(timestamp);
      }
    },
    [selectedEpisode, episodes, handleSeekAndPlay]
  );

  const isCurrentEpisodeTranscribing = Boolean(
    selectedEpisode && transcribingEpisodeId === selectedEpisode.id
  );

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-slate-50 shadow-xl">
      {/* 非表示の標準 <audio> 要素（オリジナルMP3を直接再生） */}
      <audio
        ref={audioRef}
        preload="metadata"
        onTimeUpdate={(e) => {
          setCurrentTime(e.currentTarget.currentTime);
        }}
        onLoadedMetadata={(e) => {
          const dur = e.currentTarget.duration;
          if (Number.isFinite(dur) && dur > 0) {
            setDuration(dur);
          }
          e.currentTarget.playbackRate = playbackSpeed;

          if (pendingSeekRef.current !== null) {
            const seekTarget = Math.max(
              0,
              pendingSeekRef.current + syncOffset
            );
            pendingSeekRef.current = null;
            e.currentTarget.currentTime = seekTarget;
            setCurrentTime(seekTarget);
            e.currentTarget.play().catch(() => {});
          }
        }}
        onDurationChange={(e) => {
          const dur = e.currentTarget.duration;
          if (Number.isFinite(dur) && dur > 0) {
            setDuration(dur);
          }
        }}
        onPlay={() => {
          setIsPlaying(true);
          setIsLoadingAudio(false);
        }}
        onPlaying={() => {
          setIsPlaying(true);
          setIsLoadingAudio(false);
        }}
        onPause={() => {
          setIsPlaying(false);
        }}
        onWaiting={() => {
          setIsLoadingAudio(true);
        }}
        onEnded={() => {
          setIsPlaying(false);
        }}
        onError={() => {
          setIsLoadingAudio(false);
          setIsPlaying(false);
        }}
      />

      {/* 上部ヘッダー（iPhoneノッチSafe Area対応） */}
      <header className="pt-safe sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="flex items-center justify-between px-3.5 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-600 text-white shadow-xs shadow-rose-600/30">
              <Headphones className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-extrabold tracking-tight text-slate-900">
                  6 Minute English
                </h1>
                <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">
                  BBC
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-500">
                リスニング＆AI単語ノート
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsEpisodeModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-rose-50 hover:text-rose-700 active:scale-95"
          >
            <ListMusic className="h-4 w-4 text-rose-600" />
            <span>エピソード一覧</span>
          </button>
        </div>
      </header>

      {/* メインコンテンツ領域 */}
      <main className="flex flex-1 flex-col overflow-y-auto">
        {episodesError ? (
          <div className="m-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
            <div className="mb-1.5 flex items-center gap-1.5 font-bold text-rose-700">
              <AlertCircle className="h-4 w-4" />
              <span>エピソード取得エラー</span>
            </div>
            <p className="mb-3 leading-relaxed">{episodesError}</p>
            <button
              type="button"
              onClick={fetchEpisodes}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 font-bold text-white"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>再読み込み</span>
            </button>
          </div>
        ) : activeTab === "listening" ? (
          <TranscriptView
            episode={selectedEpisode}
            episodesCount={episodes.length}
            transcript={transcript}
            isTranscribing={isCurrentEpisodeTranscribing}
            transcribeError={transcribeError}
            currentTime={currentTime}
            syncOffset={syncOffset}
            autoScroll={autoScroll}
            vocabList={vocabList}
            activeTerm={sheetOpen ? selectedTerm : null}
            onOpenEpisodeModal={() => setIsEpisodeModalOpen(true)}
            onGenerateTranscript={handleGenerateTranscript}
            onToggleAutoScroll={handleToggleAutoScroll}
            onAdjustSyncOffset={handleAdjustSyncOffset}
            onResetSyncOffset={handleResetSyncOffset}
            onSeekAndPlay={handleSeekAndPlay}
            onSelectTerm={handleSelectTerm}
          />
        ) : (
          <VocabNotebookView
            vocabList={vocabList}
            onToggleMastered={handleToggleMastered}
            onDeleteEntry={handleDeleteEntry}
            onJumpToEpisode={handleJumpToEpisode}
          />
        )}
      </main>

      {/* 画面下部固定領域：音声再生コントロール＋下部タブバー */}
      <div className="sticky bottom-0 z-30 flex flex-col">
        {/* 固定オーディオプレーヤー */}
        <AudioPlayerBar
          episodeTitle={selectedEpisode?.title || "6 Minute English"}
          isPlaying={isPlaying}
          isLoadingAudio={isLoadingAudio}
          currentTime={currentTime}
          duration={duration}
          playbackSpeed={playbackSpeed}
          onTogglePlay={handleTogglePlay}
          onSeek={handleSeek}
          onSkip={handleSkip}
          onChangeSpeed={handleChangeSpeed}
        />

        {/* 下部タブバー（リスニング／単語ノート） */}
        <nav
          className="pb-safe border-t border-slate-200 bg-white"
          aria-label="メインナビゲーション"
        >
          <div className="grid grid-cols-2">
            <button
              type="button"
              onClick={() => setActiveTab("listening")}
              className={`flex flex-col items-center justify-center gap-1 py-2 text-xs font-bold transition ${
                activeTab === "listening"
                  ? "text-rose-600"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <Headphones className="h-5 w-5" />
              <span>リスニング</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("vocab")}
              className={`relative flex flex-col items-center justify-center gap-1 py-2 text-xs font-bold transition ${
                activeTab === "vocab"
                  ? "text-rose-600"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <div className="relative">
                <BookMarked className="h-5 w-5" />
                {vocabList.length > 0 && (
                  <span className="absolute -top-1.5 -right-3 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                    {vocabList.length}
                  </span>
                )}
              </div>
              <span>単語ノート</span>
            </button>
          </div>
        </nav>
      </div>

      {/* エピソード選択モーダル */}
      <EpisodeSelectorModal
        isOpen={isEpisodeModalOpen}
        episodes={episodes}
        selectedEpisodeId={selectedEpisode?.id || null}
        cachedEpisodeIds={cachedEpisodeIds}
        isLoading={isLoadingEpisodes}
        onClose={() => setIsEpisodeModalOpen(false)}
        onSelectEpisode={(ep) => {
          selectedEpisodeRef.current = ep;
          setSelectedEpisode(ep);
        }}
        onRefresh={fetchEpisodes}
      />

      {/* 単語・イディオム解説ボトムシート */}
      <WordBottomSheet
        isOpen={sheetOpen}
        selectedTerm={selectedTerm}
        isIdiomHint={selectedIsIdiom}
        contextText={selectedSegment?.text || ""}
        timestamp={selectedSegment?.start || 0}
        definition={definition}
        isLoading={isDefining}
        error={defineError}
        isSaved={Boolean(currentSavedEntry)}
        onClose={() => setSheetOpen(false)}
        onToggleSave={handleToggleSaveVocab}
        onRetry={() => {
          if (selectedSegment && selectedTerm) {
            fetchWordDefinition(
              selectedTerm,
              selectedIsIdiom,
              selectedSegment
            );
          }
        }}
      />
    </div>
  );
}
