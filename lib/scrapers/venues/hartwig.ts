import type { DateTime } from "luxon";

import {
  httpRequest,
  inRange,
  isConcert,
  parseSvWhen,
  pickImage,
  unescape,
} from "../core";
import { makeEvent } from "../helpers";
import type { ScrapedEvent } from "../types";

const URL = "https://kulturhusethartwig.se/biljetter";
const CARD_RE = new RegExp(
  '(<img[^>]+src="[^"]+"[\\s\\S]{0,1200}?)?' +
    '<p class="text-sm font-bold[^"]*">([^<]+)</p>\\s*' +
    '<h2[^>]*>\\s*<a[^>]+href="([^"]+)"[^>]*>([^<]+)</a>\\s*</h2>\\s*' +
    '<p class="mt-3[^"]*">([^<]*)</p>',
  "gi",
);

export async function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  const page = await httpRequest(URL);
  const events: ScrapedEvent[] = [];
  const seen = new Set<string>();
  for (const match of page.matchAll(CARD_RE)) {
    const imgHtml = match[1] || "";
    const dateText = match[2];
    const href = match[3];
    const title = unescape(match[4]).trim();
    const blurb = unescape(match[5]).trim();
    if (/festivalbiljett|hyra lokal|vernissage/i.test(title + " " + blurb)) continue;
    const when = parseSvWhen(unescape(dateText), start.year);
    if (when === null || !inRange(when, start, end)) continue;
    if (!isConcert(title, blurb, "live")) continue;
    const url = unescape(href);
    if (seen.has(url)) continue;
    seen.add(url);
    const src = /src="([^"]+)"/.exec(imgHtml);
    let raw = unescape(src ? src[1] : "");
    if (raw.startsWith("/")) raw = "https://kulturhusethartwig.se" + raw;
    if (raw.includes("/_next/image")) {
      let inner = "";
      try {
        inner = new globalThis.URL(raw).searchParams.get("url") || "";
      } catch {
        inner = "";
      }
      try {
        inner = decodeURIComponent(inner);
      } catch {
        // ignore malformed percent-encoding
      }
      raw = inner || raw;
    }
    const image = pickImage(raw);
    events.push(
      makeEvent("hartwig", "Kulturhuset Hartwig", title, when, url, {
        place: "Kulturhuset Hartwig",
        image,
        text: blurb,
      }),
    );
  }
  return events;
}
