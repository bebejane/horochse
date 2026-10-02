// Drizzle schema (libSQL / Turso).
//
// Tables are set up ahead of the scraper write path. The `events` id is the
// deterministic `eventId()` slug from `lib/scrapers/events.ts`, so re-scrapes
// upsert idempotently and the archive keeps history.
//
// Add/change tables here, then `pnpm db:generate` to create a migration.

import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/** Scrape sources are not 1:1 with venues: `slaktkyrkan`/`hus7` both emit
 *  `venue_slug: "slakthusen"`. Errors and per-source reconciliation key off
 *  this table. */
export const venues = sqliteTable("venues", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const sources = sqliteTable("sources", {
  key: text("key").primaryKey(),
  venueSlug: text("venue_slug")
    .notNull()
    .references(() => venues.slug),
  label: text("label"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const events = sqliteTable(
  "events",
  {
    // Deterministic `eventId(slug, ident, date)` — preserve the algorithm.
    id: text("id").primaryKey(),
    sourceKey: text("source_key")
      .notNull()
      .references(() => sources.key),
    venueSlug: text("venue_slug")
      .notNull()
      .references(() => venues.slug),
    // Stage/room, e.g. Slakthusen stages (Slaktkyrkan, Hus 7).
    place: text("place"),
    title: text("title").notNull(),
    // Canonical instant (UTC); date/time are Stockholm display fields used for
    // grouping so DST correctness stays in `lib/scrapers/dates.ts`.
    startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
    date: text("date").notNull(),
    time: text("time").notNull(),
    image: text("image"),
    text: text("text"),
    url: text("url").notNull(),
    /** Spotify artist/album link found on the venue page (no inline playback). */
    spotify: text("spotify"),
    // 'active' | 'missing'
    status: text("status").notNull().default("active"),
    cancelled: integer("cancelled", { mode: "boolean" }).notNull().default(false),
    isClub: integer("is_club", { mode: "boolean" }).notNull().default(false),
    firstSeenAt: integer("first_seen_at", { mode: "timestamp_ms" }).notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
    firstRunId: integer("first_run_id"),
    lastRunId: integer("last_run_id"),
    seenCount: integer("seen_count").notNull().default(1),
  },
  (table) => [
    index("events_date_idx").on(table.date),
    index("events_source_status_idx").on(table.sourceKey, table.status),
    index("events_venue_date_idx").on(table.venueSlug, table.date),
    index("events_starts_at_idx").on(table.startsAt),
  ],
);

/** Resolved Bandcamp/SoundCloud media, ordered per event. `bandcamp` /
 *  `soundcloud` on the payload are derived from position 0 at read time. */
export const tracks = sqliteTable(
  "tracks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    source: text("source").notNull(),
    artist: text("artist"),
    album: text("album"),
    title: text("title"),
    url: text("url"),
    image: text("image"),
    bandId: integer("band_id"),
    albumId: integer("album_id"),
    trackId: integer("track_id"),
    /** YouTube: the video id for the embedded player (no direct stream). */
    videoId: text("video_id"),
    // Bandcamp: "a" (album) | "t" (track).
    type: text("type"),
  },
  (table) => [
    uniqueIndex("tracks_event_position_idx").on(table.eventId, table.position),
  ],
);

export const scrapeRuns = sqliteTable("scrape_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  rangeFrom: text("range_from"),
  rangeTo: text("range_to"),
  eventCount: integer("event_count").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  ok: integer("ok", { mode: "boolean" }).notNull().default(true),
});

export const scrapeErrors = sqliteTable("scrape_errors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: integer("run_id")
    .notNull()
    .references(() => scrapeRuns.id, { onDelete: "cascade" }),
  source: text("source")
    .notNull()
    .references(() => sources.key),
  message: text("message").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/**
 * Persistent cache of Bandcamp artist lookups, keyed by the folded artist name.
 * Bandcamp has no public catalog API and its search endpoint is rate-limited, so
 * resolving each artist once and reusing the result across runs (including
 * "no release found") is the main way to keep the track phase fast and avoid 429s.
 * `release` is the serialized Release object, or NULL for a known miss.
 */
export const bandcampArtists = sqliteTable(
  "bandcamp_artists",
  {
    artistKey: text("artist_key").primaryKey(),
    artist: text("artist").notNull(),
    /** Serialized Release JSON, or NULL when the artist has no usable release. */
    release: text("release"),
    found: integer("found", { mode: "boolean" }).notNull().default(false),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("bandcamp_artists_updated_idx").on(table.updatedAt)],
);

/**
 * Persistent cache of YouTube lookups, keyed by the folded artist name.
 * YouTube is the last-resort source: it is searched only when Bandcamp and
 * SoundCloud both miss. Resolved outcomes (including "no usable video") are
 * reused across runs, so the same artist is never searched twice — which is
 * what keeps the key-less, rate-limited search sustainable.
 */
export const youtubeVideos = sqliteTable(
  "youtube_videos",
  {
    artistKey: text("artist_key").primaryKey(),
    artist: text("artist").notNull(),
    /** Serialized track JSON, or NULL for a known miss. */
    video: text("video"),
    found: integer("found", { mode: "boolean" }).notNull().default(false),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("youtube_videos_updated_idx").on(table.updatedAt)],
);
