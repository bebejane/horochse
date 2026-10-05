import type { DateTime } from "luxon";

import { httpRequest, inRange, isConcert, parseDt, unescape } from "../core";
import { makeEvent } from "../helpers";
import type { ScrapedEvent } from "../types";

const URL = "https://www.glennmillercafe.se/konserter";
const VENUE_IMAGE =
  "https://static.wixstatic.com/media/" +
  "25e6a5_6968546c58a64d9fa7cd0003aa50d77f~mv2.jpg" +
  "/v1/fill/w_980,h_646,al_c,q_85,usm_0.66_1.00_0.01/glenn-miller-cafe.jpg";
const MONTH_NAME =
  /^(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)$/i;

/** "Nuaia: Sofie Norling voc …" is a name plus the lineup. The lineup (and any
 *  sentence after it) is the blurb; the name stays the title. */
function glennCopy(line: string): { title: string; text: string } {
  const colon = line.indexOf(":");
  if (colon > 2 && colon <= 60) {
    const title = line.slice(0, colon).trim();
    const text = line.slice(colon + 1).trim();
    if (title.length >= 3 && text.length >= 12) return { title, text };
  }
  return { title: line, text: "" };
}

export async function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  const page = await httpRequest(URL);
  const events: ScrapedEvent[] = [];
  const seen = new Set<string>();
  for (const match of page.matchAll(/>(20\d{2}-\d{2}-\d{2})</g)) {
    const dateStr = match[1];
    const when = parseDt(dateStr + "T19:30");
    if (when === null || !inRange(when, start, end)) continue;
    const after = page.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 5000);
    const texts = [...after.matchAll(/wixui-rich-text__text">([^<]{2,160})</g)].map((m) =>
      unescape(m[1]).trim(),
    );
    const bits: string[] = [];
    for (const text of texts) {
      if (/^20\d{2}-\d{2}-\d{2}$/.test(text)) break;
      if (/glenn miller|stockholm|meny|boka|kontakt|öppet/i.test(text)) continue;
      if (MONTH_NAME.test(text)) continue;
      if (text.length < 3) continue;
      bits.push(text);
    }
    const line = bits.join(" ").replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (!isConcert(line, "jazz", "jazz")) continue;
    const key = dateStr + line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const copy = glennCopy(line);
    events.push(
      makeEvent("glennmillercafe", "Glenn Miller Café", copy.title, when, URL, {
        // Keep the id tied to the full listing line so a title/blurb split
        // does not mint a second event for the same night.
        extraId: dateStr + line,
        text: copy.text,
        image: VENUE_IMAGE,
      }),
    );
  }
  return events;
}
