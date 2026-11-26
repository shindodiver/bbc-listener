"use client";

import React from "react";
import {
  X,
  Volume2,
  Check,
  Square,
  CheckSquare,
  Loader2,
  AlertCircle,
  BookOpen,
  Quote,
  Sparkles,
} from "lucide-react";
import { WordDefinition } from "@/types";
import { speakBritishEnglish, formatSeconds } from "@/lib/speech";

interface WordBottomSheetProps {
  isOpen: boolean;
  selectedTerm: string;
  isIdiomHint: boolean;
  contextText: string;
  timestamp: number;
  definition: WordDefinition | null;
  isLoading: boolean;
  error: string | null;
  isSaved: boolean;
  onClose: () => void;
  onToggleSave: () => void;
  onRetry: () => void;
}

export default function WordBottomSheet({
  isOpen,
  selectedTerm,
  isIdiomHint,
  contextText,
  timestamp,
  definition,
  isLoading,
  error,
  isSaved,
  onClose,
  onToggleSave,
  onRetry,
}: WordBottomSheetProps) {
  if (!isOpen) return null;

  const displayTerm = definition?.term || selectedTerm;
  const displayIsIdiom = definition?.isIdiom ?? isIdiomHint;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* 背景オーバーレイ */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px] transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* ボトムシート本体 */}
      <div className="relative z-10 mx-auto flex max-h-[82dvh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-2xl">
        {/* ドラッグハンドル風バー */}
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="h-1.5 w-10 rounded-full bg-slate-200" />
        </div>

        {/* ヘッダー：語句・発音記号・発音ボタン・閉じる */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 pt-2 pb-3.5">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold ${
                  displayIsIdiom
                    ? "bg-rose-100 text-rose-700"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {definition?.pos || (displayIsIdiom ? "イディオム" : "単語")}
              </span>
              {displayIsIdiom && (
                <span className="inline-flex items-center rounded-md border border-dashed border-rose-300 bg-rose-50/60 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                  熟語・イディオム
                </span>
              )}
              <span className="text-[11px] font-medium text-slate-400">
                登場位置 {formatSeconds(timestamp)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <h3 className="truncate text-xl font-bold tracking-tight text-slate-900">
                {displayTerm}
              </h3>
              <button
                type="button"
                onClick={() => speakBritishEnglish(displayTerm)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600 transition hover:bg-rose-100 active:scale-95"
                aria-label="イギリス英語で発音を再生"
                title="発音を再生 (en-GB)"
              >
                <Volume2 className="h-4 w-4" />
              </button>
            </div>

            {definition?.phonetic && (
              <p className="mt-0.5 font-mono text-xs text-slate-500">
                {definition.phonetic}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="閉じる"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* コンテンツ領域（スクロール可能） */}
        <div className="flex-1 overflow-y-auto px-4 py-3.5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Loader2 className="mb-2.5 h-7 w-7 animate-spin text-rose-600" />
              <p className="text-sm font-semibold text-slate-700">
                文脈に合わせてAIが解説を生成中...
              </p>
              <p className="mt-1 text-xs text-slate-400">
                一度調べた語句は次回から即座に表示されます
              </p>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <div className="mb-1.5 flex items-center gap-1.5 font-bold text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>解説の取得に失敗しました</span>
              </div>
              <p className="mb-3 text-xs leading-relaxed text-rose-700">
                {error}
              </p>
              <button
                type="button"
                onClick={onRetry}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700"
              >
                再試行する
              </button>
            </div>
          ) : definition ? (
            <div className="space-y-3.5">
              {/* 日本語訳 */}
              <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3.5">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-rose-600">
                  <BookOpen className="h-3.5 w-3.5" />
                  <span>日本語の意味（文脈に即した訳）</span>
                </div>
                <p className="text-base font-bold text-slate-900">
                  {definition.meaningJa}
                </p>
              </div>

              {/* 使われ方・ニュアンス */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                  <Sparkles className="h-3.5 w-3.5 text-rose-500" />
                  <span>使われ方・ニュアンス</span>
                </div>
                <p className="text-xs leading-relaxed text-slate-700">
                  {definition.usage}
                </p>
              </div>

              {/* 例文 */}
              <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                    <Quote className="h-3.5 w-3.5 text-rose-500" />
                    <span>実用的な例文</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => speakBritishEnglish(definition.exampleEn, 0.95)}
                    className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-200"
                  >
                    <Volume2 className="h-3 w-3 text-rose-600" />
                    <span>例文を発音</span>
                  </button>
                </div>
                <p className="text-xs font-medium leading-relaxed text-slate-900">
                  {definition.exampleEn}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  {definition.exampleJa}
                </p>
              </div>

              {/* エピソード内の元の文脈 */}
              {contextText && (
                <div className="rounded-lg bg-slate-100/80 px-3 py-2 text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-600">
                    エピソード内の文脈:{" "}
                  </span>
                  <span className="italic">{contextText}</span>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* フッター：手動チェックマーク記録ボタン */}
        <div className="pb-safe border-t border-slate-100 bg-white px-4 pt-3 pb-4">
          <button
            type="button"
            disabled={isLoading || !definition}
            onClick={onToggleSave}
            className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 ${
              isSaved
                ? "bg-rose-600 text-white shadow-sm shadow-rose-600/25 hover:bg-rose-700"
                : "border-2 border-rose-600 bg-white text-rose-600 hover:bg-rose-50"
            }`}
          >
            {isSaved ? (
              <>
                <CheckSquare className="h-5 w-5" />
                <span>記録済み（タップで単語ノートから解除）</span>
              </>
            ) : (
              <>
                <Square className="h-5 w-5" />
                <span>単語ノートに記録</span>
              </>
            )}
          </button>
          <p className="mt-1.5 text-center text-[11px] text-slate-400">
            チェックを付けた語句のみ単語ノートに保存され、本文中でハイライトされます
          </p>
        </div>
      </div>
    </div>
  );
}
