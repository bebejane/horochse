import type { DateTime } from "luxon";

import { httpRequest, inRange, isCancelled, isConcert, parseDt } from "../core";
import { makeEvent, pageBlurb } from "../helpers";
import type { ScrapedEvent } from "../types";

function richText(node: unknown): string {
  if (typeof node === "string") return node.trim();
  if (!node || typeof node !== "object" || Array.isArray(node)) return "";
  const parts: string[] = [];
  for (const child of ((node as Record<string, any>).content || []) as any[]) {
    if (child && typeof child === "object" && child.type === "text") {
      parts.push(child.text || "");
    } else {
      parts.push(richText(child));
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function walk(node: unknown, found: any[]): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, found);
    return;
  }
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, any>;
  if (record.component === "artistCard") {
    found.push(record);
    return;
  }
  for (const value of Object.values(record)) walk(value, found);
}

export async function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  const page = await httpRequest("https://www.nalen.com/sv/konserter-event");
  const match = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(page);
  if (!match) return [];
  let data: any;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return [];
  }
  const cards: any[] = [];
  walk(data?.props?.pageProps?.blocks || [], cards);
  const events: ScrapedEvent[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    let title = richText(card.artistName) || "";
    const guest = richText(card.sideKickName);
    if (guest) title = title ? `${title} + ${guest}` : guest;
    const when = parseDt(String(card.startDate || "").replace(/ /g, "T"));
    if (!title || when === null || !inRange(when, start, end)) continue;
    const info = richText(card.info);
    const blob = `${info} ${title}`;
    if (/afterwork|efter jobbet|brunch|burlesque|utställning|vernissage|restaurangen/i.test(blob)) continue;
    if (isCancelled(title, info) || !isConcert(title, blob)) continue;
    const path = card.artistPageUrl || {};
    let href = String(path.cached_url || path.url || "").trim();
    if (href && !href.startsWith("http")) href = "https://www.nalen.com/" + href.replace(/^\/+/, "");
    if (!href) href = "https://www.nalen.com/sv/konserter-event";
    const image = (card.image || {}).filename || "";
    const key = title.toLowerCase() + when.toISO();
    if (seen.has(key)) continue;
    seen.add(key);
    let text = info;
    if (href && href.replace(/\/+$/, "") !== "https://www.nalen.com/sv/konserter-event") {
      try {
        text = pageBlurb([text], await httpRequest(href));
      } catch {
        // keep info
      }
    }
    events.push(
      makeEvent("nalen", "Nalen", title, when, href, {
        image,
        text,
        extraId: String(card._uid || title),
      }),
    );
  }
  return events;
}
