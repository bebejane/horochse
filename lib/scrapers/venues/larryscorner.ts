import type { DateTime } from "luxon";

import {
  httpRequest,
  inRange,
  isConcert,
  isLarrysMusic,
  isoDate,
  localDatetime,
  ogImage,
  pageMediaFields,
  parseEnDate,
  parseLarrysTime,
  shorten,
  unescape,
} from "../core";
import { makeEvent } from "../helpers";
import type { ScrapedEvent } from "../types";

const LARRYS_CARD_RE =
  /href="(\/sv\/events\/([^"]+))"\s*>((?:(?!<\/a>)[\s\S])*20\d{2}(?:(?!<\/a>)[\s\S])*)<\/a><\/div>\s*<div class="text-balance[^"]*"[^>]*>\s*<a href="\/sv\/events\/\2">([^<]+)<\/a>/g;

function parseLarrysCards(listing: string): [string, string, string, string][] {
  const cards = [...listing.matchAll(LARRYS_CARD_RE)].map(
    (m) => [m[1], m[2], m[3], m[4]] as [string, string, string, string],
  );
  if (cards.length) return cards;

  const dates = new Map<string, [string, string]>();
  const titles = new Map<string, string>();
  for (const m of listing.matchAll(/href="(\/sv\/events\/([^"]+))"\s*>([^<]+)<\/a>/g)) {
    const href = m[1];
    const slug = m[2];
    const text = unescape(m[3]).trim();
    if (/20\d{2}/.test(text)) {
      if (!dates.has(slug)) dates.set(slug, [href, text]);
    } else if (text) {
      if (!titles.has(slug)) titles.set(slug, text);
    }
  }
  const out: [string, string, string, string][] = [];
  for (const [slug, [href, when]] of dates) {
    const title = titles.get(slug);
    if (title !== undefined) out.push([href, slug, when, title]);
  }
  return out;
}

function extractLarrysText(pageHtml: string): string {
  let match = /<meta name="description" content="([^"]*)"/.exec(pageHtml);
  if (!match) match = /<meta property="og:description" content="([^"]*)"/.exec(pageHtml);
  if (!match) return "";
  let raw = unescape(match[1]).replace(/\u00a0/g, " ");
  raw = raw.replace(/\\n/g, "\n").replace(/\\r/g, "\n");
  raw = raw.replace(/\\+/g, "\n");
  const paras = raw
    .split(/\n+/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const skipHead =
    /^(?:more info coming|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
  const kept: string[] = [];
  for (const para of paras) {
    if (["more info coming", "tba"].includes(para.toLowerCase())) continue;
    if (skipHead.test(para) && para.length < 50) continue;
    kept.push(para);
  }
  if (!kept.length) return "";
  return shorten(kept.join(" "));
}

function larrysImageUrl(raw: string): string {
  const image = unescape(String(raw || "")).trim();
  if (!image || image.toLowerCase().endsWith(".svg")) return "";
  if (image.startsWith("/")) return "https://larryscorner.nu" + image;
  let parsed: URL;
  try {
    parsed = new URL(image);
  } catch {
    return image;
  }
  const host = parsed.host.toLowerCase();
  if (
    ["alexzethson.com", "www.alexzethson.com", "larryscorner.nu", "www.larryscorner.nu"].includes(
      host,
    )
  ) {
    const path = parsed.pathname || "";
    if (path.startsWith("/media/") || path.startsWith("/_next/")) {
      return "https://larryscorner.nu" + path;
    }
  }
  return image;
}

function extractLarrysImage(pageHtml: string): string {
  return larrysImageUrl(ogImage(pageHtml));
}

export async function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  const listing = await httpRequest("https://larryscorner.nu/sv/events");
  const cards = parseLarrysCards(listing);
  if (!cards.length) {
    console.error(`larryscorner: inga kort i listningen (${listing.length} tecken)`);
  }
  const events: ScrapedEvent[] = [];
  const seen = new Set<string>();

  for (const [href, slug, whenRaw, titleRaw] of cards) {
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);

    const title = unescape(titleRaw).trim();
    if (!title || !isLarrysMusic(title)) continue;

    const whenBlob = unescape(whenRaw);
    const day = parseEnDate(whenBlob);
    if (!day || !inRange(day, start, end)) continue;

    const url = "https://larryscorner.nu" + unescape(href);
    const timeStr = parseLarrysTime(whenBlob);
    let image = "";
    let text = "";
    let page = "";
    try {
      page = await httpRequest(url);
    } catch {
      page = "";
    }
    if (page) {
      image = extractLarrysImage(page);
      text = extractLarrysText(page);
    }

    const dateStr = isoDate(day);
    const eventWhen = localDatetime(dateStr, timeStr || "19:00");
    const event = makeEvent("larryscorner", "Larry's Corner", title, eventWhen, url, {
      place: "Larry's Corner",
      image,
      text,
      extraId: slug,
    });
    Object.assign(event, pageMediaFields(page, "larryscorner"));
    events.push(event);
  }

  return events.filter((event) => isConcert(event.title || "", event.text || ""));
}
