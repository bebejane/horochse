import type { DateTime } from "luxon";

import { httpRequest, inRange, isConcert, jsonldEvents, parseDt, unescape } from "../core";
import { makeEvent } from "../helpers";
import type { ScrapedEvent } from "../types";

const URLS = [
  "https://www.gronalund.com/konserter",
  "https://www.gronalund.com/sv/gronan-live",
];

export async function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  const events: ScrapedEvent[] = [];
  const seen = new Set<string>();
  for (const url of URLS) {
    let page: string;
    try {
      page = await httpRequest(url);
    } catch {
      continue;
    }
    for (const node of jsonldEvents(page)) {
      const title = node.name || "";
      const href = node.url || url;
      const when = parseDt(node.startDate || "");
      if (!title || when === null || !inRange(when, start, end)) continue;
      if (!isConcert(title, node.description || "", "konsert")) continue;
      if (seen.has(href)) continue;
      seen.add(href);
      events.push(
        makeEvent("gronalund", "Gröna Lund", title, when, href, { place: "Gröna Lund" }),
      );
    }
    const CARD_RE =
      /href="([^"]+)"[\s\S]{0,400}?(?:<(?:h2|h3)[^>]*>)([^<]{3,80})[\s\S]{0,200}?(20\d{2}-\d{2}-\d{2}|[A-Za-zåäöÅÄÖ]{3,9}\s+\d{1,2})[\s\S]{0,120}?(Stora Scen|Lilla Scen)/gi;
    for (const match of page.matchAll(CARD_RE)) {
      const href = match[1];
      const title = unescape(match[2]).trim();
      const dateText = match[3];
      const place = match[4];
      let when = parseDt(dateText.includes("20") ? dateText : "");
      if (when === null) continue;
      when = when.set({ hour: 19, minute: 30 });
      if (!inRange(when, start, end)) continue;
      if (!isConcert(title, "konsert", "konsert")) continue;
      const full = href.startsWith("http")
        ? href
        : new URL(href, "https://www.gronalund.com").toString();
      if (seen.has(full)) continue;
      seen.add(full);
      events.push(
        makeEvent("gronalund", "Gröna Lund", title, when, full, {
          place: unescape(place).trim(),
        }),
      );
    }
    if (events.length) break;
  }
  return events;
}
