"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Sparkles,
  Loader2,
  Play,
  LocateFixed,
  RefreshCw,
  Calendar,
  Clock,
  AlertCircle,
  CheckCircle2,
  BookOpen,
  User,
} from "lucide-react";
import {
  Episode,
  TranscriptData,
  TranscriptSegment,
  VocabEntry,
} from "@/types";
import { formatDateJa, formatSeconds } from "@/lib/speech";
import { tokenizeSegmentText } from "@/lib/tokenize";

interface TranscriptViewProps {
  episode: Episode | null;
  episodesCount: number;
  transcript: TranscriptData | null;
  isTranscribing: boolean;
  transcribeError: string | null;
  currentTime: number;
  autoScroll: boolean;
  vocabList: VocabEntry[];
  activeTerm: string | null;
  onOpenEpisodeModal: () => void;
  onGenerateTranscript: (forceRegenerate?: boolean) => void;
  onToggleAutoScroll: () => void;
  onSeekAndPlay: (seconds: number) => void;
  onSelectTerm: (
    term: string,
    isIdiom: boolean,
    segment: TranscriptSegment
  ) => void;
}

export default function TranscriptView({
  episode,
  episodesCount,
  transcript,
  isTranscribing,
  transcribeError,
  currentTime,
  autoScroll,
  vocabList,
  activeTerm,
  onOpenEpisodeModal,
  onGenerateTranscript,
  onToggleAutoScroll,
  onSeekAndPlay,
  onSelectTerm,
}: TranscriptViewProps) {
  const [showDesc, setShowDesc] = useState(false);
  const [showIdiomsList, setShowIdiomsList] = useState(true);
  const segmentRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // 現在の再生位置に該当するセグメントを特定
  const activeSegmentId = React.useMemo(() => {
    if (!transcript || transcript.segments.length === 0) return null;
    const segs = transcript.segments;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const nextStart = i < segs.length - 1 ? segs[i + 1].start : seg.end + 5;
      if (currentTime >= seg.start && currentTime < Math.max(seg.end, nextStart)) {
        return seg.id;
      }
    }
    return null;
  }, [transcript, currentTime]);

  // 自動追従スクロール
  useEffect(() => {
    if (!autoScroll || !activeSegmentId) return;
    const el = segmentRefs.current.get(activeSegmentId);
    if (el) {
      el.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeSegmentId, autoScroll]);

  if (!episode) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <p className="text-sm text-slate-500">
          エピソードを読み込んでいます...
        </p>
      </div>
    );
  }

  // イディオムチップをタップしたときに該当セグメントを探して解説を開く
  const handleTapIdiomChip = (idiom: string) => {
    if (!transcript) return;
    const lower = idiom.toLowerCase();
    const matchedSeg =
      transcript.segments.find((s) => s.text.toLowerCase().includes(lower)) ||
      transcript.segments[0];

    if (matchedSeg) {
      onSelectTerm(idiom, true, matchedSeg);
    }
  };

  return (
    <div className="flex flex-col gap-3 px-3 pt-3 pb-8">
      {/* エピソード情報カード */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={onOpenEpisodeModal}
            className="group flex min-w-0 flex-1 items-start justify-between gap-2 rounded-xl bg-slate-50 p-2.5 text-left transition hover:bg-rose-50/60 active:bg-rose-100/50"
          >
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
                <span className="rounded-md bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  選択中のエピソード
                </span>
                {episode.pubDate && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-slate-400" />
                    {formatDateJa(episode.pubDate)}
                  </span>
                )}
                {episode.duration && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3 text-slate-400" />
                    {episode.duration}
                  </span>
                )}
              </div>
              <h2 className="text-base font-bold leading-snug text-slate-900 group-hover:text-rose-700">
                {episode.title}
              </h2>
            </div>

            <div className="mt-1 flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-2xs">
              <span>全{episodesCount}件</span>
              <ChevronDown className="h-3.5 w-3.5 text-rose-600" />
            </div>
          </button>
        </div>

        {/* 概要の開閉＆自動追従トグル */}
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
          <button
            type="button"
            onClick={() => setShowDesc((prev) => !prev)}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            {showDesc ? (
              <>
                <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
                <span>エピソード概要を閉じる</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                <span>エピソード概要を表示</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-1.5">
            {transcript && (
              <button
                type="button"
                onClick={() => onGenerateTranscript(true)}
                disabled={isTranscribing}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                title="AI文字起こしを再生成"
              >
                <RefreshCw
                  className={`h-3 w-3 ${isTranscribing ? "animate-spin" : ""}`}
                />
                <span>再生成</span>
              </button>
            )}

            <button
              type="button"
              onClick={onToggleAutoScroll}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                autoScroll
                  ? "bg-rose-600 text-white shadow-2xs"
                  : "border border-slate-200 bg-slate-100 text-slate-600"
              }`}
            >
              <LocateFixed className="h-3 w-3" />
              <span>自動追従 {autoScroll ? "ON" : "OFF"}</span>
            </button>
          </div>
        </div>

        {showDesc && episode.description && (
          <p className="mt-2 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
            {episode.description}
          </p>
        )}
      </div>

      {/* 文字起こし未生成時の生成カード */}
      {!transcript && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-xs">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            {isTranscribing ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <Sparkles className="h-6 w-6" />
            )}
          </div>

          <h3 className="text-base font-bold text-slate-900">
            {isTranscribing
              ? "AI文字起こし＆イディオム抽出を実行中..."
              : "AI文字起こしを生成する"}
          </h3>

          <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-slate-500">
            {isTranscribing
              ? "BBCのオリジナルMP3音声をGemini 3.8 Flashで解析しています。完了まで20〜45秒ほどお待ちください。"
              : "音声からタイムスタンプ付き英文スクリプトと重要イディオムを自動抽出します。一度生成すると端末に保存され、次回から即座に表示されます。"}
          </p>

          {transcribeError && (
            <div className="mt-3.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-left text-xs text-rose-800">
              <div className="mb-1 flex items-center gap-1.5 font-bold text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>エラーが発生しました</span>
              </div>
              <p className="leading-relaxed">{transcribeError}</p>
            </div>
          )}

          <button
            type="button"
            onClick={() => onGenerateTranscript(false)}
            disabled={isTranscribing}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white shadow-sm shadow-rose-600/25 transition hover:bg-rose-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isTranscribing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>音声を解析中...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>AI文字起こしを開始</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* 文字起こし完了後の表示 */}
      {transcript && (
        <>
          {/* 抽出された重要イディオム一覧バー */}
          {transcript.idioms.length > 0 && (
            <div className="rounded-2xl border border-rose-100 bg-rose-50/40 p-3">
              <button
                type="button"
                onClick={() => setShowIdiomsList((prev) => !prev)}
                className="flex w-full items-center justify-between text-left"
              >
                <div className="flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4 text-rose-600" />
                  <span className="text-xs font-bold text-slate-800">
                    このエピソードの重要イディオム ({transcript.idioms.length})
                  </span>
                </div>
                {showIdiomsList ? (
                  <ChevronUp className="h-4 w-4 text-slate-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                )}
              </button>

              {showIdiomsList && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {transcript.idioms.map((idiom) => {
                    const isSaved = vocabList.some(
                      (v) =>
                        v.term.toLowerCase() === idiom.toLowerCase() ||
                        v.surfaceTerm?.toLowerCase() === idiom.toLowerCase()
                    );
                    return (
                      <button
                        key={idiom}
                        type="button"
                        onClick={() => handleTapIdiomChip(idiom)}
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition active:scale-95 ${
                          isSaved
                            ? "bg-rose-600 text-white shadow-2xs"
                            : "border border-dashed border-rose-300 bg-white text-rose-700 hover:bg-rose-50"
                        }`}
                      >
                        <span>{idiom}</span>
                        {isSaved && <CheckCircle2 className="h-3 w-3" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* タップ操作ガイド */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-slate-500">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block border-b-2 border-dashed border-rose-500 font-semibold text-rose-700">
                  破線下線
                </span>
                <span>= イディオム</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block rounded bg-rose-100 px-1 font-semibold text-rose-800 underline decoration-rose-500 decoration-2">
                  実線ハイライト
                </span>
                <span>= ノート記録済</span>
              </span>
            </div>
            <span>単語タップで辞書解説</span>
          </div>

          {/* セグメント一覧 */}
          <div className="space-y-2.5">
            {transcript.segments.map((seg) => {
              const isActive = seg.id === activeSegmentId;
              const tokens = tokenizeSegmentText(
                seg.text,
                transcript.idioms,
                vocabList
              );

              return (
                <div
                  key={seg.id}
                  ref={(el) => {
                    if (el) {
                      segmentRefs.current.set(seg.id, el);
                    } else {
                      segmentRefs.current.delete(seg.id);
                    }
                  }}
                  className={`rounded-2xl border p-3.5 transition-all ${
                    isActive
                      ? "border-rose-300 bg-rose-50/70 shadow-sm ring-1 ring-rose-200"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  {/* セグメントヘッダー：タイムスタンプシークボタン＆話者名 */}
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSeekAndPlay(seg.start)}
                        className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-mono text-xs font-bold transition active:scale-95 ${
                          isActive
                            ? "bg-rose-600 text-white shadow-2xs"
                            : "bg-slate-100 text-slate-700 hover:bg-rose-100 hover:text-rose-700"
                        }`}
                        aria-label={`${formatSeconds(seg.start)} から再生`}
                        title="この位置から再生"
                      >
                        <Play className="h-3 w-3 fill-current" />
                        <span>{formatSeconds(seg.start)}</span>
                      </button>

                      {seg.speaker && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-600">
                          <User className="h-3 w-3 text-slate-400" />
                          {seg.speaker}
                        </span>
                      )}
                    </div>

                    {isActive && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                        再生中
                      </span>
                    )}
                  </div>

                  {/* セグメント本文（イディオム・単語タップ可能） */}
                  <p className="text-[15px] leading-7 text-slate-800">
                    {tokens.map((token, idx) => {
                      if (token.type === "other") {
                        return <span key={idx}>{token.text}</span>;
                      }

                      const isSelectedToken =
                        activeTerm &&
                        (activeTerm.toLowerCase() ===
                          token.text.toLowerCase() ||
                          (token.canonicalIdiom &&
                            activeTerm.toLowerCase() ===
                              token.canonicalIdiom.toLowerCase()));

                      if (token.type === "idiom") {
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() =>
                              onSelectTerm(
                                token.canonicalIdiom || token.text,
                                true,
                                seg
                              )
                            }
                            className={`inline rounded px-0.5 font-semibold transition ${
                              isSelectedToken
                                ? "bg-rose-600 text-white"
                                : token.isSaved
                                ? "border-b-2 border-rose-600 bg-rose-100/90 text-rose-900"
                                : "border-b-2 border-dashed border-rose-500 text-rose-800 hover:bg-rose-100/70 active:bg-rose-200"
                            }`}
                          >
                            {token.text}
                          </button>
                        );
                      }

                      // 通常の単語
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() =>
                            onSelectTerm(token.text, false, seg)
                          }
                          className={`inline rounded px-0.5 transition ${
                            isSelectedToken
                              ? "bg-rose-600 font-semibold text-white"
                              : token.isSaved
                              ? "bg-rose-100/80 font-semibold text-rose-900 underline decoration-rose-500 decoration-2 underline-offset-4"
                              : "hover:bg-rose-100/60 active:bg-rose-200/80"
                          }`}
                        >
                          {token.text}
                        </button>
                      );
                    })}
                  </p>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
