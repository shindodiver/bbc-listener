"use client";

import React, { useMemo, useState } from "react";
import {
  Search,
  X,
  Eye,
  EyeOff,
  Volume2,
  Trash2,
  CheckCircle2,
  Circle,
  PlayCircle,
  BookMarked,
  Sparkles,
  Quote,
} from "lucide-react";
import { VocabEntry, VocabFilter } from "@/types";
import { formatSeconds, speakBritishEnglish } from "@/lib/speech";

interface VocabNotebookViewProps {
  vocabList: VocabEntry[];
  onToggleMastered: (id: string) => void;
  onDeleteEntry: (id: string) => void;
  onJumpToEpisode: (episodeId: string, timestamp: number) => void;
}

export default function VocabNotebookView({
  vocabList,
  onToggleMastered,
  onDeleteEntry,
  onJumpToEpisode,
}: VocabNotebookViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<VocabFilter>("all");
  const [hideMeaningMode, setHideMeaningMode] = useState(false);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  const toggleHideMeaningMode = () => {
    setHideMeaningMode((prev) => !prev);
    setRevealedIds(new Set());
  };

  const toggleRevealCard = (id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const counts = useMemo(() => {
    const all = vocabList.length;
    const mastered = vocabList.filter((v) => v.mastered).length;
    const unlearned = all - mastered;
    return { all, unlearned, mastered };
  }, [vocabList]);

  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return vocabList.filter((item) => {
      if (filter === "unlearned" && item.mastered) return false;
      if (filter === "mastered" && !item.mastered) return false;

      if (!q) return true;
      return (
        item.term.toLowerCase().includes(q) ||
        (item.surfaceTerm && item.surfaceTerm.toLowerCase().includes(q)) ||
        item.meaningJa.toLowerCase().includes(q) ||
        item.usage.toLowerCase().includes(q) ||
        item.exampleEn.toLowerCase().includes(q) ||
        item.episodeTitle.toLowerCase().includes(q)
      );
    });
  }, [vocabList, filter, searchQuery]);

  return (
    <div className="flex flex-col gap-3 px-3 pt-3 pb-8">
      {/* 検索バー＆フィルター・復習モード切替カード */}
      <div className="sticky top-0 z-20 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xs backdrop-blur-md">
        {/* 検索入力 */}
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="単語・イディオム・意味・エピソード名で検索..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pr-9 pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-rose-500 focus:bg-white focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
              aria-label="検索をクリア"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* フィルター（すべて／未習得／覚えた）＋「意味を隠す」復習モード */}
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <div
            className="flex items-center rounded-xl bg-slate-100 p-0.5"
            role="tablist"
            aria-label="習得状況フィルター"
          >
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                filter === "all"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              すべて ({counts.all})
            </button>
            <button
              type="button"
              onClick={() => setFilter("unlearned")}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                filter === "unlearned"
                  ? "bg-white text-rose-600 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              未習得 ({counts.unlearned})
            </button>
            <button
              type="button"
              onClick={() => setFilter("mastered")}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                filter === "mastered"
                  ? "bg-white text-emerald-700 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              覚えた ({counts.mastered})
            </button>
          </div>

          <button
            type="button"
            onClick={toggleHideMeaningMode}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition active:scale-95 ${
              hideMeaningMode
                ? "bg-rose-600 text-white shadow-2xs"
                : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
            }`}
          >
            {hideMeaningMode ? (
              <>
                <EyeOff className="h-3.5 w-3.5" />
                <span>意味を隠す ON</span>
              </>
            ) : (
              <>
                <Eye className="h-3.5 w-3.5 text-slate-500" />
                <span>意味を隠す</span>
              </>
            )}
          </button>
        </div>

        {hideMeaningMode && (
          <p className="mt-2 text-center text-[11px] font-medium text-rose-600">
            復習モード中：ぼかし部分をタップすると日本語訳が表示されます
          </p>
        )}
      </div>

      {/* 単語カード一覧 */}
      {vocabList.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            <BookMarked className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">
            単語ノートにはまだ語句が記録されていません
          </h3>
          <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-slate-500">
            「リスニング」タブで文字起こし内の単語やイディオムをタップし、下部シートの「単語ノートに記録」にチェックを付けるとここに保存されます。
          </p>
        </div>
      ) : filteredList.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-xs text-slate-500">
          条件に一致する語句が見つかりませんでした。
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredList.map((entry) => {
            const isBlurred = hideMeaningMode && !revealedIds.has(entry.id);

            return (
              <div
                key={entry.id}
                className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs transition hover:border-slate-300"
              >
                {/* カード上部：品詞・語句・発音・習得ボタン・削除ボタン */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                          entry.isIdiom
                            ? "bg-rose-100 text-rose-700"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {entry.pos || (entry.isIdiom ? "イディオム" : "単語")}
                      </span>
                      {entry.isIdiom && (
                        <span className="rounded-md border border-dashed border-rose-300 bg-rose-50/70 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                          熟語
                        </span>
                      )}
                      {entry.phonetic && (
                        <span className="font-mono text-xs text-slate-400">
                          {entry.phonetic}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-slate-900">
                        {entry.term}
                      </h3>
                      <button
                        type="button"
                        onClick={() => speakBritishEnglish(entry.term)}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600 transition hover:bg-rose-100 active:scale-95"
                        aria-label="発音を再生"
                        title="発音を再生 (en-GB)"
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* 習得トグル＆削除ボタン */}
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onToggleMastered(entry.id)}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition active:scale-95 ${
                        entry.mastered
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {entry.mastered ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          <span>覚えた</span>
                        </>
                      ) : (
                        <>
                          <Circle className="h-3.5 w-3.5 text-slate-400" />
                          <span>未習得</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteEntry(entry.id)}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                      aria-label="単語ノートから削除"
                      title="削除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* 意味・ニュアンス・例文（「意味を隠す」モード時はタップでぼかし解除） */}
                <div
                  onClick={() => {
                    if (hideMeaningMode) {
                      toggleRevealCard(entry.id);
                    }
                  }}
                  className={`relative mt-2.5 rounded-xl border border-slate-100 bg-slate-50/70 p-3 transition ${
                    hideMeaningMode ? "cursor-pointer" : ""
                  }`}
                >
                  <div
                    className={`space-y-2 transition-all duration-200 ${
                      isBlurred ? "blur-md select-none" : ""
                    }`}
                  >
                    <p className="text-sm font-bold text-slate-900">
                      {entry.meaningJa}
                    </p>

                    {entry.usage && (
                      <p className="flex items-start gap-1.5 text-xs leading-relaxed text-slate-600">
                        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
                        <span>{entry.usage}</span>
                      </p>
                    )}

                    {entry.exampleEn && (
                      <div className="rounded-lg bg-white p-2.5 text-xs ring-1 ring-slate-200/70">
                        <div className="flex items-start justify-between gap-2">
                          <p className="flex items-start gap-1.5 font-medium text-slate-800">
                            <Quote className="mt-0.5 h-3 w-3 shrink-0 text-rose-500" />
                            <span>{entry.exampleEn}</span>
                          </p>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              speakBritishEnglish(entry.exampleEn, 0.95);
                            }}
                            className="shrink-0 rounded p-1 text-rose-600 hover:bg-rose-50"
                            aria-label="例文を発音"
                          >
                            <Volume2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {entry.exampleJa && (
                          <p className="mt-1 pl-4 text-slate-500">
                            {entry.exampleJa}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {isBlurred && (
                    <div className=" inset-0 absolute flex items-center justify-center rounded-xl bg-white/30">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/80 px-3 py-1.5 text-xs font-bold text-white shadow-sm">
                        <Eye className="h-3.5 w-3.5" />
                        <span>タップで意味を表示</span>
                      </span>
                    </div>
                  )}
                </div>

                {/* カード下部：登場したエピソード＆秒数へジャンプして再生するボタン */}
                <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                  <div className="min-w-0 flex-1 truncate text-[11px] text-slate-500">
                    <span className="font-medium text-slate-600">
                      {entry.episodeTitle}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      onJumpToEpisode(entry.episodeId, entry.timestamp)
                    }
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 transition hover:bg-rose-100 active:scale-95"
                  >
                    <PlayCircle className="h-3.5 w-3.5 text-rose-600" />
                    <span>{formatSeconds(entry.timestamp)} から再生</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
