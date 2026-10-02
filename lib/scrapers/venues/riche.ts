import { DateTime } from "luxon";

import {
  TZ,
  httpRequest,
  inRange,
  isConcert,
  ogImage,
  pageMediaFields,
  unescape,
  wpFeaturedUrl,
} from "../core";
import { makeEvent, pageBlurb } from "../helpers";
import { mapPool } from "../log";
import type { ScrapedEvent } from "../types";

const API = (page: number) =>
  `https://riche.se/wp-json/wp/v2/events?per_page=100&page=${page}`;
const ORIGIN = "https://riche.se";

const ROOM_SLUGS: [string, string][] = [
  ["lilla-baren", "Lilla Baren"],
  ["stora-baren", "Stora Baren"],
  ["sotra-baren", "Stora Baren"],
  ["sommarbaren", "Sommarbaren"],
  ["teatergrillen", "Teatergrillen"],
  ["restaurangen", "Restaurangen"],
  ["hela-riche", "Hela Riche"],
  ["riche", "Riche"],
];
const DAY_RE =
  /(?:måndag|tisdag|onsdag|torsdag|fredag|lördag|söndag)?\s*(\d{1,2})\/(\d{1,2})/i;
const LIVE_TIME_RE = /LIVE[:\s]*(\d{1,2})(?:[.:](\d{2}))?/i;
const SIDEBAR_RE = /single-event-sidebar__list-item (date|type|location)">\s*([^<]+)/gi;

function classes(post: any): string[] {
  return ((post.class_list || []) as unknown[]).map((item) => String(item));
}

function isLive(cls: string[], title: string): boolean {
  if (cls.includes("event_types-live")) return true;
  return (
    /\blive\b/i.test(title) &&
    !["event_types-dj", "event_types-konst", "event_types-brunch"].some((tag) =>
      cls.includes(tag),
    )
  );
}

function roomFromClasses(cls: string[]): string {
  for (const [slug, name] of ROOM_SLUGS) {
    if (cls.includes(`event_locations-${slug}`)) return name;
  }
  return "Riche";
}

function roomFromSidebar(text: string, fallback: string): string {
  const raw = unescape(text || "").trim();
  if (!raw) return fallback;
  const first = raw.split(",")[0].trim();
  const folded = first.toLowerCase();
  if (folded.includes("ostron") && !folded.includes("bar")) return fallback;
  if (folded.includes("lilla")) return "Lilla Baren";
  if (folded.includes("stora") || folded.includes("sotra")) return "Stora Baren";
  if (folded.includes("sommar")) return "Sommarbaren";
  if (folded.includes("teatergrill")) return "Teatergrillen";
  if (folded.includes("hela")) return "Hela Riche";
  return first || fallback;
}

async function fetchPosts(): Promise<any[]> {
  const posts: any[] = [];
  for (let page = 1; page <= 5; page++) {
    let batch: any;
    try {
      batch = JSON.parse(await httpRequest(API(page)));
    } catch {
      break;
    }
    if (!Array.isArray(batch) || !batch.length) break;
    posts.push(...batch);
    if (batch.length < 100) break;
  }
  return posts;
}

function sidebar(page: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const match of (page || "").matchAll(SIDEBAR_RE)) {
    fields[match[1].toLowerCase()] = unescape(match[2]).trim();
  }
  return fields;
}

function eventWhen(dateText: string, blob: string, start: DateTime): DateTime | null {
  const match = DAY_RE.exec(dateText || "");
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = start.year;
  let dt = DateTime.fromObject({ year, month, day }, { zone: TZ });
  if (!dt.isValid) return null;
  if (dt.startOf("day") < start.minus({ days: 14 }).startOf("day")) {
    dt = DateTime.fromObject({ year: year + 1, month, day }, { zone: TZ });
    if (!dt.isValid) return null;
  }
  let hour = 21;
  let minute = 0;
  const timeMatch = LIVE_TIME_RE.exec(blob || "");
  if (timeMatch) {
    hour = Number(timeMatch[1]);
    minute = Number(timeMatch[2] || 0);
    if (hour < 8) hour += 12;
  }
  return dt.set({ hour, minute });
}

export async function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  const events: ScrapedEvent[] = [];
  const seen = new Set<string>();
  const posts = await fetchPosts();
  const built = await mapPool(posts, 6, async (post): Promise<ScrapedEvent | null> => {
    const title = unescape((post.title || {}).rendered || "").trim();
    const cls = classes(post);
    if (!title || !isLive(cls, title)) return null;
    const url = post.link || "";
    if (!url || seen.has(url)) return null;
    let page: string;
    try {
      page = await httpRequest(url);
    } catch {
      return null;
    }
    const side = sidebar(page);
    const kind = side.type || "";
    if (kind && !/live/i.test(kind)) return null;
    const content = (post.content || {}).rendered || "";
    const blob = `${title} ${content} ${page}`;
    if (!isConcert(title, blob, kind || "live")) return null;
    const when = eventWhen(side.date || "", blob, start);
    if (when === null || !inRange(when, start, end)) return null;
    seen.add(url);
    const place = roomFromSidebar(side.location || "", roomFromClasses(cls));
    const image = ogImage(page) || (await wpFeaturedUrl(ORIGIN, post.featured_media));
    const event = makeEvent("riche", "Riche", title, when, url, {
      place,
      image,
      text: pageBlurb([content], page),
      extraId: String(post.id || title),
    });
    Object.assign(event, pageMediaFields(content + "\n" + page, "riche"));
    return event;
  });
  for (const event of built) if (event) events.push(event);
  return events;
}
