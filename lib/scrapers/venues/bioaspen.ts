import type { DateTime } from "luxon";

import { httpRequest } from "../http";
import { inRange, isConcert, ogImage, parseSvWhen, stripTags } from "../core";
import { makeEvent, pageBlurb } from "../helpers";
import { mapPool, warn } from "../log";
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
      candidates.push({ title, url, when });
    }
  }

  return candidates;
}

export async function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  const html = await httpRequest(LIST_URL);
  const candidates = candidatesFromPage(html, start, end);
  const details = await mapPool(candidates, 4, async ({ url, title }) => {
    try {
      return await httpRequest(url);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      warn(`Bio Aspen: kunde inte hämta "${title}": ${reason}`);
      return "";
    }
  });

  const events: ScrapedEvent[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const detail = details[i];
    const text = pageBlurb([], detail);
    if (!isConcert(candidate.title, text, "konsert", true)) continue;

    events.push(
      makeEvent("bioaspen", "Bio Aspen", candidate.title, candidate.when, candidate.url, {
        place: "Bio Aspen",
        image: ogImage(detail),
        text,
        extraId: `${new URL(candidate.url).pathname}-${candidate.when.toFormat("HHmm")}`,
      }),
    );
  }
  return events;
}
