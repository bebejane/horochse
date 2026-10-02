import type { DateTime } from "luxon";

import {
  httpRequest,
  inRange,
  isConcert,
  jsonldEvents,
  ogImage,
  parseDt,
  pickImage,
  unescape,
} from "../core";
import { makeEvent, pageBlurb } from "../helpers";
import { mapPool } from "../log";
import type { ScrapedEvent } from "../types";

const HOME = "https://www.gotalejon.se/";
const SKIP_SLUG =
  /musical|musikal|torka-aldrig|djungelboken|dylan-moran|arsenal|piaf-the-show|standup|stand-up|comedy/i;

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  const home = await httpRequest(HOME);
  const slugs: string[] = [];
  const seenPaths = new Set<string>();
  for (const path of [...home.matchAll(/href="(\/all-events\/[^"]+)"/g)].map((m) => m[1])) {
    if (seenPaths.has(path)) continue;
    seenPaths.add(path);
    if (SKIP_SLUG.test(path)) continue;
    slugs.push(path);
  }

  const events: ScrapedEvent[] = [];
  const seen = new Set<string>();
  const built = await mapPool(slugs, 6, async (path): Promise<ScrapedEvent | null> => {
    const url = new URL(path, HOME).toString();
    let page: string;
    try {
      page = await httpRequest(url);
    } catch {
      return null;
    }
    let title = "";
    let when: DateTime | null = null;
    let image = "";
    let text = "";
    for (const node of jsonldEvents(page)) {
      title = node.name || title;
      when = parseDt(node.startDate || "") || when;
      text = node.description || text;
      image = pickImage(image, node.image);
    }
    if (!title) {
      const og = /<meta property="og:title" content="([^"]+)"/.exec(page);
      title = og ? unescape(og[1]).trim() : "";
    }
    image = pickImage(image, ogImage(page));
    if (!image) {
      const homeHit = new RegExp(
        `href="${escapeRe(path)}"[\\s\\S]{0,2000}?(https://dynamicmedia\\.livenationinternational\\.com/[^"?\\s]+)`,
      ).exec(home);
      if (homeHit) image = pickImage(homeHit[1]);
    }
    title = title.replace(/\s+Tickets,.*$/i, "").trim();
    title = title.replace(/\s*[|\-–].*(göta lejon|biljett|www\.).*$/i, "").trim();
    title = title.replace(/\s+Tickets$/i, "").trim();
    if (when === null) {
      const isoMatch = /(20\d{2}-\d{2}-\d{2}T\d{2}:\d{2})/.exec(page);
      if (isoMatch) when = parseDt(isoMatch[1]);
    }
    if (when !== null && when.hour === 0 && when.minute === 0) {
      when = when.set({ hour: 19, minute: 0 });
    }
    if (when === null) return null;
    if (!title || !inRange(when, start, end)) return null;
    if (!isConcert(title, text, "musik")) return null;
    const key = url + when.toFormat("yyyy-MM-dd");
    if (seen.has(key)) return null;
    seen.add(key);
    return makeEvent("gotalejon", "Göta Lejon", title, when, url, {
      place: "Göta Lejon",
      image: image || "",
      text: pageBlurb([text], page),
    });
  });
  for (const event of built) if (event) events.push(event);
  return events;
}
