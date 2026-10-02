import type { DateTime } from "luxon";

import { iso, isoDate, isoTime } from "./dates";
import { fold, shorten, stripTags } from "./html";
import type { ScrapedEvent } from "./types";

export function eventId(...parts: unknown[]): string {
  const raw = parts.map((part) => String(part)).join("-");
  const slug = raw.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return slug.slice(0, 80);
}

export function makeEvent(
  slug: string,
  venue: string,
  title: string,
  when: DateTime,
  url: string,
  opts: { place?: string; image?: string; text?: string; extraId?: string } = {},
): ScrapedEvent {
  const dateStr = isoDate(when);
  const timeStr = isoTime(when);
  let ident = opts.extraId || "";
  if (!ident) {
    try {
      ident = new URL(url).pathname.replace(/^\/+|\/+$/g, "");
    } catch {
      ident = "";
    }
  }
  if (!ident) ident = title;
  return {
    id: eventId(slug, ident, dateStr),
    venue,
    venue_slug: slug,
    title: fold(title),
    date: dateStr,
    time: timeStr,
    datetime: iso(when),
    image: opts.image || "",
    text: opts.text ? shorten(stripTags(opts.text)) : "",
    url,
    place: opts.place || venue,
  };
}
