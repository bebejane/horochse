import type { DateTime } from "luxon";

import {
  eventId,
  httpRequest,
  inRange,
  isConcert,
  iso,
  isoDate,
  isoTime,
  parseDt,
  shorten,
  stripTags,
} from "../core";
import type { ScrapedEvent } from "../types";

export async function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  const query = {
    size: 80,
    sort: [{ tixStartDate: "asc" }],
    query: {
      bool: {
        must: [
          {
            range: {
              tixStartDate: {
                gte: iso(start),
                lte: iso(end),
              },
            },
          },
          {
            nested: {
              path: "drupalCategory",
              query: { term: { "drupalCategory.label.keyword": "Konserter" } },
            },
          },
        ],
      },
    },
  };
  const raw = await httpRequest(
    "https://elastic.kulturhusetstadsteatern.se/khst-events/_search",
    { data: JSON.stringify(query), contentType: "application/json" },
  );
  const payload = JSON.parse(raw);
  const events: ScrapedEvent[] = [];
  const seen = new Set<string>();

  for (const hit of payload?.hits?.hits ?? []) {
    const source = hit?._source || {};
    const locations: string[] = (source.drupalLocation || []).map((item: any) => item?.label);
    if (!locations.includes("Sergels torg")) continue;

    const startRaw = source.tixStartDate || "";
    const when = parseDt(startRaw);
    if (when === null) continue;
    if (!inRange(when, start, end)) continue;

    const title = String(source.drupalTitle || source.tixName || "").trim();
    const url = source.drupalLink || "";
    const images = source.drupalHeroImage || [];
    const leads = source.drupalLeadText || [];
    const rooms = locations.filter((label) => label && label !== "Sergels torg");
    const key = [iso(when), title, url].join("|");
    if (seen.has(key)) continue;
    seen.add(key);

    events.push({
      id: eventId("kulturhuset", source.tixEventId || hit?._id, when.toFormat("yyyyMMddHHmm")),
      venue: "Kulturhuset Stadsteatern",
      venue_slug: "kulturhuset",
      title,
      date: isoDate(when),
      time: isoTime(when),
      datetime: iso(when),
      image: images.length ? images[0]?.src || "" : "",
      text: shorten(stripTags(leads.length ? leads[0]?.value : "")),
      url,
      place: rooms.length ? rooms[0] : "Kulturhuset",
    });
  }

  return events.filter((event) => isConcert(event.title || "", event.text || "", "musik"));
}
