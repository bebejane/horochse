import type { DateTime } from "luxon";

import {
  httpRequest,
  inRange,
  isConcert,
  parseDt,
  pickImage,
} from "../core";
import { makeEvent, pageBlurb } from "../helpers";
import type { ScrapedEvent } from "../types";

const URL = "https://www.berwaldhallen.se/program-och-biljetter";
const SKIP = /streetstar|dance school|danceschool|samtal/i;
const PUSH_RE = /self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g;

function urljoin(base: string, value: string): string {
  try {
    return new globalThis.URL(value, base).toString();
  } catch {
    return value || base;
  }
}

function flightBlob(page: string): string {
  const chunks: string[] = [];
  for (const match of (page || "").matchAll(PUSH_RE)) {
    try {
      chunks.push(JSON.parse('"' + match[1].replace(/\n/g, "\\n") + '"'));
    } catch {
      continue;
    }
  }
  return chunks.join("\n");
}

function jsonObject(blob: string, start: number): any | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let index = start; index < blob.length; index++) {
    const char = blob[index];
    if (inStr) {
      if (esc) esc = false;
      else if (char === "\\") esc = true;
      else if (char === '"') inStr = false;
      continue;
    }
    if (char === '"') {
      inStr = true;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          const node = JSON.parse(blob.slice(start, index + 1));
          return node && typeof node === "object" && !Array.isArray(node) ? node : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function productions(blob: string): any[] {
  const found: any[] = [];
  const seen = new Set<unknown>();
  for (const match of blob.matchAll(/\{"post_id":/g)) {
    const node = jsonObject(blob, match.index ?? 0);
    if (!node || node.post_type !== "production") continue;
    const postId = node.post_id;
    if (seen.has(postId)) continue;
    seen.add(postId);
    found.push(node);
  }
  return found;
}

export async function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  const page = await httpRequest(URL);
  const events: ScrapedEvent[] = [];
  const seen = new Set<string>();
  for (const production of productions(flightBlob(page))) {
    const href = urljoin(URL, String(production.url || ""));
    const title = String(production.post_title || production.list_subtitle || "").trim();
    const image = pickImage((production.featured_image || {}).src);
    const text = pageBlurb([production.description || "", production.preamble || ""]);
    const venueName = String((production.venue_info || {}).name || "Berwaldhallen").trim();
    let shows = production.events || [];
    if (!shows.length && production.next_event_date) {
      shows = [{ date: production.next_event_date, name: title }];
    }
    for (const show of shows) {
      if (!show || typeof show !== "object" || Array.isArray(show)) continue;
      const name = String(show.name || title).trim() || title;
      if (SKIP.test(name) || SKIP.test(title)) continue;
      const when = parseDt(String(show.date || ""));
      if (when === null || !inRange(when, start, end)) continue;
      if (!isConcert(name, text, "konsert")) continue;
      const key = href + when.toFormat("yyyy-MM-dd HH:mm");
      if (seen.has(key)) continue;
      seen.add(key);
      events.push(
        makeEvent("berwaldhallen", "Berwaldhallen", name, when, href, {
          place: venueName,
          image,
          text,
          extraId:
            (href.replace(/\/+$/, "").split("/").pop() || "") + "-" + when.toFormat("HHmm"),
        }),
      );
    }
  }
  return events;
}
