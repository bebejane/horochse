import type { ConcertEvent } from "./types";

export function trackCalendarDownload(event: Pick<ConcertEvent, "id" | "venue_slug">): void {
  const { gtag } = window as Window & {
    gtag?: (command: "event", name: string, params: Record<string, string>) => void;
  };

  gtag?.("event", "calendar_download", {
    concert_id: event.id,
    venue_slug: event.venue_slug,
  });
}
