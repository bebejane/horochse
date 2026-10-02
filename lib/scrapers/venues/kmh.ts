import type { DateTime } from "luxon";

import { httpRequest, inRange, isConcert, ogImage, parseDt, unescape } from "../core";
import { makeEvent, pageBlurb } from "../helpers";
import { mapPool } from "../log";
import type { ScrapedEvent } from "../types";

const URL = "https://www.kmh.se/kalender";
const SKIP =
  /fika|symposium|vägledning|vagledning|disputation|rektorskollegium|studieverkstad|information om|study abroad/i;
const KEEP =
  /konsert|concert|folkmusik|dirigent|recital|jazz|kör|kor\b|opera|ensemble|orkester|gig|live|spelar/i;
const BLOCK_RE = /<div class="lp-event-info">([\s\S]*?)<\/div>\s*<div class="sv-clear-both">/gi;

export async function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  const page = await httpRequest(URL);
  const events: ScrapedEvent[] = [];
  const seen = new Set<string>();
  const candidates: { title: string; when: DateTime; url: string }[] = [];
  for (const match of page.matchAll(BLOCK_RE)) {
    const block = match[1];
    const titleMatch = /<h2 class="subheading"><a href="([^"]+)">\s*<span>([^<]+)<\/span>/i.exec(
      block,
    );
    if (!titleMatch) continue;
    const href = unescape(titleMatch[1]);
    const title = unescape(titleMatch[2]).trim();
    if (SKIP.test(title) && !KEEP.test(title)) continue;
    if (!KEEP.test(title)) continue;
    const dtMatch = /<time class="litenxtext" datetime="([^"]+)"/i.exec(block);
    let when = dtMatch ? parseDt(dtMatch[1]) : null;
    if (when === null) {
      const urlDate = /\/(\d{4}-\d{2}-\d{2})-/.exec(href);
      if (urlDate) when = parseDt(urlDate[1] + "T18:00");
    }
    if (!title || when === null || !inRange(when, start, end)) continue;
    if (!isConcert(title, "", "konsert")) continue;
    const url = new globalThis.URL(href, "https://www.kmh.se").toString();
    if (seen.has(url)) continue;
    seen.add(url);
    candidates.push({ title, when, url });
  }
  const built = await mapPool(candidates, 6, async ({ title, when, url }): Promise<ScrapedEvent> => {
    let image = "";
    let text = "";
    try {
      const detail = await httpRequest(url);
      image = ogImage(detail);
      text = pageBlurb([], detail);
    } catch {
      image = "";
    }
    return makeEvent("kmh", "Kungl. Musikhögskolan", title, when, url, {
      place: "KMH",
      image,
      text,
    });
  });
  events.push(...built);
  return events;
}
