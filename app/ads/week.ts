import { weekDaysFromMonday } from "@/lib/dates";
import { displayTitle, isCancelledEvent } from "@/lib/events";
import { MONTHS, VENUES, WEEKDAYS, type ConcertEvent, type VenueSlug } from "@/lib/types";

export function posterDate(iso: string): string {
  const parts = iso.split("-");
  const day = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const name = WEEKDAYS[day.getDay()] || "";
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${day.getDate()} ${MONTHS[day.getMonth()]}`;
}

export function eventsInWeek(events: ConcertEvent[], mondayIso: string): ConcertEvent[] {
  const days = new Set(weekDaysFromMonday(mondayIso));
  return events
    .filter((event) => days.has(event.date) && !isCancelledEvent(event))
    .sort((a, b) => {
      const byDate = a.date.localeCompare(b.date);
      if (byDate) return byDate;
      const byTime = (a.time || "").localeCompare(b.time || "");
      if (byTime) return byTime;
      return displayTitle(a).localeCompare(displayTitle(b), "sv");
    });
}

export function venuesIn(events: ConcertEvent[]): { slug: string; name: string }[] {
  const names = new Map<string, string>();
  for (const event of events) {
    const slug = String(event.venue_slug || "");
    if (slug && !names.has(slug)) names.set(slug, event.venue);
  }
  const order = new Map(VENUES.map((venue, index) => [venue.slug, index]));
  return [...names.entries()]
    .map(([slug, name]) => ({ slug, name }))
    .sort((a, b) => {
      const ai = order.get(a.slug as VenueSlug) ?? 999;
      const bi = order.get(b.slug as VenueSlug) ?? 999;
      if (ai !== bi) return ai - bi;
      return a.name.localeCompare(b.name, "sv");
    });
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds} sekunder`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (!rest) return `${minutes} min`;
  return `${minutes} min ${rest} s`;
}
