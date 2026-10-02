import type { DateTime } from "luxon";

import {
  httpRequest,
  inRange,
  isConcert,
  ogImage,
  pageMediaFields,
  parseSvWhen,
  pickImage,
  stripTags,
  unescape,
  wpFeaturedUrl,
} from "../core";
import { makeEvent, pageBlurb } from "../helpers";
import { mapPool } from "../log";
import type { ScrapedEvent } from "../types";

const HEAD_WHEN =
  /(?:mån|tis|ons|tors|fre|lör|sön)\s+(\d{1,2})\s+(jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec)\.?[\s\S]{0,120}?Dörrar\s+(\d{1,2})[.:](\d{2})/i;

function eventTypes(page: string): Record<string, string> {
  const match = /var klEventTypes = (\{.*?\});/.exec(page);
  if (!match) return {};
  try {
    return JSON.parse(match[1]) as Record<string, string>;
  } catch {
    return {};
  }
}

function whenFromPage(page: string, year: number): DateTime | null {
  let window = page;
  const h1 = /<h1[^>]*>[\s\S]{0,120}<\/h1>([\s\S]{0,900})/i.exec(page);
  if (h1) window = h1[0];
  const match = HEAD_WHEN.exec(window);
  if (!match) return parseSvWhen(stripTags(window), year);
  const when = parseSvWhen(`${match[1]} ${match[2]} ${year}`, year);
  if (when === null) return null;
  return when.set({ hour: Number(match[3]), minute: Number(match[4]) });
}

export async function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  const raw = await httpRequest(
    "https://kollektivetlivet.se/wp-json/wp/v2/event?per_page=100",
  );
  const events: ScrapedEvent[] = [];
  const typesRef: { value: Record<string, string> } = { value: {} };
  const built = await mapPool(JSON.parse(raw) as any[], 6, async (post): Promise<ScrapedEvent | null> => {
    const title = unescape((post.title || {}).rendered || "");
    const url = post.link || "";
    const content = (post.content || {}).rendered || "";
    const slug = post.slug || "";
    let page: string;
    try {
      page = await httpRequest(url);
    } catch {
      page = content;
    }
    if (!Object.keys(typesRef.value).length) typesRef.value = eventTypes(page);
    const kind = String(typesRef.value[slug] || "").toLowerCase();
    if (kind === "klubb") return null;
    let when = whenFromPage(page, start.year);
    if (when !== null && when.toISODate()! < start.toISODate()! && when.month <= 6) {
      when = when.set({ year: when.year + 1 });
    }
    if (when === null || !inRange(when, start, end)) return null;
    if (!isConcert(title, stripTags(content), "konsert")) return null;
    let image = await wpFeaturedUrl("https://kollektivetlivet.se", post.featured_media);
    if (!image) image = pickImage(ogImage(page));
    let place = "Kollektivet Livet";
    const scen = /Scen\s+(Stora Scen|Lilla Scen|Hallen)/i.exec(page);
    if (scen) {
      place = scen[1]
        .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .replace("Scen", "scen");
    }
    const event = makeEvent("kollektivetlivet", "Kollektivet Livet", title, when, url, {
      place,
      image,
      text: pageBlurb([content], page),
      extraId: String(post.id),
    });
    Object.assign(event, pageMediaFields(page, "kollektivetlivet"));
    return event;
  });
  for (const event of built) if (event) events.push(event);
  return events;
}
