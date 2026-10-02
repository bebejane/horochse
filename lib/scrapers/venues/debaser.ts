import { DateTime } from "luxon";

import {
  TZ,
  inRange,
  isConcert,
  pageMediaFields,
  pickImage,
  ogImage,
  unescape,
  httpRequest,
} from "../core";
import { makeEvent, pageBlurb } from "../helpers";
import type { ScrapedEvent } from "../types";

const MONTHS_SHORT: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, maj: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dec: 12,
};

export async function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  const htmlPage = await httpRequest("https://debaser.se/konserter");
  const events: ScrapedEvent[] = [];
  const seen = new Set<string>();
  for (const match of htmlPage.matchAll(/<a href="(\/events\/[^"]+)" class="event-info[^"]*">([\s\S]*?)<\/a>/g)) {
    const body = match[2];
    const kind = /class="b2 white">([^<]+)/.exec(body);
    if (!kind || !unescape(kind[1]).toLowerCase().includes("konsert")) continue;
    const titleMatch = /class="h3[^"]*">([^<]+)/.exec(body);
    if (!titleMatch) continue;
    let title = unescape(titleMatch[1]).trim();
    const support = /class="h4[^"]*">([^<]+)/.exec(body);
    if (support) {
      const extra = unescape(support[1]).trim().replace(/^support:\s*/i, "");
      if (extra) title = `${title} + ${extra}`;
    }
    const days = [...body.matchAll(/class="b1-data[^"]*">([^<]+)/g)].map((m) => m[1]);
    if (days.length < 4) continue;
    const dayN = Number((days[1].replace(/\D/g, "")) || "0");
    const month = MONTHS_SHORT[days[2].trim().toLowerCase().slice(0, 3)];
    const year = Number((days[3].replace(/\D/g, "")) || "0");
    if (!(dayN && month && year)) continue;
    const placeMatch = /class="b2 aa notranslate">([^<]+)/.exec(body);
    const place = placeMatch ? unescape(placeMatch[1]).trim() : "Debaser";
    if (!/strand|nova/i.test(place)) continue;
    let when = DateTime.fromObject({ year, month, day: dayN, hour: 20, minute: 0 }, { zone: TZ });
    if (!inRange(when, start, end)) continue;
    if (!isConcert(title, "", "konsert")) continue;
    const url = "https://debaser.se" + match[1];
    if (seen.has(url)) continue;
    seen.add(url);
    const start0 = Math.max(0, (match.index ?? 0) - 3500);
    const listingImg = /url\(&quot;(\/img\/card\/uploads\/img\/[^&]+)&quot;\)/.exec(htmlPage.slice(start0, match.index));
    let image = pickImage(listingImg ? "https://debaser.se" + listingImg[1] : "");
    let detail = "";
    let timeStr = "20:00";
    try {
      const page = await httpRequest(url);
      detail = page;
      image = pickImage(ogImage(page), image);
      const doors = /Dörrar\s+(\d{1,2})[.:](\d{2})/i.exec(page);
      if (doors) {
        timeStr = `${String(Number(doors[1])).padStart(2, "0")}:${doors[2]}`;
        when = when.set({ hour: Number(timeStr.slice(0, 2)), minute: Number(timeStr.slice(3)) });
      }
    } catch {
      detail = "";
    }
    const event = makeEvent("debaser", "Debaser", title, when, url, {
      place,
      image,
      text: pageBlurb([], detail),
    });
    Object.assign(event, pageMediaFields(detail, "debaser"));
    events.push(event);
  }
  return events;
}
