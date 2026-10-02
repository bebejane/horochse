import type { DateTime } from "luxon";

import { HttpError, httpRequest, shorten, sleep, stripTags } from "../core";
import { mapPool } from "../log";
import { pageBlurb } from "../helpers";
import { fetchTicketmasterVenue } from "../sources/ticketmaster";
import type { ScrapedEvent } from "../types";

const URL = "https://www.ticketmaster.se/venue/cirkus-stockholm-biljetter/cir/580";
const LIST_URL = "https://cirkus.se/sv/evenemang/konsert/";
const SHOW_URL = "https://cirkus.se/sv/evenemang/{slug}/";
const SHOW_EN_URL = "https://cirkus.se/en/shows/{slug}/";
const NOISE_RE =
  /^(med reservation|rullstolsplats|wheelchair|subject to|denna dag öppnar|arrangor|arrangör|organizer|age limit|åldersgräns|duration|längd)/i;

function slugify(title: string): string {
  let text = String(title || "").normalize("NFKD");
  text = text.replace(/\p{M}+/gu, "");
  text = text.toLowerCase();
  text = text.replace(/[&+/]+/g, " ");
  text = text.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return text;
}

async function fetchHtml(url: string): Promise<string> {
  // cirkus.se aggressively rate-limits (429). A single retry is enough; long
  // backoff here just stalls the whole scrape without ever succeeding.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await httpRequest(url, {
        extraHeaders: {
          Accept: "text/html,application/xhtml+xml",
          Referer: "https://cirkus.se/sv/evenemang/",
        },
      });
    } catch (exc) {
      if (exc instanceof HttpError && exc.status === 429 && attempt < 1) {
        await sleep(2000);
        continue;
      }
      return "";
    }
  }
  return "";
}

function headingish(text: string): boolean {
  const letters = Array.from(text).filter((ch) => /\p{L}/u.test(ch));
  if (letters.length < 8) return false;
  const upper = letters.filter((ch) => ch === ch.toUpperCase() && ch !== ch.toLowerCase()).length;
  return upper / letters.length > 0.82 && text.length < 140;
}

function eventText(html: string): string {
  const match = /(?:Om showen|About the show)([\s\S]{0,8000}?)(?:<h2\b|DATUM|DATES)/i.exec(html);
  const chunk = match ? match[1] : html;
  const paras: string[] = [];
  for (const para of chunk.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = shorten(stripTags(para[1]), 10_000);
    if (text.length < 40 || NOISE_RE.test(text) || headingish(text)) continue;
    paras.push(text);
    if (paras.reduce((sum, item) => sum + item.length, 0) >= 220) break;
  }
  return pageBlurb([paras.join("\n")], html);
}

function listingUrls(html: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const match of html.matchAll(/href="((?:https:\/\/cirkus\.se)?\/sv\/evenemang\/[^"#?]+\/)"/gi)) {
    const href = match[1];
    const trimmed = href.replace(/\/+$/, "");
    if (
      href.includes("/page/") ||
      trimmed.endsWith("/evenemang") ||
      trimmed.endsWith("/konsert")
    ) {
      continue;
    }
    const url = href.startsWith("http") ? href : "https://cirkus.se" + href;
    const slug = url.replace(/\/+$/, "").split("/").pop() || "";
    if (slug) found[slug] = url;
  }
  return found;
}

async function showPage(slug: string, pages: Record<string, string>): Promise<string> {
  const candidates = [
    pages[slug],
    SHOW_URL.replace("{slug}", slug),
    SHOW_EN_URL.replace("{slug}", slug),
  ];
  for (const url of candidates) {
    if (!url) continue;
    const page = await fetchHtml(url);
    if (page) return page;
  }
  return "";
}

export async function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  const events = await fetchTicketmasterVenue(start, end, URL, "Cirkus", "cirkus", "Cirkus");
  const pages = listingUrls(await fetchHtml(LIST_URL));
  await mapPool(events, 6, async (event) => {
    const slug = slugify(event.title || "");
    if (!slug) return;
    const page = await showPage(slug, pages);
    if (!page) return;
    const blurb = eventText(page);
    if (blurb) event.text = blurb;
  });
  return events;
}
