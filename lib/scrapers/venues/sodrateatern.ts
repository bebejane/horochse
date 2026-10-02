import type { DateTime } from "luxon";

import { httpRequest, shorten, stripTags } from "../core";
import { fetchByHost } from "../sources/live";
import type { ScrapedEvent } from "../types";

const BOILERPLATE =
  /markis|värmelampor|välkommen att beställa|så länge vädret|ons[–-]fre från|dörrar:|konsertstart/i;

function reSearchKagel(value: string): boolean {
  return /k[äa]gelbanan/i.test(value);
}

function eventText(html: string): string {
  const match = /class="single-text-content"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
  if (!match) return "";
  const text = shorten(stripTags(match[1]));
  if (text.length < 24 || BOILERPLATE.test(text)) return "";
  return text;
}

function eventPlace(html: string): string {
  const match = /<strong>\s*Scen\s*<\/strong>\s*([^<]+)/i.exec(html);
  if (match) return match[1].trim();
  return "";
}

export async function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  const events = await fetchByHost(start, end, "sodrateatern.com", "Södra Teatern", "sodrateatern");
  for (const event of events) {
    const url = event.url || "";
    const text = (event.text || "").trim();
    if (url && text.length < 40) {
      let page = "";
      try {
        page = await httpRequest(url);
      } catch {
        page = "";
      }
      if (page) {
        const blurb = eventText(page);
        if (blurb) event.text = blurb;
        const place = eventPlace(page);
        if (place) event.place = place;
      }
    }
    if (reSearchKagel(url) || reSearchKagel(event.title || "") || reSearchKagel(event.place || "")) {
      event.place = "Kägelbanan";
    } else if (!event.place) {
      event.place = "Södra Teatern";
    }
  }
  return events;
}
