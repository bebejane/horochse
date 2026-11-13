import type { DateTime } from "luxon";

import { httpRequest, inRange, isCancelled, isConcert, isoTime, parseDt } from "../core";
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

function pathname(href: string): string {
  try {
    return new URL(href).pathname.replace(/^\/+|\/+$/g, "");
  } catch {
    return "";
  }
}

// Storyblok ger samma konsert ett nytt `_uid` i karusellen och i listan, och
// uid:t byts mellan omläsningar. Sidsökvägen plus klockslaget ligger kvar.
function nalenExtraId(href: string, time: string, title: string): string {
  const slug = pathname(href).split("/").filter(Boolean).pop() ?? "";
  const ident = !slug || slug === "konserter-event" ? title : slug;
  const hm = time.replace(":", "");
  return hm ? `${ident}-${hm}` : ident;
}

// "Dave Lofts" är en delmängd av "Dave Lofts + Agnes Skure" när resten börjar
// med ett skiljetecken. "Souvenir" är inte en delmängd av "Bar Souvenir".
function billExtends(longer: string, shorter: string): boolean {
  const full = longer.trim().toLocaleLowerCase("sv");
  const part = shorter.trim().toLocaleLowerCase("sv");
  if (!part || full === part || !full.startsWith(part)) return false;
  return /^(?:\s*[+,&]|\s+(?:och|med)\b)/i.test(full.slice(part.length));
}

function nameCount(title: string): number {
  return title
    .split(/\s*[+,&]\s*|\s+(?:och|med)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

function betterBill(candidate: string, current: string): boolean {
  if (billExtends(candidate, current)) return true;
  if (billExtends(current, candidate)) return false;
  const extra = nameCount(candidate) - nameCount(current);
  if (extra !== 0) return extra > 0;
  return candidate.length > current.length;
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
  type Draft = {
    title: string;
    when: DateTime;
    href: string;
    image: string;
    info: string;
  };
  const drafts = new Map<string, Draft>();
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
    const slug = pathname(href);
    const key = `${slug && slug !== "sv/konserter-event" ? slug : title.toLowerCase()}|${when.toISO()}`;
    const prev = drafts.get(key);
    if (prev && !betterBill(title, prev.title)) continue;
    drafts.set(key, {
      title,
      when,
      href,
      image: image || prev?.image || "",
      info: info || prev?.info || "",
    });
  }
  const events: ScrapedEvent[] = [];
  for (const draft of drafts.values()) {
    let text = draft.info;
    if (draft.href.replace(/\/+$/, "") !== "https://www.nalen.com/sv/konserter-event") {
      try {
        text = pageBlurb([text], await httpRequest(draft.href));
      } catch {
        // keep info
      }
    }
    events.push(
      makeEvent("nalen", "Nalen", draft.title, draft.when, draft.href, {
        image: draft.image,
        text,
        extraId: nalenExtraId(draft.href, isoTime(draft.when), draft.title),
      }),
    );
  }
  return events;
}
