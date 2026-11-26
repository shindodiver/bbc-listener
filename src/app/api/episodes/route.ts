import { NextResponse } from "next/server";
import { Episode } from "@/types";

const BBC_RSS_URL = "https://podcasts.files.bbci.co.uk/p02pc9tn.rss";

function decodeHtmlEntities(input: string): string {
  if (!input) return "";
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

function stripHtmlTags(input: string): string {
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTag(xmlBlock: string, tagName: string): string {
  const regex = new RegExp(
    `<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`,
    "i"
  );
  const match = regex.exec(xmlBlock);
  if (!match) return "";
  return decodeHtmlEntities(match[1].trim());
}

function extractEnclosureUrl(xmlBlock: string): string {
  const regex = /<enclosure[^>]*\burl=["']([^"']+)["'][^>]*>/i;
  const match = regex.exec(xmlBlock);
  return match ? decodeHtmlEntities(match[1].trim()) : "";
}

function formatDuration(rawDuration: string): string | undefined {
  if (!rawDuration) return undefined;
  const trimmed = rawDuration.trim();
  if (/^\d+$/.test(trimmed)) {
    const totalSec = parseInt(trimmed, 10);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  }
  return trimmed;
}

function parseBbcRss(xml: string, limit = 20): Episode[] {
  const itemRegex = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi;
  const episodes: Episode[] = [];
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null && episodes.length < limit) {
    const itemXml = match[1];
    const audioUrl = extractEnclosureUrl(itemXml);
    if (!audioUrl) continue;

    const guid = extractTag(itemXml, "guid") || audioUrl;
    const title = extractTag(itemXml, "title") || "6 Minute English";
    const pubDate = extractTag(itemXml, "pubDate") || "";
    const rawDesc =
      extractTag(itemXml, "description") ||
      extractTag(itemXml, "itunes:summary") ||
      "";
    const description = stripHtmlTags(rawDesc);
    const rawDuration = extractTag(itemXml, "itunes:duration");

    episodes.push({
      id: guid,
      title,
      pubDate,
      description,
      audioUrl,
      duration: formatDuration(rawDuration),
    });
  }

  return episodes;
}

export async function GET() {
  try {
    const response = await fetch(BBC_RSS_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      next: { revalidate: 1800 },
    });

    if (!response.ok) {
      throw new Error(`RSSフィードの取得に失敗しました (HTTP ${response.status})`);
    }

    const xml = await response.text();
    const episodes = parseBbcRss(xml, 20);

    if (episodes.length === 0) {
      throw new Error("RSSフィードからエピソードを解析できませんでした。");
    }

    return NextResponse.json({ episodes });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "RSSフィードの取得中にエラーが発生しました。";
    return NextResponse.json({ error: message, episodes: [] }, { status: 500 });
  }
}
