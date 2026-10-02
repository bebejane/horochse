import type { DateTime } from "luxon";

import {
  httpRequest,
  inRange,
  isConcert,
  localDatetime,
  pageMediaFields,
  parseDt,
  unescape,
  wpFeaturedUrl,
} from "../core";
import { makeEvent, pageBlurb } from "../helpers";
import type { ScrapedEvent } from "../types";

const API = "https://www.encoresundbyberg.se/wp-json/wp/v2/events?per_page=100";

function parseWhen(acf: any, year: number): DateTime | null {
  const start = String(acf?.event_start || "").trim();
  const show = String(acf?.show_start || acf?.doors_open || "20:00");
  const timePart = /(\d{1,2})[:.](\d{2})/.exec(show);
  const [hour, minute] = timePart ? [Number(timePart[1]), Number(timePart[2])] : [20, 0];
  if (/^20\d{6}$/.test(start)) {
    const dateStr = `${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6, 8)}`;
    return localDatetime(dateStr, `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
  }
  return /^\d{2}-\d{2}$/.test(start) ? parseDt(`${year}-${start}`) : null;
}

export async function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  const posts = JSON.parse(await httpRequest(API)) as any[];
  const events: ScrapedEvent[] = [];
  for (const post of posts) {
    const acf = post.acf || {};
    let title = unescape((post.title || {}).rendered || "");
    const support = unescape(String(acf.support_act || "")).trim();
    if (support) title = `${title} + ${support}`;
    const when = parseWhen(acf, start.year);
    if (when === null || !inRange(when, start, end)) continue;
    const content = (post.content || {}).rendered || "";
    const intro = unescape(String(acf.intro_text || ""));
    if (!isConcert(title, intro + " " + content, "konsert")) continue;
    const url = post.link || "https://www.encoresundbyberg.se/";
    const image = await wpFeaturedUrl("https://www.encoresundbyberg.se", post.featured_media);
    const event = makeEvent("encore", "Encore", title, when, url, {
      place: "Encore",
      image,
      text: pageBlurb([intro, content]),
      extraId: String(post.id || title),
    });
    Object.assign(event, pageMediaFields(content, "encore"));
    events.push(event);
  }
  return events;
}
