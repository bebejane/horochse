import type { DateTime } from "luxon";

import { httpRequest } from "../http";
import { inRange, isConcert, parseSvWhen, pickImage, stripTags } from "../core";
import { makeEvent } from "../helpers";
import type { ScrapedEvent } from "../types";

const LIST_URL = "https://www.bioaspen.se/visningar/scen/";
const DATE_HEADING_RE =
  /<h2\b[^>]*class="[^"]*font-display[^"]*my-3[^"]*"[^>]*>([\s\S]*?)<\/h2>/gi;
const EVENT_LINK_RE =
  /<a\b[^>]*href=["'](https:\/\/www\.bioaspen\.se\/movies\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

type Candidate = {
  title: string;
  url: string;
  when: DateTime;
  image: string;
};

function dateInRange(text: string, start: DateTime, end: DateTime): DateTime | null {
  for (const year of new Set([start.year, end.year])) {
    const when = parseSvWhen(text, year);
    if (when && inRange(when, start, end)) return when;
  }
  return null;
}

function candidatesFromPage(html: string, start: DateTime, end: DateTime): Candidate[] {
  const headings = [...html.matchAll(DATE_HEADING_RE)];
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  const posterByUrl = new Map<string, string>();

  for (const match of html.matchAll(EVENT_LINK_RE)) {
    const imageMatch = /<img\b[^>]*\bsrc=["']([^"']+)["']/i.exec(match[2]);
    if (imageMatch) posterByUrl.set(match[1], pickImage(imageMatch[1]));
  }

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const dateText = stripTags(heading[1]);
    if (!/\d{1,2}\s+[a-zåäö]+/i.test(dateText)) continue;

    const sectionStart = heading.index! + heading[0].length;
    const sectionEnd = headings[i + 1]?.index ?? html.length;
    const section = html.slice(sectionStart, sectionEnd);

    for (const match of section.matchAll(EVENT_LINK_RE)) {
      const url = match[1];
      const card = match[2];
      const timeMatch = /<h2\b[^>]*>([\s\S]*?)<\/h2>/i.exec(card);
      const titleMatch = /<h3\b[^>]*>([\s\S]*?)<\/h3>/i.exec(card);
      if (!timeMatch || !titleMatch) continue;

      const time = stripTags(timeMatch[1]);
      if (!/^\d{1,2}[:.]\d{2}$/.test(time)) continue;
      const title = stripTags(titleMatch[1]);
      const when = dateInRange(`${dateText} ${time}`, start, end);
      if (!title || !when) continue;

      const key = `${url}-${when.toISO()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ title, url, when, image: posterByUrl.get(url) || "" });
    }
  }

  return candidates;
}

export async function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  const html = await httpRequest(LIST_URL);
  const candidates = candidatesFromPage(html, start, end);
  const events: ScrapedEvent[] = [];
  for (const candidate of candidates) {
    if (!isConcert(candidate.title, "", "", true)) continue;

    events.push(
      makeEvent("bioaspen", "Bio Aspen", candidate.title, candidate.when, candidate.url, {
        place: "Bio Aspen",
        image: candidate.image,
        extraId: `${new URL(candidate.url).pathname}-${candidate.when.toFormat("HHmm")}`,
      }),
    );
  }
  return events;
}
