"use client";

import React from "react";
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Loader2,
  Repeat,
  Repeat1,
  ListEnd,
} from "lucide-react";
import { PlaybackMode, PlaybackSpeed } from "@/types";
import { formatSeconds } from "@/lib/speech";

interface AudioPlayerBarProps {
  episodeTitle: string;
  isPlaying: boolean;
  isLoadingAudio: boolean;
  currentTime: number;
  duration: number;
  playbackSpeed: PlaybackSpeed;
  playbackMode: PlaybackMode;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onSkip: (deltaSeconds: number) => void;
  onChangeSpeed: (speed: PlaybackSpeed) => void;
  onCyclePlaybackMode: () => void;
}

const SPEEDS: PlaybackSpeed[] = [0.8, 1.0, 1.2, 1.5];

export default function AudioPlayerBar({
  isPlaying,
  isLoadingAudio,
  currentTime,
  duration,
  playbackSpeed,
  playbackMode,
  onTogglePlay,
  onSeek,
  onSkip,
  onChangeSpeed,
  onCyclePlaybackMode,
}: AudioPlayerBarProps) {
  const safeDuration = duration > 0 ? duration : 360;
  const progressPercent = Math.min(
    100,
    Math.max(0, (currentTime / safeDuration) * 100)
  );

  const renderModeLabel = () => {
    if (playbackMode === "loop") {
      return {
        icon: <Repeat1 className="h-3.5 w-3.5" />,
        label: "ループ",
        title: "ループ再生：同じエピソードを繰り返し再生",
        active: true,
      };
    }
    if (playbackMode === "continuous") {
      return {
        icon: <ListEnd className="h-3.5 w-3.5" />,
        label: "連続",
        title: "連続再生：終了時に次のエピソードへ自動進行＆自動文字起こし",
        active: true,
      };
    }
    return {
      icon: <Repeat className="h-3.5 w-3.5" />,
      label: "通常",
      title: "通常再生：エピソード終了で停止",
      active: false,
    };
  };

  const modeInfo = renderModeLabel();

  return (
    <div className="border-t border-slate-200 bg-white/95 px-3 pt-2 pb-2.5 shadow-[0_-4px_16px_rgba(15,23,42,0.06)] backdrop-blur-md">
      {/* シークバー＋時間表示 */}
      <div className="mb-1.5 flex items-center gap-2.5">
        <span className="w-10 text-right font-mono text-[11px] font-medium text-slate-600">
          {formatSeconds(currentTime)}
        </span>
        <div className="relative flex flex-1 items-center">
          <input
            type="range"
            min={0}
            max={safeDuration}
            step={0.1}
            value={Math.min(currentTime, safeDuration)}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            aria-label="再生位置シークバー"
            className="audio-seek z-10 h-4 w-full"
            style={{
              background: `linear-gradient(to right, #e11d48 0%, #e11d48 ${progressPercent}%, #e2e8f0 ${progressPercent}%, #e2e8f0 100%)`,
              height: "6px",
              borderRadius: "9999px",
            }}
          />
        </div>
        <span className="w-10 font-mono text-[11px] font-medium text-slate-500">
          {formatSeconds(duration)}
        </span>
      </div>

      {/* コントロール行：左に再生速度＋再生モード、右に -5秒 / 再生・一時停止 / +5秒 */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1">
          {/* 再生速度切替 (0.8x / 1.0x / 1.2x / 1.5x) */}
          <div
            className="flex items-center rounded-lg bg-slate-100 p-0.5"
            role="group"
            aria-label="再生速度"
          >
            {SPEEDS.map((spd) => {
              const active = playbackSpeed === spd;
              return (
                <button
                  key={spd}
                  type="button"
                  onClick={() => onChangeSpeed(spd)}
                  className={`rounded-md px-1.5 py-1 text-[11px] font-semibold transition-all ${
                    active
                      ? "bg-rose-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {spd.toFixed(1)}x
                </button>
              );
            })}
          </div>

          {/* 再生モード切替ボタン（通常 -> ループ -> 連続） */}
          <button
            type="button"
            onClick={onCyclePlaybackMode}
            title={modeInfo.title}
            aria-label={modeInfo.title}
            className={`inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-bold transition active:scale-95 ${
              modeInfo.active
                ? "bg-rose-600 text-white shadow-2xs"
                : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
            }`}
          >
            {modeInfo.icon}
            <span>{modeInfo.label}</span>
          </button>
        </div>

        {/* -5秒 / 再生・一時停止 / +5秒 */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onSkip(-5)}
            className="flex h-9 items-center gap-0.5 rounded-full border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 transition active:scale-95 active:bg-slate-200"
            aria-label="5秒戻す"
          >
            <RotateCcw className="h-3.5 w-3.5 text-slate-600" />
            <span>-5秒</span>
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-600 text-white shadow-sm shadow-rose-600/30 transition hover:bg-rose-700 active:scale-95"
            aria-label={isPlaying ? "一時停止" : "再生"}
          >
            {isLoadingAudio ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : isPlaying ? (
              <Pause className="h-5 w-5 fill-current" />
            ) : (
              <Play className="ml-0.5 h-5 w-5 fill-current" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onSkip(5)}
            className="flex h-9 items-center gap-0.5 rounded-full border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 transition active:scale-95 active:bg-slate-200"
            aria-label="5秒進める"
          >
            <span>+5秒</span>
            <RotateCw className="h-3.5 w-3.5 text-slate-600" />
          </button>
        </div>
      </div>
    </div>
  );
}
