// Scensidor (/debaser, /fasching, …) och MusicEvent-markup. Sidorna länkas
// inte från den aktiva sajten; Google hittar dem via /sitemap.xml.

import { DateTime } from "luxon";

import { displayTitle, eventTimes } from "./events";
import { VENUE_ADDRESSES } from "./ics";
import type { ConcertEvent, VenueSlug } from "./types";
import { VENUES } from "./types";

/** www.höroch.se. Apex omdirigerar hit. */
const CANONICAL_ORIGIN = "https://www.höroch.se";

export function siteOrigin(): string {
  return new URL(CANONICAL_ORIGIN).origin;
}

export function findVenue(slug: string): { slug: VenueSlug; name: string } | null {
  return VENUES.find((venue) => venue.slug === slug) ?? null;
}

export function venueAddress(slug: string): string | undefined {
  return VENUE_ADDRESSES[slug];
}

/** Tidigaste spelningen, med Stockholm-offset så Google får ett riktigt klockslag. */
export function eventStartIso(event: ConcertEvent): string | null {
  const date = (event.date || "").slice(0, 10);
  const raw = (eventTimes(event)[0] || "").trim();
  const match = raw.match(/^(\d{1,2})[:.](\d{2})/);
  if (/^\d{4}-\d{2}-\d{2}$/.test(date) && match) {
    const dt = DateTime.fromISO(`${date}T${match[1].padStart(2, "0")}:${match[2]}`, {
      zone: "Europe/Stockholm",
    });
    if (dt.isValid) return dt.toISO({ suppressMilliseconds: true });
  }
  return event.datetime || null;
}

function plain(value: string | undefined): string | undefined {
  const text = (value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > 400 ? text.slice(0, 397).trimEnd() + "…" : text;
}

function postalAddress(raw: string | undefined): Record<string, string> {
  const address = (raw || "").trim();
  const match = address.match(/^(.*?),\s*(\d{3}\s?\d{2})\s+(.+)$/);
  if (!match) {
    return {
      "@type": "PostalAddress",
      ...(address ? { streetAddress: address } : { addressLocality: "Stockholm" }),
      addressCountry: "SE",
    };
  }
  return {
    "@type": "PostalAddress",
    streetAddress: match[1],
    postalCode: match[2].replace(/\s+/, " "),
    addressLocality: match[3],
    addressCountry: "SE",
  };
}

function performers(event: ConcertEvent, title: string): { "@type": string; name: string }[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const add = (value: string | undefined) => {
    const name = (value || "").replace(/\s+/g, " ").trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) return;
    seen.add(key);
    names.push(name);
  };
  for (const track of event.tracks ?? []) add(track.artist);
  if (!names.length) add(title);
  return names.slice(0, 12).map((name) => ({ "@type": "MusicGroup", name }));
}

function eventPageUrl(event: ConcertEvent): string {
  const slug = String(event.venue_slug || "");
  const path = findVenue(slug) ? `/${slug}` : "/";
  return `${siteOrigin()}${path}#${event.id}`;
}

function toMusicEvent(event: ConcertEvent): Record<string, unknown> | null {
  const name = displayTitle(event);
  const startDate = eventStartIso(event);
  if (!name || !startDate) return null;

  const venue = (event.venue || "").trim();
  const stage = (event.place || "").trim();
  const locationName = stage && venue && stage !== venue ? `${stage}, ${venue}` : venue || stage;
  const slug = String(event.venue_slug || "");
  const url = eventPageUrl(event);
  const description = plain(event.text);
  const image = (event.image || "").trim();
  const node: Record<string, unknown> = {
    "@type": "MusicEvent",
    "@id": url,
    name,
    startDate,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url,
    location: {
      "@type": "Place",
      name: locationName || venue || "Stockholm",
      address: postalAddress(venueAddress(slug)),
    },
    performer: performers(event, name),
  };
  if (description) node.description = description;
  if (venue) node.organizer = { "@type": "Organization", name: venue };
  if (/^https?:\/\//i.test(image)) node.image = image;
  return node;
}

/** Ett graf-objekt, eller null när listan inte har några daterade konserter. */
export function musicEventGraph(events: ConcertEvent[]): Record<string, unknown> | null {
  const graph = events.map(toMusicEvent).filter((node): node is Record<string, unknown> => node !== null);
  if (!graph.length) return null;
  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}
