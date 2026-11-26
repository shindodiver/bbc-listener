/**
 * Web Speech API を使用してイギリス英語 (en-GB) で語句や例文を発音再生する
 */
export function speakBritishEnglish(text: string, rate = 0.92): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return;
  }

  const cleaned = text.trim();
  if (!cleaned) return;

  try {
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(cleaned);
    utterance.lang = "en-GB";
    utterance.rate = rate;

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      // en-GB の音声を優先的に選択（iOS Safari の Daniel / Martha / Arthur 等を含む）
      const gbVoice =
        voices.find(
          (v) =>
            v.lang.toLowerCase().replace("_", "-") === "en-gb" &&
            (v.name.includes("Daniel") ||
              v.name.includes("Martha") ||
              v.name.includes("Serena") ||
              v.name.includes("UK"))
        ) ||
        voices.find((v) =>
          v.lang.toLowerCase().replace("_", "-").startsWith("en-gb")
        ) ||
        voices.find((v) => v.lang.toLowerCase().startsWith("en"));

      if (gbVoice) {
        utterance.voice = gbVoice;
      }
    }

    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.warn("音声合成の再生に失敗しました:", e);
  }
}

/**
 * 秒数を mm:ss 形式にフォーマットする
 */
export function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
}

/**
 * RSSのpubDateを日本語表示用の日付（YYYY/MM/DD）に変換する
 */
export function formatDateJa(pubDate: string): string {
  if (!pubDate) return "";
  try {
    const d = new Date(pubDate);
    if (Number.isNaN(d.getTime())) return pubDate;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}/${mm}/${dd}`;
  } catch {
    return pubDate;
  }
}
