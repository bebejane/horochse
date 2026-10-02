import type { DateTime } from "luxon";

import {
  httpRequest,
  inRange,
  isConcert,
  isoDate,
  localDatetime,
  pageMediaFields,
  parseEnDate,
  shorten,
  unescape,
} from "../core";
import { makeEvent } from "../helpers";
import type { ScrapedEvent } from "../types";

function extractFylkingenText(pageHtml: string, title: string): string {
  let match = /<meta name="description" content="([^"]*)"/.exec(pageHtml);
  if (!match) match = /<meta property="og:description" content="([^"]*)"/.exec(pageHtml);
  if (!match) return "";
  const raw = unescape(match[1]).replace(/\\n/g, "\n");
  const paras = raw
    .split(/\n+/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const titleCmp = title
    .replace(/\s+/g, " ")
    .replace(/^[ .]+/, "")
    .replace(/[ .]+$/, "")
    .toLowerCase();
  for (const para of paras) {
    const compact = para.replace(/^[ .]+/, "").replace(/[ .]+$/, "").toLowerCase();
    if (para.length < 55 && (compact.includes(titleCmp) || titleCmp.includes(compact))) continue;
    if (para.length < 40) continue;
    return shorten(para);
  }
  return paras.length ? shorten(paras[0]) : "";
}

export async function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  const listing = await httpRequest("https://www.fylkingen.se/sv/events");
  const events: ScrapedEvent[] = [];
  const seen = new Set<string>();

  for (const part of listing.split('href="/sv/events/').slice(1)) {
    const slug = part.split("#")[0].split('"')[0].replace(/^\/+|\/+$/g, "");
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);

    const titleMatch = /<h2[^>]*>([\s\S]*?)<\/h2>/.exec(part);
    if (!titleMatch) continue;
    const title = unescape(titleMatch[1].replace(/<[^>]+>/g, "")).trim();
    const spans = [...part.slice(0, 2500).matchAll(/<span>([^<]+)<\/span>/g)].map((m) => m[1]);
    const dateSpan = spans.find((span) => parseEnDate(span)) || "";
    const timeSpan = spans.find((span) => /^\d{1,2}:\d{2}$/.test(span.trim())) || "";
    const day = parseEnDate(dateSpan);
    if (!day || !inRange(day, start, end)) continue;

    const url = "https://www.fylkingen.se/sv/events/" + slug;
    let image = "";
    let text = "";
    let page = "";
    try {
      page = await httpRequest(url);
    } catch {
      page = "";
    }
    if (page) {
      const imgMatch = /<meta property="og:image" content="([^"]+)"/.exec(page);
      if (imgMatch) image = unescape(imgMatch[1]);
      text = extractFylkingenText(page, title);
    }

    const dateStr = isoDate(day);
    const timeStr = timeSpan.trim();
    const when = localDatetime(dateStr, timeStr || "19:00");
    const event = makeEvent("fylkingen", "Fylkingen", title, when, url, {
      place: "Fylkingen",
      image,
      text,
      extraId: slug,
    });
    Object.assign(event, pageMediaFields(page, "fylkingen"));
    events.push(event);
  }

  return events.filter((event) => isConcert(event.title || "", event.text || ""));
}
