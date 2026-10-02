import type { DateTime } from "luxon";

import {
  httpRequest,
  inRange,
  isConcert,
  parseEnMdy,
  pickImage,
  stripTags,
  toTitleCase,
  unescape,
} from "../core";
import { makeEvent, pageBlurb } from "../helpers";
import type { ScrapedEvent } from "../types";

const URL = "https://www.fallan.nu/whats-on";
const CARD_RE =
  /href="(\/whats-on\/[^"]+)" class="link-block-4[^"]*"[\s\S]*?h2small-lable">([^<]+)<\/h2>[\s\S]*?dateinfo">([^<]+)<\/h2>[\s\S]*?<img loading="lazy" alt="([^"]*)"[^>]*src="([^"]+)"(?:[^>]*srcset="([^"]+)")?/gi;
const RICHTEXT_RE = /<div[^>]*class="[^"]*w-richtext[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
const NOISE_RE =
  /thank you!? your submission|oops! something went wrong|your submission has been received/i;
const BAGS_RE = /^small bags allowed[\s\S]{0,120}?(?:\n+| {2,})/gi;

function titleFromAlt(alt: string, href: string): string {
  const cleaned = unescape(alt || "").trim();
  let title = cleaned.replace(/^konsert med\s+/i, "");
  title = title.replace(/\s+på fållan.*$/i, "").trim();
  if (title && !["concert", "festival", "club"].includes(title.toLowerCase())) {
    return title;
  }
  let slug = href.replace(/\/+$/, "").split("/").pop() || "";
  slug = slug.replace(/-{2,}/g, " - ");
  return toTitleCase(slug.replace(/-/g, " ").trim());
}

function eventText(page: string): string {
  for (const block of (page || "").matchAll(RICHTEXT_RE)) {
    let raw = stripTags(block[1]);
    raw = raw.replace(/[\u200b\u200c\u200d\ufeff]/g, "");
    raw = raw.replace(BAGS_RE, "").trim();
    if (!raw || NOISE_RE.test(raw)) continue;
    const text = pageBlurb([raw]);
    if (text) return text;
  }
  return pageBlurb([], page);
}

export async function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  const page = await httpRequest(URL);
  const events: ScrapedEvent[] = [];
  const seen = new Set<string>();
  for (const match of page.matchAll(CARD_RE)) {
    const href = match[1];
    const kind = match[2];
    const dateText = match[3];
    const alt = match[4];
    const src = match[5];
    const srcset = match[6];
    if (!unescape(kind).toLowerCase().includes("concert")) continue;
    const title = titleFromAlt(alt, href);
    let when = parseEnMdy(unescape(dateText));
    if (when === null) continue;
    when = when.set({ hour: 20, minute: 0 });
    if (!inRange(when, start, end)) continue;
    if (!isConcert(title, kind, "konsert")) continue;
    const url = "https://www.fallan.nu" + href;
    if (seen.has(url)) continue;
    seen.add(url);
    const image = pickImage(srcset, src);
    let text = "";
    try {
      const detail = await httpRequest(url);
      text = eventText(detail);
      const doors = /DOORS:\s*(\d{1,2})[.:](\d{2})/i.exec(detail);
      if (doors) {
        const timeStr = `${String(Number(doors[1])).padStart(2, "0")}:${doors[2]}`;
        when = when.set({ hour: Number(timeStr.slice(0, 2)), minute: Number(timeStr.slice(3)) });
      }
    } catch {
      // ignore detail fetch failures
    }
    events.push(
      makeEvent("fallan", "Fållan", title, when, url, {
        place: "Fållan",
        image,
        text,
      }),
    );
  }
  return events;
}
