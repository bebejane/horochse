import type { DateTime } from "luxon";

import {
  MONTHS_SV,
  httpRequest,
  inRange,
  isConcert,
  jsonldEvents,
  localDatetime,
  ogImage,
  pageMediaFields,
  parseDt,
  parseEnDate,
  parseEnMdy,
  pickImage,
  stripTags,
  unescape,
} from "../core";
import { makeEvent } from "../helpers";
import { mapPool } from "../log";
import type { ScrapedEvent } from "../types";

function parseBernsDate(raw: string): DateTime | null {
  const text = unescape(raw || "").trim();
  const parsed = parseDt(text) || parseEnMdy(text) || parseEnDate(text);
  if (parsed) return parsed;
  let match = /(\d{1,2})[./-](\d{1,2})[./-](20\d{2})/.exec(text);
  if (match) {
    const dateStr = `${match[3]}-${String(Number(match[2])).padStart(2, "0")}-${String(Number(match[1])).padStart(2, "0")}`;
    return localDatetime(dateStr, "00:00");
  }
  match =
    /(\d{1,2})\s+(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+(20\d{2})/i.exec(
      text,
    );
  if (match) {
    const month = MONTHS_SV[match[2].toLowerCase()];
    const dateStr = `${match[3]}-${String(month).padStart(2, "0")}-${String(Number(match[1])).padStart(2, "0")}`;
    return localDatetime(dateStr, "00:00");
  }
  return null;
}

async function fetchOg(url: string): Promise<string> {
  try {
    return ogImage(await httpRequest(url));
  } catch {
    return "";
  }
}

export async function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  const htmlPage = await httpRequest("https://berns.se/calendar/");
  const events: ScrapedEvent[] = [];
  const seen = new Set<string>();

  const jsonldCandidates: { title: string; url: string; when: DateTime; node: any }[] = [];
  for (const node of jsonldEvents(htmlPage)) {
    const title = node.name || "";
    const url = node.url || "https://berns.se/calendar/";
    const when = parseDt(node.startDate || "");
    if (!title || when === null || !inRange(when, start, end)) continue;
    if (!isConcert(title, node.description || "", "musik")) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    jsonldCandidates.push({ title, url, when, node });
  }
  const jsonldImages = await mapPool(jsonldCandidates, 6, async (item) =>
    pickImage(item.node.image) || (await fetchOg(item.url)),
  );
  jsonldCandidates.forEach((item, i) => {
    events.push(
      makeEvent("berns", "Berns", item.title, item.when, item.url, {
        text: item.node.description || "",
        image: jsonldImages[i],
      }),
    );
  });

  // Calendar items are self-contained blocks:
  //   <div class="calender-item ...">
  //     <a href="https://berns.se/calendar/<slug>/"><img src=…></a>
  //     <div class="citem-bottom">
  //       <div class="citem-meta"><div class="citem-date">18 October 2026</div>…</div>
  //       <div class="citem-title"><h5>Name</h5></div>
  //     </div>
  //   </div>
  // Split on the item wrapper so each chunk holds exactly one event; title and
  // date live in named `citem-*` nodes, so no fragile distance regex is needed.
  const calendarCandidates: { title: string; url: string; when: DateTime; image: string }[] = [];
  for (const chunk of htmlPage.split('class="calender-item').slice(1)) {
    const url = /href="(https:\/\/berns\.se\/calendar\/[^"]+?\/)"/.exec(chunk)?.[1];
    if (!url) continue;
    const title = unescape(
      /citem-title[^>]*>\s*<h\d[^>]*>([^<]+)<\/h\d>/i.exec(chunk)?.[1] ?? "",
    )
      .replace(/\s+/g, " ")
      .trim();
    if (!title) continue;
    if (/afterwork|what.?s on|book|\baw\b|out of office/i.test(title)) continue;
    const parsedDate = parseBernsDate(/citem-date[^>]*>([^<]*)</i.exec(chunk)?.[1] ?? "");
    if (parsedDate === null) continue;
    const when = parsedDate.set({ hour: 19, minute: 0 });
    if (!inRange(when, start, end)) continue;
    if (!isConcert(title, "musik")) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    const imgTag = /<img[^>]*>/i.exec(chunk)?.[0] ?? "";
    calendarCandidates.push({
      title,
      url,
      when,
      image: pickImage(/src="([^"]+)"/i.exec(imgTag)?.[1], /srcset="([^"]+)"/i.exec(imgTag)?.[1]),
    });
  }
  for (const item of calendarCandidates) {
    events.push(makeEvent("berns", "Berns", item.title, item.when, item.url, { image: item.image }));
  }

  if (events.length) return events;

  const raw = await httpRequest("https://berns.se/wp-json/wp/v2/event?per_page=50");
  const posts = JSON.parse(raw) as any[];
  const wpCandidates = await mapPool(posts, 6, async (post) => {
    const title = unescape((post.title || {}).rendered || "");
    const url = post.link || "";
    const content = (post.content || {}).rendered || "";
    let page = "";
    try {
      page = await httpRequest(url);
    } catch {
      page = content;
    }
    let when: DateTime | null = null;
    const heading = /(\d{1,2}\s+\w+\s+20\d{2}|[A-Za-z]+ \d{1,2},?\s+20\d{2})/.exec(page);
    if (heading) {
      when = parseBernsDate(heading[1]);
    }
    if (when === null) {
      const isoStamps = page.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/g);
      if (isoStamps && isoStamps.length) {
        when = parseDt(isoStamps[isoStamps.length - 1]);
      }
    }
    if (when === null || !inRange(when, start, end)) return null;
    if (!isConcert(title, stripTags(content), "musik")) return null;
    const image = pickImage(ogImage(page), post.jetpack_featured_media_url);
    const event = makeEvent("berns", "Berns", title, when, url, {
      extraId: String(post.id),
      image,
    });
    Object.assign(event, pageMediaFields(page, "berns"));
    return event;
  });
  for (const event of wpCandidates) if (event) events.push(event);
  return events;
}
