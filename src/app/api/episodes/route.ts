export const preferredRegion = "hnd1";

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

function extractTagFromItem(itemXml: string, tagName: string): string {
  const escapedTag = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `<${escapedTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedTag}>`,
    "i"
  );
  const match = regex.exec(itemXml);
  if (!match) return "";
  return decodeHtmlEntities(match[1].trim());
}

function extractEnclosureUrlFromItem(itemXml: string): string {
  const regex = /<enclosure\b[^>]*?\burl=["']([^"']+)["'][^>]*>/i;
  const match = regex.exec(itemXml);
  if (!match) return "";
  const rawUrl = decodeHtmlEntities(match[1].trim());
  // http:// の場合は https:// に統一してリダイレクト・Mixed Content問題を防止
  return rawUrl.replace(/^http:\/\//i, "https://");
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

/**
 * 必ず <item>...</item> ブロック単位で分割してから、
 * 各 <item> ブロックの内部だけで title, guid, pubDate, description, enclosure url を抽出する。
 * これにより <channel> 直下の <title> や <description> とインデックスが絶対にズレない。
 */
function parseBbcRss(xml: string, limit = 20): Episode[] {
  const rawBlocks = xml.split(/<item(?:\s[^>]*)?>/i).slice(1);
  const episodes: Episode[] = [];

  for (const block of rawBlocks) {
    if (episodes.length >= limit) break;

    const closeIdx = block.search(/<\/item>/i);
    const itemXml = closeIdx !== -1 ? block.slice(0, closeIdx) : block;

    const audioUrl = extractEnclosureUrlFromItem(itemXml);
    const title = extractTagFromItem(itemXml, "title");
    const guid = extractTagFromItem(itemXml, "guid") || audioUrl;
    const pubDate = extractTagFromItem(itemXml, "pubDate");
    const rawDesc =
      extractTagFromItem(itemXml, "description") ||
      extractTagFromItem(itemXml, "itunes:summary") ||
      "";
    const description = stripHtmlTags(rawDesc);
    const rawDuration = extractTagFromItem(itemXml, "itunes:duration");

    if (!audioUrl || !title) continue;

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
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `RSSフィードの取得に失敗しました (HTTP ${response.status})`
      );
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
