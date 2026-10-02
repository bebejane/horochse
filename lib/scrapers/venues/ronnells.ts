import type { DateTime } from "luxon";

import {
  httpRequest,
  inRange,
  isConcert,
  isRonnellsMusic,
  isoDate,
  largerImage,
  localDatetime,
  pageMediaFields,
  parseRonnellsTime,
  parseSvFullDate,
  shorten,
  stripTags,
  unescape,
} from "../core";
import { makeEvent } from "../helpers";
import type { ScrapedEvent } from "../types";

function listingImage(block: string): string {
  const srcset = /srcset="([^"]+)"/.exec(block);
  if (srcset) {
    const parts = srcset[1]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => part.split(/\s+/)[0]);
    if (parts.length) return largerImage(unescape(parts[parts.length - 1]));
  }
  const img = /<img[^>]+src="([^"]+)"/.exec(block);
  return img ? largerImage(unescape(img[1])) : "";
}

function extractRonnellsText(pageHtml: string): string {
  const match = /<div class="event-single-about">([\s\S]*?)<\/div>/.exec(pageHtml);
  if (!match) return "";
  const skip =
    /^(?:insläpp|entré|förköp|begränsat|i samarbete|välkommen|welcome|live kl|fri entré|läs svarsmailet)/i;
  const paras: string[] = [];
  for (const chunk of match[1].split(/<\/p>|<br\s*\/?>/)) {
    const text = unescape(chunk.replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .replace(/^[ \-–—]+/, "")
      .replace(/[ \-–—]+$/, "");
    if (!text || text.length < 50 || skip.test(text) || text.startsWith("http")) continue;
    paras.push(text);
    if (text.length >= 80) break;
  }
  return shorten(paras.length ? paras[0] : stripTags(match[1]));
}

export async function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  const listing = await httpRequest("https://ronnells.se/?page_id=21");
  const events: ScrapedEvent[] = [];
  const seen = new Set<string>();

  const blocks = [...listing.matchAll(/<div class="items-wrap">([\s\S]*?)<\/div>\s*<\/div>/g)].map(
    (m) => m[1],
  );
  for (const block of blocks) {
    const dateMatch = /class="date-event"><b>([^<]+)<\/b>/.exec(block);
    const titleMatch = /<h3>([\s\S]*?)<\/h3>/.exec(block);
    const hrefMatch = /<a href="(https:\/\/ronnells\.se\/\?events=[^"]+)"/.exec(block);
    if (!(dateMatch && titleMatch && hrefMatch)) continue;

    const day = parseSvFullDate(unescape(dateMatch[1]));
    if (!day || !inRange(day, start, end)) continue;

    const title = unescape(titleMatch[1].replace(/<[^>]+>/g, "")).trim();
    let timeRaw = "";
    const timeMatch = /class="time-event">([^<]+)/.exec(block);
    if (timeMatch) timeRaw = unescape(timeMatch[1]).trim();
    if (!isRonnellsMusic(title, timeRaw)) continue;

    const url = unescape(hrefMatch[1]);
    let slug = "";
    try {
      slug = new URL(url).searchParams.get("events") || "";
    } catch {
      slug = "";
    }
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);

    let image = listingImage(block);
    let text = "";
    let page = "";
    try {
      page = await httpRequest(url);
    } catch {
      page = "";
    }
    if (page) {
      const imgMatch = /<div class="event-single-wrap[^"]*">\s*<img[^>]+src="([^"]+)"/.exec(page);
      if (imgMatch) image = largerImage(unescape(imgMatch[1]));
      text = extractRonnellsText(page);
    }

    const dateStr = isoDate(day);
    const timeStr = parseRonnellsTime(timeRaw);
    const when = localDatetime(dateStr, timeStr || "19:00");
    const event = makeEvent("ronnells", "Rönnells", title, when, url, {
      place: "Rönnells",
      image,
      text,
      extraId: slug,
    });
    Object.assign(event, pageMediaFields(page, "ronnells"));
    events.push(event);
  }

  return events.filter((event) => isConcert(event.title || "", event.text || ""));
}
