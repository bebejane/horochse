import type { DateTime } from "luxon";

import { HttpError, httpRequest, sleep } from "../http";
import { inRange, parseDt } from "../dates";
import { pickImage } from "../html";
import { jsonldEvents, walkJsonld } from "../jsonld";
import { isCancelled } from "../text";
import { isConcert } from "../filters";
import { makeEvent } from "../helpers";
import type { ScrapedEvent } from "../types";

function artistImage(event: any, venue: string): string {
  const venueFold = String(venue || "").toLowerCase();
  for (const artist of event.artists || []) {
    const name = String(artist.name || "").toLowerCase();
    if (!name || name === venueFold) continue;
    const urls = artist.imageUrls || {};
    const url = pickImage(
      urls.RETINA_PORTRAIT_16_9,
      urls.ARTIST_PAGE_3_2,
      urls.TABLET_LANDSCAPE_16_9,
    );
    if (url) return url;
  }
  return "";
}

function venueEvents(html: string): any[] {
  const match = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!match) return [];
  let data: any;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return [];
  }
  const queries = data?.props?.pageProps?.initialReduxState?.api?.queries || {};
  const found: any[] = [];
  const seen = new Set<string>();
  for (const payload of Object.values<any>(queries)) {
    if (!payload || typeof payload !== "object" || payload.endpointName !== "venueEvents") continue;
    for (const event of payload?.data?.events || []) {
      const url = event.url || "";
      if (!url || seen.has(url)) continue;
      seen.add(url);
      found.push(event);
    }
  }
  return found;
}

function nodesFromNext(html: string): any[] {
  const match = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!match) return [];
  let data: any;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return [];
  }
  const nodes = data?.props?.pageProps?.eventsJsonLD || [];
  return walkJsonld(nodes);
}

// Ticketmaster returns 403 to bot-looking requests (a bare `Accept: */*`) and
// intermittently under load. Send browser-like navigation headers and retry
// once on 403/429 before giving up.
const BROWSER_HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8",
  Referer: "https://www.ticketmaster.se/",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "same-origin",
  "Upgrade-Insecure-Requests": "1",
};

async function fetchListing(url: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await httpRequest(url, { extraHeaders: BROWSER_HEADERS });
    } catch (exc) {
      const status = exc instanceof HttpError ? exc.status : 0;
      if ((status === 403 || status === 429) && attempt < 2) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      throw exc;
    }
  }
  throw new Error(`ticketmaster: kunde inte hämta ${url}`);
}

export async function fetchTicketmasterVenue(
  start: DateTime,
  end: DateTime,
  url: string,
  venue: string,
  slug: string,
  place = "",
): Promise<ScrapedEvent[]> {
  const html = await fetchListing(url);
  const events: ScrapedEvent[] = [];
  const seen = new Set<string>();
  const tmEvents = venueEvents(html);
  let source = tmEvents;
  if (!source.length) source = nodesFromNext(html).length ? nodesFromNext(html) : jsonldEvents(html);
  for (const node of source) {
    let title: string;
    let href: string;
    let when: DateTime | null;
    let image: string;
    if (node?.dates?.startDate !== undefined || node.title) {
      title = node.title || node.name || "";
      href = node.url || url;
      when = parseDt(node?.dates?.startDate || "");
      image = artistImage(node, venue);
    } else {
      title = node.name || "";
      href = node.url || url;
      when = parseDt(node.startDate || "");
      image = pickImage(node.image);
    }
    if (!title || when === null || !inRange(when, start, end)) continue;
    const description = node.description || "";
    const dates = node.dates && typeof node.dates === "object" ? node.dates : {};
    const status = dates.status && typeof dates.status === "object" ? dates.status : {};
    const statusCode = status.status ?? status ?? "";
    if (isCancelled(title, description, String(node.eventStatus || statusCode || ""))) continue;
    if (!isConcert(title, description, "musik")) continue;
    const key = href + when.toFormat("yyyy-MM-dd HH:mm");
    if (seen.has(key)) continue;
    seen.add(key);
    const location = node.venue || node.location || {};
    const locName = location && typeof location === "object" ? location.name || "" : "";
    events.push(
      makeEvent(slug, venue, title, when, href, {
        place: place || locName || venue,
        image,
        text: description,
      }),
    );
  }
  return events;
}
