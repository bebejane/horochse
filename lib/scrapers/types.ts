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
  /** YouTube video id (embedded player, no direct stream). */
  video_id?: string | null;
  /** SoundCloud fallback playable only through the embedded widget. */
  widgetOnly?: boolean;
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
  youtube?: Record<string, unknown>;
  /** Deezer link (30 s preview) — the last-resort playback source. */
  deezer?: Record<string, unknown>;
  /** Spotify link shown in the UI (no inline playback). */
  spotify?: string;
  _bandcamp_links?: string[];
  _soundcloud_links?: string[];
  _spotify_links?: { kind: string; id: string; url: string }[];
  /** Ticketmaster artist page. Used to fill a blurb, then dropped. */
  _artist_url?: string;
};

export type VenueFetch = (start: DateTime, end: DateTime) => Promise<ScrapedEvent[]>;

export type EventsPayload = {
  updated: string;
  range: { from: string; to: string };
  errors: Record<string, string>;
  events: ScrapedEvent[];
};
