import type { DateTime } from "luxon";

import { httpRequest } from "../http";
import { parseDt } from "../dates";
import { pickImage } from "../html";
import { jsonldEvents } from "../jsonld";
import { isConcert } from "../filters";
import { inRange } from "../dates";
import { makeEvent, pageBlurb } from "../helpers";
import type { ScrapedEvent } from "../types";

const LIVE_URL = "https://stockholmlive.com/evenemang/musik-show/";
let cache: { key: string; events: any[] } | null = null;

function norm(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.host.toLowerCase().replace(/^[w.]+/, "");
    const path = parsed.pathname.replace(/\/+$/, "");
    return host + path;
  } catch {
    return "";
  }
}

function cards(html: string): Record<string, { image: string; text: string }> {
  const out: Record<string, { image: string; text: string }> = {};
  for (const part of html.split('class="card-event"').slice(1)) {
    const href = /<a[^>]+href="([^"]+)"/i.exec(part);
    if (!href) continue;
    const src = /<img[^>]+src="([^"]+)"/i.exec(part);
    const srcset = /srcset="([^"]+)"/i.exec(part);
    const tagline = /class="tagline">\s*([^<]+)/i.exec(part);
    out[norm(href[1])] = {
      image: pickImage(src?.[1] || "", srcset?.[1] || ""),
      text: tagline?.[1].trim() || "",
    };
  }
  return out;
}

export async function liveEvents(start: DateTime, end: DateTime): Promise<any[]> {
  const key = start.toFormat("yyyy-MM-dd") + end.toFormat("yyyy-MM-dd");
  if (cache && cache.key === key) return cache.events;
  const html = await httpRequest(LIVE_URL);
  const cardMap = cards(html);
  const out: any[] = [];
  const seen = new Set<string>();
  for (const node of jsonldEvents(html)) {
    const title = node.name || "";
    const url = node.url || "";
    const when = parseDt(node.startDate || "");
    if (!title || !url || when === null) continue;
    if (!inRange(when, start, end)) continue;
    if (!isConcert(title, "", "musik")) continue;
    const ident = new URL(url).pathname.replace(/\/+$/, "");
    if (seen.has(ident)) continue;
    seen.add(ident);
    const card = cardMap[norm(url)] || { image: "", text: "" };
    const image = pickImage(node.image, card.image);
    const location = node.location || {};
    const place = location && typeof location === "object" ? location.name || "" : "";
    out.push({
      title,
      url,
      when,
      host: new URL(url).host.toLowerCase().replace(/^[w.]+/, ""),
      image,
      place,
      text: node.description || card.text || "",
    });
  }
  cache = { key, events: out };
  return out;
}

export function eventText(html: string): string {
  const match = /class="[^"]*single-text-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
  if (!match) return "";
  const para = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(match[1]);
  if (!para) return "";
  return pageBlurb([para[1]]);
}

export async function fillSingleText(events: ScrapedEvent[]): Promise<ScrapedEvent[]> {
  for (const event of events) {
    const url = event.url || "";
    if (!url) continue;
    let page = "";
    try {
      page = await httpRequest(url);
    } catch {
      page = "";
    }
    if (!page) continue;
    const blurb = eventText(page);
    if (blurb) event.text = blurb;
  }
  return events;
}

export async function fetchByHost(
  start: DateTime,
  end: DateTime,
  host: string,
  venue: string,
  slug: string,
  place = "",
): Promise<ScrapedEvent[]> {
  host = host.toLowerCase().replace(/^[w.]+/, "");
  const events: ScrapedEvent[] = [];
  for (const item of await liveEvents(start, end)) {
    if (item.host !== host) continue;
    events.push(
      makeEvent(slug, venue, item.title, item.when, item.url, {
        place: place || item.place || venue,
        image: item.image,
        text: item.text || "",
      }),
    );
  }
  return events;
}
