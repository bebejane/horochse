import type { DateTime } from "luxon";

import { HttpError, httpRequest } from "../http";
import {
  eventId,
  inRange,
  iso,
  isoDate,
  localDatetime,
  parseSlaktListingDate,
  stripTags,
  unescape,
} from "../core";
import { extractSlaktText, extractSlaktTime, isConcert } from "../core";
import { pageMediaFields } from "../links";
import type { ScrapedEvent } from "../types";

export async function fetchSlakthusenVenue(
  start: DateTime,
  end: DateTime,
  path: string,
  stage: string,
  slug = "slakthusen",
  parent = "Slakthusen",
): Promise<ScrapedEvent[]> {
  const events: ScrapedEvent[] = [];
  const today = start;
  const norm = (value: string) => value.toLowerCase().replace(/ /g, "");
  const pathNorm = path.replace(/-/g, "");

  for (let page = 1; page <= 7; page++) {
    let url = `https://slakthusen.se/venue/${path}/`;
    if (page > 1) url = `https://slakthusen.se/venue/${path}/page/${page}/`;
    let listing = "";
    try {
      listing = await httpRequest(url);
    } catch (exc) {
      if (exc instanceof HttpError && exc.status === 404) break;
      throw exc;
    }

    const items = [...listing.matchAll(/<li id="post-(\d+)"[^>]*>([\s\S]*?)<\/li>/g)];
    if (!items.length) break;

    let pageBeyond = true;
    for (const [, postId, block] of items) {
      const venueMatch = /class="stalle">([^<]+)/.exec(block);
      const venueName = venueMatch ? unescape(venueMatch[1]).trim() : "";
      if (![norm(stage), pathNorm].includes(norm(venueName))) {
        if (!norm(venueName).includes(pathNorm)) continue;
      }

      const titleMatch = /class="titel">([^<]+)/.exec(block);
      const dayMatch = /class="dag[^"]*"><p>([^<]+)/.exec(block);
      const monthMatch = /class="manad"><p>([^<]+)/.exec(block);
      const hrefMatch = /<a href="([^"]+)"/.exec(block);
      const imgMatch = /<img[^>]+src="([^"]+)"/.exec(block);
      if (!(titleMatch && dayMatch && monthMatch && hrefMatch)) continue;

      const day = parseSlaktListingDate(dayMatch[1], monthMatch[1], today);
      if (day === null) continue;
      if (day > end) continue;
      pageBeyond = false;
      if (!inRange(day, start, end)) continue;

      const href = unescape(hrefMatch[1]);
      const detailSlug = new URL(href).pathname.replace(/\/+$/, "").split("/").pop() || "";
      let detailHtml = "";
      try {
        const query = new URLSearchParams({
          slug: detailSlug,
          _fields: "content,excerpt,title,link",
        }).toString();
        const api = await httpRequest("https://slakthusen.se/wp-json/wp/v2/posts?" + query);
        const posts = JSON.parse(api);
        if (posts?.length) {
          detailHtml = posts[0]?.content?.rendered || posts[0]?.excerpt?.rendered || "";
        }
      } catch {
        try {
          detailHtml = await httpRequest(href);
        } catch {
          detailHtml = block;
        }
      }

      let title = unescape(titleMatch[1]);
      title = title.replace(new RegExp("\\s*\\|\\s*" + stage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*$", "i"), "").trim();
      if (!isConcert(title, stripTags(detailHtml))) continue;

      const plain = stripTags(detailHtml);
      const timeStr = extractSlaktTime(plain);
      const dateStr = isoDate(day);
      events.push({
        id: eventId(slug, postId, dateStr),
        venue: parent,
        venue_slug: slug,
        title,
        date: dateStr,
        time: timeStr,
        datetime: iso(localDatetime(dateStr, timeStr || "20:00")),
        image: imgMatch ? unescape(imgMatch[1]) : "",
        text: extractSlaktText(detailHtml),
        url: href,
        place: stage,
        ...pageMediaFields(detailHtml + "\n" + block, slug),
      });
    }

    if (pageBeyond) break;
  }
  return events;
}
