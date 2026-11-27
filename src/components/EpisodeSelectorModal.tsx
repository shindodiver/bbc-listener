"use client";

import React, { useState } from "react";
import {
  X,
  RefreshCw,
  CheckCircle2,
  Calendar,
  Clock,
  Radio,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { Episode } from "@/types";
import { formatDateJa } from "@/lib/speech";

interface EpisodeSelectorModalProps {
  isOpen: boolean;
  episodes: Episode[];
  selectedEpisodeId: string | null;
  cachedEpisodeIds: Set<string>;
  isLoading: boolean;
  onClose: () => void;
  onSelectEpisode: (episode: Episode) => void;
  onRefresh: () => void;
}

const PAGE_SIZE = 15;

export default function EpisodeSelectorModal({
  isOpen,
  episodes,
  selectedEpisodeId,
  cachedEpisodeIds,
  isLoading,
  onClose,
  onSelectEpisode,
  onRefresh,
}: EpisodeSelectorModalProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  if (!isOpen) return null;

  const visibleEpisodes = episodes.slice(0, visibleCount);
  const remainingCount = Math.max(0, episodes.length - visibleCount);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* オーバーレイ */}
      <div
        className="fixed inset-0 bg-slate-900/45 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* シート本体 */}
      <div className="relative z-10 mx-auto flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-2xl">
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="h-1.5 w-10 rounded-full bg-slate-200" />
        </div>

        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-rose-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900">
                エピソードを選択（最大{episodes.length || 50}件）
              </h2>
              <p className="text-[11px] text-slate-500">
                BBC公式RSSフィードから自動取得（表示中: {visibleEpisodes.length}
                /{episodes.length}件）
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100 active:scale-95 disabled:opacity-50"
              aria-label="最新エピソードを取得（更新）"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
              />
              <span>最新を取得</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="閉じる"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* エピソード一覧 */}
        <div className="pb-safe flex-1 overflow-y-auto px-3 py-2">
          {isLoading && episodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Loader2 className="mb-2 h-7 w-7 animate-spin text-rose-600" />
              <p className="text-sm font-semibold text-slate-700">
                エピソード一覧を取得中...
              </p>
            </div>
          ) : episodes.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              エピソードが見つかりませんでした。
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {visibleEpisodes.map((ep, index) => {
                const isSelected = ep.id === selectedEpisodeId;
                const isCached = cachedEpisodeIds.has(ep.id);
                return (
                  <button
                    key={ep.id}
                    type="button"
                    onClick={() => {
                      onSelectEpisode(ep);
                      onClose();
                    }}
                    className={`flex w-full flex-col rounded-xl p-3 text-left transition ${
                      isSelected
                        ? "bg-rose-50/90 ring-1 ring-rose-200"
                        : "hover:bg-slate-50 active:bg-slate-100"
                    }`}
                  >
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
                        <span className="rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                          #{index + 1}
                        </span>
                        {ep.pubDate && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-slate-400" />
                            {formatDateJa(ep.pubDate)}
                          </span>
                        )}
                        {ep.duration && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3 text-slate-400" />
                            {ep.duration}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {isCached && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                            <CheckCircle2 className="h-3 w-3" />
                            文字起こし済
                          </span>
                        )}
                        {isSelected && (
                          <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">
                            選択中
                          </span>
                        )}
                      </div>
                    </div>

                    <h3
                      className={`text-sm font-bold leading-snug ${
                        isSelected ? "text-rose-700" : "text-slate-900"
                      }`}
                    >
                      {ep.title}
                    </h3>

                    {ep.description && (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                        {ep.description}
                      </p>
                    )}
                  </button>
                );
              })}

              {/* さらに表示ボタン */}
              {remainingCount > 0 && (
                <div className="pt-3 pb-2">
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleCount((prev) =>
                        Math.min(episodes.length, prev + PAGE_SIZE)
                      )
                    }
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-rose-50 hover:text-rose-700 active:scale-[0.99]"
                  >
                    <ChevronDown className="h-4 w-4 text-rose-600" />
                    <span>
                      さらに表示（残り {remainingCount} 件のエピソード）
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
