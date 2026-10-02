import type { DateTime } from "luxon";

import { httpRequest } from "../http";
import { inRange, parseDt } from "../dates";
import { ogImage, pickImage } from "../html";
import { jsonldEvents, walkJsonld } from "../jsonld";
import { isCancelled } from "../text";
import { isConcert } from "../filters";
import { makeEvent, pageBlurb } from "../helpers";
import { pageMediaFields } from "../links";
import type { ScrapedEvent } from "../types";

export async function fetchJsonldSite(
  start: DateTime,
  end: DateTime,
  urls: string[],
  venue: string,
  slug: string,
  opts: { place?: string; strict?: boolean; category?: string } = {},
): Promise<ScrapedEvent[]> {
  const events: ScrapedEvent[] = [];
  const seen = new Set<string>();
  for (const url of urls) {
    let html = "";
    try {
      html = await httpRequest(url);
    } catch {
      continue;
    }
    for (const node of jsonldEvents(html)) {
      const title = node.name || "";
      const href = node.url || url;
      const when = parseDt(node.startDate || "");
      if (!title || when === null || !inRange(when, start, end)) continue;
      if (isCancelled(title, node.description || "", String(node.eventStatus || ""))) continue;
      if (!isConcert(title, node.description || "", opts.category || "", opts.strict ?? true)) continue;
      const key = href + when.toFormat("yyyyMMdd");
      if (seen.has(key)) continue;
      seen.add(key);
      let image = pickImage(node.image, ogImage(html));
      let text = node.description || "";
      let detail = "";
      if (href.startsWith("http") && href.replace(/\/+$/, "") !== url.replace(/\/+$/, "")) {
        try {
          detail = await httpRequest(href);
        } catch {
          detail = "";
        }
      }
      if (detail) {
        image = pickImage(image, ogImage(detail));
        text = pageBlurb([text], detail);
      }
      const event = makeEvent(slug, venue, title, when, href, {
        place: opts.place || venue,
        image,
        text,
      });
      Object.assign(event, pageMediaFields(html.slice(0, 8000), slug));
      events.push(event);
    }
    if (events.length) break;
  }
  return events;
}

export function nodesFromNext(html: string): any[] {
  const match = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!match) return [];
  let data: any;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return [];
  }
  const raw = data?.props?.pageProps || {};
  const nodes = raw.eventsJsonLD || [];
  return walkJsonld(nodes);
}
