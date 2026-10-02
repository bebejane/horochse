import { DateTime } from "luxon";

import {
  MONTHS_EN,
  TZ,
  httpRequest,
  inRange,
  isConcert,
  pageMediaFields,
  parseDt,
  unescape,
  wpFeaturedUrl,
} from "../core";
import { makeEvent, pageBlurb } from "../helpers";
import type { ScrapedEvent } from "../types";

const MONTH_RE =
  /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}).{0,12}(\d{1,2})[:.](\d{2})/i;

export async function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  const raw = await httpRequest("https://stampen.se/wp-json/wp/v2/mec-events?per_page=50");
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = [];
  }
  const posts = Array.isArray(parsed) ? parsed : [];
  const events: ScrapedEvent[] = [];
  for (const post of posts) {
    const rendered = unescape((post.title || {}).rendered || "");
    let title = rendered.replace(/\s*[•·].*$/, "").trim();
    title = title.replace(/\s*live at stampen.*$/i, "").trim();
    const url = post.link || "https://stampen.se/";
    let when: DateTime | null = null;
    const blob = title + " " + rendered;
    const match = MONTH_RE.exec(blob);
    if (match) {
      const month = MONTHS_EN[match[1].toLowerCase()];
      const year = start.year;
      let dt = DateTime.fromObject(
        { year, month, day: Number(match[2]), hour: Number(match[3]), minute: Number(match[4]) },
        { zone: TZ },
      );
      if (dt.isValid && dt.startOf("day") < start.minus({ days: 20 }).startOf("day")) {
        dt = dt.set({ year: year + 1 });
      }
      when = dt.isValid ? dt : null;
    }
    const content = (post.content || {}).rendered || "";
    if (when === null) when = parseDt(post.date || "");
    if (when === null || !inRange(when, start, end)) continue;
    if (!isConcert(title, content)) continue;
    const image = await wpFeaturedUrl("https://stampen.se", post.featured_media);
    const event = makeEvent("stampen", "Stampen", title, when, url, {
      image,
      text: pageBlurb([content]),
      extraId: String(post.id || title),
    });
    Object.assign(event, pageMediaFields(content, "stampen"));
    events.push(event);
  }
  return events;
}
