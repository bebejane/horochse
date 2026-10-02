import type { DateTime } from "luxon";

import {
  eventId,
  httpRequest,
  inRange,
  isConcert,
  iso,
  isoDate,
  localDatetime,
  shorten,
  stripTags,
  unescape,
} from "../core";
import type { ScrapedEvent } from "../types";

function parseFaschingLanguageId(pageHtml: string): string {
  const match = /window\.currentLanguage\s*=\s*'(\d+)'/.exec(pageHtml);
  return match ? match[1] : "96";
}

export async function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  const kal = await httpRequest("https://www.fasching.se/kalendarium/");
  const lang = parseFaschingLanguageId(kal);
  const events: ScrapedEvent[] = [];
  let offset = 0;
  const limit = 24;
  const seen = new Set<string>();
  const startDate = isoDate(start);
  const endDate = isoDate(end);

  while (true) {
    const payload = new URLSearchParams([
      ["action", "fm_ajax_query"],
      ["orderby", "calendar"],
      ["curdate", startDate],
      ["limit", String(limit)],
      ["offset", String(offset)],
      ["year", "0"],
      ["month", "0"],
      ["day", "0"],
      ["search", ""],
      ["view", "default"],
      ["terms[]", lang],
    ]).toString();
    const chunk = await httpRequest("https://www.fasching.se/wp-admin/admin-ajax.php", {
      data: payload,
      contentType: "application/x-www-form-urlencoded",
    });
    const cards = [
      ...chunk.matchAll(
        /<li id="(?<id>[^"]+)" class="card[^"]*"\s+data-date="(?<date>[^"]+)" data-date-end="(?<end>[^"]+)"\s+data-time="(?<time>[^"]+)"[^>]*>(?<body>[\s\S]*?)<\/li>/g,
      ),
    ];
    if (!cards.length) break;

    let reachedPastWeek = false;
    for (const card of cards) {
      const groups = card.groups!;
      const day = localDatetime(groups.date, "00:00");
      if (isoDate(day) > endDate) {
        reachedPastWeek = true;
        continue;
      }
      if (!inRange(day, start, end)) continue;

      const body = groups.body;
      const hrefMatch = /<a href="(https:\/\/www\.fasching\.se\/[^"]+)"/.exec(body);
      const titleMatch = /<h2 class="card__title h3">([^<]+)<\/h2>/.exec(body);
      const imgMatch = /<img[^>]+src="([^"]+)"/.exec(body);
      const descMatch = /<h2 class="card__title h3">[^<]+<\/h2>\s*<p>([\s\S]*?)<\/p>/.exec(body);
      if (!hrefMatch || !titleMatch) continue;
      const url = unescape(hrefMatch[1]);
      if (url.includes("/en/")) continue;

      const title = unescape(titleMatch[1]).trim();
      const timeStr = groups.time.trim();
      const key = [groups.date, timeStr, title.toLowerCase()].join("\u0000");
      if (seen.has(key)) continue;
      seen.add(key);

      events.push({
        id: eventId("fasching", groups.id),
        venue: "Fasching",
        venue_slug: "fasching",
        title,
        date: groups.date,
        time: timeStr,
        datetime: iso(localDatetime(groups.date, timeStr)),
        image: imgMatch ? unescape(imgMatch[1]) : "",
        text: descMatch ? shorten(stripTags(descMatch[1])) : "",
        url,
        place: "Fasching",
      });
    }

    if (cards.length < limit || reachedPastWeek) break;
    offset += limit;
    if (offset > 240) break;
  }

  return events.filter((event) => isConcert(event.title || ""));
}
