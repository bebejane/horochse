// Builds the per-subscriber view model for the digest email, and decides
// whether a subscriber is due on a given run. All date logic is Stockholm time;
// the server runs in UTC on Vercel.

import { DateTime } from "luxon";

import type { NewsletterFrequency, NewsletterSubscriber } from "@/lib/db/newsletter";
import { normalizeFrequency, parseVenueList } from "@/lib/db/newsletter";
import {
  collapseSameDayEvents,
  displayTitle,
  eventTimes,
  isCancelledEvent,
  isPlayable,
} from "@/lib/events";
import { findVenue } from "@/lib/seo";
import type { ConcertEvent } from "@/lib/types";
import { MONTHS, VENUES, WEEKDAYS } from "@/lib/types";
import { venueColor } from "./theme";
import { eventIcsUrl, eventSiteUrl, optimizedPosterUrl, siteUrl } from "./site";

export const NEWSLETTER_TZ = "Europe/Stockholm";
export const DIGEST_EVENT_CAP = 80;

export type DigestEventView = {
  id: string;
  title: string;
  time: string;
  venue: string;
  venueColor: string;
  venueUrl: string;
  place: string;
  excerpt: string;
  imageUrl: string;
  listenUrl: string;
  externalUrl: string;
  icsUrl: string;
};

export type DigestDayView = {
  key: string;
  kicker: string;
  rest: string;
  events: DigestEventView[];
};

export type DigestWeekView = {
  key: string;
  title: string;
  count: number;
  listenUrl: string;
  days: DigestDayView[];
};

export type DigestVenueView = {
  name: string;
  color: string;
};

export type DigestView = {
  subject: string;
  preview: string;
  intro: string;
  periodLabel: string;
  frequency: NewsletterFrequency;
  venues: DigestVenueView[];
  weeks: DigestWeekView[];
  eventCount: number;
  capped: boolean;
  manageUrl: string;
  unsubscribeUrl: string;
  siteUrl: string;
};

export function frequencyLabel(frequency: NewsletterFrequency): string {
  return frequency === "weekly" ? "Varje vecka" : "Varje månad";
}

export function frequencyNoun(frequency: NewsletterFrequency): string {
  return frequency === "weekly" ? "veckan" : "månaden";
}

/** Today at midnight in Stockholm. */
export function stockholmToday(): DateTime {
  return DateTime.now().setZone(NEWSLETTER_TZ).startOf("day");
}

/** The event window a digest covers. The site keeps five weeks of events. */
export function digestWindow(
  frequency: NewsletterFrequency,
  now: DateTime = stockholmToday(),
): { from: string; to: string } {
  const from = now.startOf("day");
  const to = frequency === "weekly" ? from.plus({ days: 6 }) : from.plus({ days: 34 });
  return { from: from.toISODate() ?? "", to: to.toISODate() ?? "" };
}

/** Weekly: Mondays, first digest right away, catch up after a missed Monday.
 *  Monthly: the 1st, first digest right away, catch up after a missed 1st. */
export function isDigestDue(
  subscriber: Pick<NewsletterSubscriber, "frequency" | "mailedAt" | "validated">,
  now: DateTime = stockholmToday(),
): boolean {
  if (!subscriber.validated) return false;
  if (!subscriber.mailedAt) return true;
  const mailed = DateTime.fromJSDate(subscriber.mailedAt).setZone(NEWSLETTER_TZ);
  if (subscriber.frequency === "weekly") {
    return now.weekday === 1 || mailed < now.minus({ days: 7 });
  }
  return now.day === 1 || mailed < now.minus({ days: 30 });
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function dayLabel(isoDate: string, today: DateTime): { kicker: string; rest: string } {
  const day = DateTime.fromISO(isoDate, { zone: NEWSLETTER_TZ }).startOf("day");
  if (!day.isValid) return { kicker: "", rest: isoDate };
  let kicker = WEEKDAYS[day.weekday % 7];
  if (day.equals(today)) kicker = "idag";
  else if (day.equals(today.plus({ days: 1 }))) kicker = "imorgon";
  return {
    kicker: capitalize(kicker),
    rest: `${day.day} ${MONTHS[day.month - 1]}`,
  };
}

function mondayFor(isoDate: string): string {
  const day = DateTime.fromISO(isoDate, { zone: NEWSLETTER_TZ }).startOf("day");
  if (!day.isValid) return isoDate;
  return day.minus({ days: day.weekday - 1 }).toISODate() ?? isoDate;
}

function formatSpan(fromIso: string, toIso: string): string {
  const from = DateTime.fromISO(fromIso, { zone: NEWSLETTER_TZ });
  const to = DateTime.fromISO(toIso, { zone: NEWSLETTER_TZ });
  if (!from.isValid || !to.isValid) return "";
  if (from.month === to.month && from.year === to.year) {
    return `${from.day}–${to.day} ${MONTHS[to.month - 1]}`;
  }
  return `${from.day} ${MONTHS[from.month - 1]} – ${to.day} ${MONTHS[to.month - 1]}`;
}

function weekTitle(mondayIso: string, days: string[], today: DateTime): string {
  const thisMonday = today.minus({ days: today.weekday - 1 }).toISODate();
  const nextMonday = today.plus({ days: 8 - today.weekday }).toISODate();
  if (mondayIso === thisMonday) return "Denna veckans konserter";
  if (mondayIso === nextMonday) return "Nästa vecka";
  return formatSpan(days[0] || mondayIso, days[days.length - 1] || mondayIso);
}

function excerpt(value: string | undefined, max = 190): string {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd() + "…";
}

function eventView(event: ConcertEvent): DigestEventView {
  const times = eventTimes(event);
  const place = event.place && event.place !== event.venue ? event.place : "";
  const site = eventSiteUrl(event);
  const external = /^https?:\/\//i.test(event.url || "") ? event.url : site;
  return {
    id: event.id,
    title: displayTitle(event),
    time: times.length ? times.join(" · ") : "Tid saknas",
    venue: event.venue,
    venueColor: venueColor(event.venue_slug),
    venueUrl: findVenue(event.venue_slug) ? siteUrl(`/${event.venue_slug}`) : siteUrl("/"),
    place,
    excerpt: excerpt(event.text),
    imageUrl: optimizedPosterUrl(event.image),
    listenUrl: isPlayable(event) ? site : "",
    externalUrl: external,
    icsUrl: eventIcsUrl(event),
  };
}

export type BuildDigestOptions = {
  subscriber: Pick<NewsletterSubscriber, "venues" | "frequency">;
  events: ConcertEvent[];
  now?: DateTime;
  cap?: number;
  manageUrl: string;
  unsubscribeUrl: string;
  siteUrl: string;
};

/** Build the email view model. Returns `eventCount: 0` when nothing matches. */
export function buildDigest(options: BuildDigestOptions): DigestView {
  const now = options.now ?? stockholmToday();
  const cap = options.cap ?? DIGEST_EVENT_CAP;
  const frequency = normalizeFrequency(options.subscriber.frequency);
  const venueSlugs = parseVenueList(options.subscriber.venues);
  const venueSet = new Set(venueSlugs);
  const { from, to } = digestWindow(frequency, now);

  const matched = collapseSameDayEvents(
    options.events.filter(
      (event) =>
        !isCancelledEvent(event) &&
        venueSet.has(event.venue_slug) &&
        Boolean(event.date) &&
        event.date >= from &&
        event.date <= to,
    ),
  ).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  const capped = matched.length > cap;
  const included = capped ? matched.slice(0, cap) : matched;

  const weekMap = new Map<string, { days: Map<string, ConcertEvent[]>; all: ConcertEvent[] }>();
  for (const event of included) {
    const monday = mondayFor(event.date);
    let week = weekMap.get(monday);
    if (!week) {
      week = { days: new Map(), all: [] };
      weekMap.set(monday, week);
    }
    week.all.push(event);
    const day = week.days.get(event.date);
    if (day) day.push(event);
    else week.days.set(event.date, [event]);
  }

  const weeks: DigestWeekView[] = [...weekMap.entries()].map(([monday, week]) => {
    const days: DigestDayView[] = [...week.days.entries()].map(([date, dayEvents]) => {
      const label = dayLabel(date, now);
      return {
        key: date,
        kicker: label.kicker,
        rest: label.rest,
        events: dayEvents.map(eventView),
      };
    });
    const first = week.all[0];
    return {
      key: monday,
      title: weekTitle(
        monday,
        days.map((day) => day.key),
        now,
      ),
      count: week.all.length,
      listenUrl: first ? eventSiteUrl(first) : options.siteUrl,
      days,
    };
  });

  const venueNames = VENUES.filter((venue) => venueSet.has(venue.slug)).sort((a, b) =>
    a.name.localeCompare(b.name, "sv"),
  );
  const venues: DigestVenueView[] = venueNames.map((venue) => ({
    name: venue.name,
    color: venueColor(venue.slug),
  }));

  const firstDate = included[0]?.date ?? from;
  const lastDate = included[included.length - 1]?.date ?? to;
  const span = formatSpan(firstDate, lastDate);
  const periodLabel = frequency === "weekly" ? `Vecka ${now.weekNumber}` : span;
  const subject = span
    ? `Hör & Se: konserter ${span}`
    : `Hör & Se: konserter ${frequencyNoun(frequency)}`;
  const preview = included.length
    ? `${included.length} konserter på ${venues.map((venue) => venue.name).join(", ")}`
    : "Inga konserter i den här perioden";

  return {
    subject,
    preview,
    intro: `Här är konserterna på scenerna du följer den kommande ${frequencyNoun(
      frequency,
    )}.`,
    periodLabel,
    frequency,
    venues,
    weeks,
    eventCount: included.length,
    capped,
    manageUrl: options.manageUrl,
    unsubscribeUrl: options.unsubscribeUrl,
    siteUrl: options.siteUrl,
  };
}
