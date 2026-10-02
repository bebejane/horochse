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
import { makeEvent } from "../helpers";
import type { ScrapedEvent } from "../types";

const URL = "https://www.scalateatern.se/forestallningar/";

export async function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  const page = await httpRequest(URL);
  const events: ScrapedEvent[] = [];
  const seen = new Set<string>();
  for (const node of jsonldEvents(page)) {
    const title = node.name || "";
    const href = node.url || URL;
    const when = parseDt(node.startDate || "");
    if (!title || when === null || !inRange(when, start, end)) continue;
    if (!isConcert(title, node.description || "", "musik")) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    events.push(
      makeEvent("scalateatern", "Scalateatern", title, when, href, {
        place: "Scalateatern",
        image: pickImage(node.image),
      }),
    );
  }
  for (const match of page.matchAll(
    /href="(https:\/\/www\.scalateatern\.se\/forestallning\/[^"]+\/)"([^>]*>[\s\S]{0,900})<\/a>/gi,
  )) {
    const href = match[1];
    const blob = unescape(match[2]);
    if (!/konsert|concert|jazz|live\s*musik|kör/i.test(blob)) continue;
    const titleMatch = /<h[1-4][^>]*>([^<]+)/.exec(blob);
    if (!titleMatch) continue;
    const title = unescape(titleMatch[1]).trim();
    const isoMatch = /(20\d{2}-\d{2}-\d{2})/.exec(blob);
    if (!isoMatch) continue;
    const when = parseDt(isoMatch[1] + "T19:00");
    if (when === null || !inRange(when, start, end)) continue;
    if (!isConcert(title, blob, "musik")) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    const imgMatch = /<img[^>]+src="([^"]+)"/i.exec(blob);
    let image = pickImage(imgMatch ? imgMatch[1] : "");
    if (!image) {
      try {
        image = ogImage(await httpRequest(href));
      } catch {
        image = "";
      }
    }
    events.push(
      makeEvent("scalateatern", "Scalateatern", title, when, href, {
        place: "Scalateatern",
        image,
      }),
    );
  }
  return events;
}
