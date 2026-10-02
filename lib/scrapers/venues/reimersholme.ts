import type { DateTime } from "luxon";

import {
  httpRequest,
  inRange,
  isConcert,
  pageMediaFields,
  parseSvWhen,
  pickImage,
  unescape,
  wpFeaturedUrl,
} from "../core";
import { makeEvent, pageBlurb } from "../helpers";
import { mapPool } from "../log";
import type { ScrapedEvent } from "../types";

const LIST_URL = "https://reimersholmehotel.se/evenemang/";
const API_URL = "https://reimersholmehotel.se/wp-json/wp/v2/event?per_page=100";
const CARD_RE =
  /href="(https:\/\/reimersholmehotel\.se\/event\/[^"]+)" class="wp-block-getwid-template-post-title__link" title="([^"]+)"[\s\S]*?class="doorsopen">([^<]+)<\/p>/gi;

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  const listing = await httpRequest(LIST_URL);
  const raw = await httpRequest(API_URL);
  const parsed = JSON.parse(raw) as any[];
  const posts: Record<string, any> = {};
  for (const post of parsed) {
    posts[String(post?.link || "").replace(/\/+$/, "")] = post;
  }
  const events: ScrapedEvent[] = [];
  const seen = new Set<string>();
  const cards: { href: string; title: string; when: DateTime }[] = [];
  for (const match of listing.matchAll(CARD_RE)) {
    const href = match[1];
    const title = unescape(match[2]).trim();
    const when = parseSvWhen(unescape(match[3]), start.year);
    if (when === null || !inRange(when, start, end)) continue;
    if (!isConcert(title, "live", "live")) continue;
    const url = href.replace(/\/+$/, "");
    if (seen.has(url)) continue;
    seen.add(url);
    cards.push({ href, title, when });
  }
  const built = await mapPool(cards, 6, async ({ href, title, when }): Promise<ScrapedEvent> => {
    const url = href.replace(/\/+$/, "");
    const post = posts[url] || posts[url + "/"] || {};
    const content = (post.content || {}).rendered || "";
    let image = await wpFeaturedUrl("https://reimersholmehotel.se", post.featured_media);
    const listingImg = new RegExp(
      `href="${escapeRe(href)}"[\\s\\S]{0,200}?<img[^>]+src="([^"]+)"`,
    ).exec(listing);
    image = pickImage(image, listingImg ? listingImg[1] : "");
    const event = makeEvent("reimersholme", "Reimersholme Hotel", title, when, href, {
      place: "Reimersholme Hotel",
      image,
      text: pageBlurb([content]),
      extraId: String(post.id || title),
    });
    Object.assign(event, pageMediaFields(content, "reimersholme"));
    return event;
  });
  events.push(...built);
  return events;
}
