import type { DateTime } from "luxon";

import { httpRequest, inRange, isConcert, parseDt, unescape } from "../core";
import { makeEvent } from "../helpers";
import type { ScrapedEvent } from "../types";

const URL = "https://www.konserthuset.se/program-och-biljetter/kalender/";
const MONTH_URL = "https://www.konserthuset.se/CalendarSlideBlock/LoadArrangeMentsByMonth/";
const GUID_RE = /data-contentguid="([0-9a-fA-F-]{36})"/;
const ITEM_RE =
  /<li id="page-\d+" data-fulldate="([^"]+)" data-fulltime="([^"]+)"[^>]*itemtype="https:\/\/schema\.org\/MusicEvent">([\s\S]*?)<\/li>/gi;

async function htmlChunks(start: DateTime, end: DateTime): Promise<string[]> {
  const page = await httpRequest(URL);
  const chunks = [page];
  const guidMatch = GUID_RE.exec(page);
  const guid = guidMatch ? guidMatch[1] : "7734c4c5-5c58-4872-a98b-6b5501531aca";
  const monthMap = new Map<string, [number, number]>();
  monthMap.set(`${start.year}-${start.month}`, [start.year, start.month]);
  monthMap.set(`${end.year}-${end.month}`, [end.year, end.month]);
  if (start.month !== end.month) {
    monthMap.set(`${start.year}-${start.month}`, [start.year, start.month]);
  }
  const months = [...monthMap.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const [year, month] of months) {
    const body = new URLSearchParams({
      year: String(year),
      month: String(month),
      amountToLoad: "80",
      typefilters: "",
      lang: "sv",
      contentGuid: guid,
      viewType: "normal",
    }).toString();
    try {
      const raw = await httpRequest(MONTH_URL, {
        data: body,
        contentType: "application/x-www-form-urlencoded",
        extraHeaders: {
          "X-Requested-With": "XMLHttpRequest",
          Referer: URL,
          Accept: "application/json",
        },
      });
      const payload = JSON.parse(raw) as { html?: string };
      chunks.push(payload.html || "");
    } catch {
      continue;
    }
  }
  return chunks;
}

export async function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  const events: ScrapedEvent[] = [];
  const seen = new Set<string>();
  for (const chunk of await htmlChunks(start, end)) {
    for (const match of chunk.matchAll(ITEM_RE)) {
      const dateStr = match[1];
      const fulltime = match[2];
      const body = match[3];
      const hrefMatch = /itemprop="url" content="([^"]+)"/.exec(body);
      let href = hrefMatch ? hrefMatch[1] : "";
      if (href.includes("/guidad-visning/")) continue;
      const titleMatch = /itemprop="name">\s*<a href="[^"]+">([^<]+)/.exec(body);
      if (!titleMatch) continue;
      const title = unescape(titleMatch[1]).trim();
      if (/skolkonsert|förskolan|forskola|^mini\b/i.test(title)) continue;
      let text = "";
      const desc = /itemprop="description">\s*([^<]+)/.exec(body);
      if (desc) text = unescape(desc[1]).trim();
      let when = parseDt(fulltime.replace(" ", "T"));
      if (when === null) when = parseDt(dateStr + "T19:00");
      if (when === null || !inRange(when, start, end)) continue;
      if (!isConcert(title, text, "konsert")) continue;
      if (/berättar om/.test(text) && !/konsert|symphony|filharmon|jazz|kör/i.test(title)) continue;
      if (!href) {
        const path = /href="(\/program-och-biljetter\/kalender\/[^"]+)"/.exec(body);
        href = path ? new globalThis.URL(path[1], "https://www.konserthuset.se").toString() : URL;
      }
      const key = href + when.toFormat("yyyy-MM-ddHH:mm");
      if (seen.has(key)) continue;
      seen.add(key);
      let image = "";
      const img = /<img itemprop="url"[^>]*src="([^"]+)"/.exec(body);
      if (img) {
        image = new globalThis.URL(unescape(img[1]), "https://www.konserthuset.se").toString();
      }
      events.push(
        makeEvent("konserthuset", "Konserthuset Stockholm", title, when, href, {
          place: "Konserthuset Stockholm",
          image,
          text,
        }),
      );
    }
  }
  return events;
}
