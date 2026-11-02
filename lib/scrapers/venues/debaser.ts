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

type ListingCard = { urlPath: string; body: string; image: string };

/** Cards on /konserter. The current page wraps each show in div.event-info; the older anchor markup is kept. */
function listingCards(htmlPage: string): ListingCard[] {
  const cards: ListingCard[] = [];
  const seen = new Set<string>();
  const push = (urlPath: string, body: string, index: number) => {
    if (seen.has(urlPath)) return;
    seen.add(urlPath);
    const around = htmlPage.slice(Math.max(0, index - 500), index + body.length + 2500);
    const listingImg = /url\(&quot;(\/img\/card\/uploads\/img\/[^&]+)&quot;\)/.exec(around);
    cards.push({
      urlPath,
      body,
      image: listingImg ? "https://debaser.se" + listingImg[1] : "",
    });
  };

  // `event-info-box` is inside the card. A bare word-boundary would stop the
  // card there and keep only the empty overlay link.
  const divRe =
    /<div class="event-info(?:\s[^"]*)?">([\s\S]*?)(?=<div class="event-info(?:\s|")|<div role="listitem"|$)/g;
  for (const match of htmlPage.matchAll(divRe)) {
    const href = /href="(\/events\/[^"]+)"/.exec(match[1]);
    if (href) push(href[1], match[1], match.index ?? 0);
  }

  const anchorRe = /<a href="(\/events\/[^"]+)" class="event-info[^"]*">([\s\S]*?)<\/a>/g;
  for (const match of htmlPage.matchAll(anchorRe)) {
    push(match[1], match[2], match.index ?? 0);
  }
  return cards;
}

export async function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  const htmlPage = await httpRequest("https://debaser.se/konserter");
  const events: ScrapedEvent[] = [];
  const seen = new Set<string>();
  for (const card of listingCards(htmlPage)) {
    const body = card.body;
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
    const url = "https://debaser.se" + card.urlPath;
    if (seen.has(url)) continue;
    seen.add(url);
    let image = pickImage(card.image);
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
