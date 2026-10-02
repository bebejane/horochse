import type { DateTime } from "luxon";

import { httpRequest, inRange, isConcert, parseDt, unescape } from "../core";
import { makeEvent, pageBlurb } from "../helpers";
import type { ScrapedEvent } from "../types";

const URL = "https://landet.nu/";
const ITEM_RE =
  /<a href="(\/overvaningen\/[^"]+)">\s*<time>([^<]+)<\/time>[\s\S]*?<h3>([^<]+)<\/h3>/gi;

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  const page = await httpRequest(URL);
  const events: ScrapedEvent[] = [];
  const seen = new Set<string>();
  for (const match of page.matchAll(ITEM_RE)) {
    const href = match[1];
    const title = unescape(match[3]).trim();
    const when = parseDt(match[2].trim() + "T21:00");
    if (!title || when === null || !inRange(when, start, end)) continue;
    if (!isConcert(title, "live")) continue;
    const url = "https://landet.nu" + href;
    if (seen.has(url)) continue;
    seen.add(url);
    let image = "";
    let text = "";
    const imgMatch = new RegExp(
      `href="${escapeRe(href)}"[\\s\\S]{0,400}?<img src="([^"]+)"`,
    ).exec(page);
    if (imgMatch) image = "https://landet.nu" + unescape(imgMatch[1]);
    try {
      text = pageBlurb([], await httpRequest(url));
    } catch {
      text = "";
    }
    events.push(
      makeEvent("landet", "Restaurang Landet", title, when, url, {
        place: "Övervåningen",
        image,
        text,
      }),
    );
  }
  return events;
}
