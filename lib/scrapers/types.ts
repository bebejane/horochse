import type { DateTime } from "luxon";

export type ScrapedTrack = {
  source: string;
  artist?: string;
  album?: string;
  track?: string;
  url?: string;
  image?: string;
  band_id?: number | null;
  album_id?: number | null;
  track_id?: number | null;
  type?: string;
};

export type ScrapedEvent = {
  id: string;
  venue: string;
  venue_slug: string;
  title: string;
  date: string;
  time: string;
  datetime: string;
  image: string;
  text: string;
  url: string;
  place: string;
  tracks?: ScrapedTrack[];
  bandcamp?: Record<string, unknown>;
  soundcloud?: Record<string, unknown>;
  _bandcamp_links?: string[];
  _soundcloud_links?: string[];
};

export type VenueFetch = (start: DateTime, end: DateTime) => Promise<ScrapedEvent[]>;

export type EventsPayload = {
  updated: string;
  range: { from: string; to: string };
  errors: Record<string, string>;
  events: ScrapedEvent[];
};
