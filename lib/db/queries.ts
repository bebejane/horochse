// Data-access helpers for the scraped-event archive.
//
// Imports `./client` (not `./index`) so the future scraper script can reuse
// these with `tsx` without tripping `server-only`. The read helpers rebuild the
// exact `EventsPayload` / `ConcertEvent` shapes the app already consumes;
// `bandcamp` / `soundcloud` and `times` are derived, not stored.

import { DateTime } from "luxon";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  notInArray,
  sql,
} from "drizzle-orm";

import type { ConcertEvent, EventsPayload, Track } from "@/lib/types";

import { db } from "./client";
import { bandcampArtists, events, scrapeErrors, scrapeRuns, sources, tracks, venues } from "./schema";

type EventRow = typeof events.$inferSelect;
type TrackRow = typeof tracks.$inferSelect;

// Stockholm display zone; single source of truth is lib/scrapers/dates.ts.
const TZ = "Europe/Stockholm";

/* -------------------------------------------------------------------------- */
/* Write side (used by the scraper once it is wired up)                        */
/* -------------------------------------------------------------------------- */

export type VenueInput = {
  slug: string;
  name: string;
  address?: string | null;
  active?: boolean;
};

export type SourceInput = {
  key: string;
  venueSlug: string;
  label?: string | null;
  active?: boolean;
};

export type TrackInput = {
  source: string;
  artist?: string | null;
  album?: string | null;
  title?: string | null;
  url?: string | null;
  image?: string | null;
  bandId?: number | null;
  albumId?: number | null;
  trackId?: number | null;
  type?: string | null;
};

export type EventInput = {
  /** Deterministic `eventId()` slug. */
  id: string;
  sourceKey: string;
  venueSlug: string;
  place?: string | null;
  title: string;
  /** Canonical instant; `date`/`time` are the Stockholm display fields. */
  startsAt: Date;
  date: string;
  time: string;
  image?: string | null;
  text?: string | null;
  url: string;
  cancelled?: boolean;
  isClub?: boolean;
  tracks?: TrackInput[];
};

export async function upsertVenues(rows: VenueInput[]): Promise<void> {
  if (!rows.length) return;
  await db
    .insert(venues)
    .values(
      rows.map((row) => ({
        slug: row.slug,
        name: row.name,
        address: row.address ?? null,
        active: row.active ?? true,
      })),
    )
    .onConflictDoUpdate({
      target: venues.slug,
      set: {
        name: sql`excluded.name`,
        address: sql`excluded.address`,
        active: sql`excluded.active`,
      },
    });
}

export async function upsertSources(rows: SourceInput[]): Promise<void> {
  if (!rows.length) return;
  await db
    .insert(sources)
    .values(
      rows.map((row) => ({
        key: row.key,
        venueSlug: row.venueSlug,
        label: row.label ?? null,
        active: row.active ?? true,
      })),
    )
    .onConflictDoUpdate({
      target: sources.key,
      set: {
        venueSlug: sql`excluded.venue_slug`,
        label: sql`excluded.label`,
        active: sql`excluded.active`,
      },
    });
}

export async function startScrapeRun(startedAt: Date = new Date()): Promise<number> {
  const [row] = await db
    .insert(scrapeRuns)
    .values({ startedAt })
    .returning({ id: scrapeRuns.id });
  return row.id;
}

export type RunPatch = {
  finishedAt?: Date;
  rangeFrom?: string | null;
  rangeTo?: string | null;
  eventCount?: number;
  errorCount?: number;
  ok?: boolean;
};

export async function finishScrapeRun(id: number, patch: RunPatch = {}): Promise<void> {
  const set: Record<string, unknown> = { finishedAt: patch.finishedAt ?? new Date() };
  if (patch.rangeFrom !== undefined) set.rangeFrom = patch.rangeFrom;
  if (patch.rangeTo !== undefined) set.rangeTo = patch.rangeTo;
  if (patch.eventCount !== undefined) set.eventCount = patch.eventCount;
  if (patch.errorCount !== undefined) set.errorCount = patch.errorCount;
  if (patch.ok !== undefined) set.ok = patch.ok;
  await db.update(scrapeRuns).set(set).where(eq(scrapeRuns.id, id));
}

export async function recordScrapeErrors(
  runId: number,
  errors: Record<string, string>,
): Promise<void> {
  const entries = Object.entries(errors);
  if (!entries.length) return;
  await db.insert(scrapeErrors).values(
    entries.map(([source, message]) => ({
      runId,
      source,
      message,
      createdAt: new Date(),
    })),
  );
}

function eventRow(runId: number, input: EventInput, now: Date): EventRow {
  return {
    id: input.id,
    sourceKey: input.sourceKey,
    venueSlug: input.venueSlug,
    place: input.place ?? null,
    title: input.title,
    startsAt: input.startsAt,
    date: input.date,
    time: input.time,
    image: input.image ?? null,
    text: input.text ?? null,
    url: input.url,
    status: "active",
    cancelled: input.cancelled ?? false,
    isClub: input.isClub ?? false,
    firstSeenAt: now,
    lastSeenAt: now,
    firstRunId: runId,
    lastRunId: runId,
    seenCount: 1,
  };
}

function trackRow(eventId: string, position: number, input: TrackInput) {
  return {
    eventId,
    position,
    source: input.source,
    artist: input.artist ?? null,
    album: input.album ?? null,
    title: input.title ?? null,
    url: input.url ?? null,
    image: input.image ?? null,
    bandId: input.bandId ?? null,
    albumId: input.albumId ?? null,
    trackId: input.trackId ?? null,
    type: input.type ?? null,
  };
}

function eventUpsertStatement(runId: number, input: EventInput, now: Date) {
  const row = eventRow(runId, input, now);
  return db
    .insert(events)
    .values(row)
    .onConflictDoUpdate({
      target: events.id,
      set: {
        sourceKey: row.sourceKey,
        venueSlug: row.venueSlug,
        place: row.place,
        title: row.title,
        startsAt: row.startsAt,
        date: row.date,
        time: row.time,
        image: row.image,
        text: row.text,
        url: row.url,
        status: "active",
        cancelled: row.cancelled,
        isClub: row.isClub,
        lastSeenAt: row.lastSeenAt,
        lastRunId: row.lastRunId,
        seenCount: sql`${events.seenCount} + 1`,
      },
    });
}

/**
 * Upsert a batch of events and replace their tracks.
 *
 * Uses `db.batch` (one atomic HTTP round-trip) instead of an interactive
 * `db.transaction`: Turso's remote `libsql://` transport does not reliably
 * support interactive transactions and hangs on `BEGIN`. Statements run in
 * array order inside a single transaction, so per event the order is:
 * upsert event → delete its tracks → insert new tracks.
 */
export async function upsertEvents(runId: number, inputs: EventInput[]): Promise<void> {
  if (!inputs.length) return;
  const now = new Date();
  const statements: unknown[] = [];

  for (const input of inputs) {
    const row = eventRow(runId, input, now);
    statements.push(eventUpsertStatement(runId, input, now));
    statements.push(db.delete(tracks).where(eq(tracks.eventId, row.id)));
    if (input.tracks?.length) {
      statements.push(
        db
          .insert(tracks)
          .values(input.tracks.map((item, index) => trackRow(row.id, index, item))),
      );
    }
  }

  // db.batch expects a non-empty tuple; the array is guaranteed non-empty here.
  await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
}

/* -------------------------------------------------------------------------- */
/* Bandcamp artist cache                                                       */
/* -------------------------------------------------------------------------- */

export type ArtistCacheEntry = { release: Record<string, unknown> | null; found: boolean };

/** Load the whole Bandcamp artist cache into memory (folded name → entry). */
export async function loadBandcampArtists(): Promise<Map<string, ArtistCacheEntry>> {
  const map = new Map<string, ArtistCacheEntry>();
  const rows = await db.select().from(bandcampArtists);
  for (const row of rows) {
    map.set(row.artistKey, { release: row.release ? JSON.parse(row.release) : null, found: row.found });
  }
  return map;
}

/** Persist cache entries (upsert) in one batch. Only pass keys touched this run. */
export async function saveBandcampArtists(
  entries: Map<string, { artist: string; release: Record<string, unknown> | null }>,
): Promise<void> {
  if (!entries.size) return;
  const now = new Date();
  const rows = [...entries].map(([artistKey, entry]) => ({
    artistKey,
    artist: entry.artist,
    release: entry.release ? JSON.stringify(entry.release) : null,
    found: entry.release !== null,
    updatedAt: now,
  }));
  await db
    .insert(bandcampArtists)
    .values(rows)
    .onConflictDoUpdate({
      target: bandcampArtists.artistKey,
      set: {
        artist: sql`excluded.artist`,
        release: sql`excluded.release`,
        found: sql`excluded.found`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}

/**
 * Demote the active events of a source that did not reappear this run.
 * Only call for sources that actually ran and finished without error, so a
 * failed venue keeps its previously-seen events live.
 */
export async function reconcileSource(
  sourceKey: string,
  seenIds: string[],
): Promise<number> {
  const conditions = [eq(events.sourceKey, sourceKey), eq(events.status, "active")];
  if (seenIds.length) conditions.push(notInArray(events.id, seenIds));
  const result = await db
    .update(events)
    .set({ status: "missing" })
    .where(and(...conditions));
  return result.rowsAffected;
}

/* -------------------------------------------------------------------------- */
/* Read side                                                                   */
/* -------------------------------------------------------------------------- */

export type LoadOptions = { since?: string };

export async function getLatestRun() {
  const [row] = await db
    .select()
    .from(scrapeRuns)
    .orderBy(desc(scrapeRuns.id))
    .limit(1);
  return row ?? null;
}

function isoFromDate(value: Date | number): string {
  const date = value instanceof Date ? value : new Date(value);
  return DateTime.fromJSDate(date).setZone(TZ).toISO({ suppressMilliseconds: true }) ?? "";
}

function toTrack(row: TrackRow): Track {
  return {
    source: row.source,
    artist: row.artist ?? undefined,
    album: row.album ?? undefined,
    track: row.title ?? undefined,
    url: row.url ?? undefined,
    image: row.image ?? undefined,
    band_id: row.bandId ?? undefined,
    album_id: row.albumId ?? undefined,
    track_id: row.trackId ?? undefined,
    type: row.type ?? undefined,
  };
}

function toConcertEvent(row: EventRow, venueName: string, trackRows: TrackRow[]): ConcertEvent {
  const list = trackRows.map(toTrack);
  const event: ConcertEvent = {
    id: row.id,
    venue: venueName,
    venue_slug: row.venueSlug,
    title: row.title,
    date: row.date,
    time: row.time,
    datetime: isoFromDate(row.startsAt),
    image: row.image ?? "",
    text: row.text ?? "",
    url: row.url,
    place: row.place ?? "",
  };
  if (list.length) {
    event.tracks = list;
    const first = list[0];
    if (first.source === "bandcamp") event.bandcamp = first;
    else event.soundcloud = first;
  }
  return event;
}

async function trackRowsFor(eventIds: string[]): Promise<Map<string, TrackRow[]>> {
  const grouped = new Map<string, TrackRow[]>();
  if (!eventIds.length) return grouped;
  const rows = await db
    .select()
    .from(tracks)
    .where(inArray(tracks.eventId, eventIds))
    .orderBy(asc(tracks.eventId), asc(tracks.position));
  for (const row of rows) {
    const list = grouped.get(row.eventId);
    if (list) list.push(row);
    else grouped.set(row.eventId, [row]);
  }
  return grouped;
}

/** The feed payload. Defaults `since` to the latest run's window start. */
export async function loadPayload(opts: LoadOptions = {}): Promise<EventsPayload> {
  const run = await getLatestRun();
  const since = opts.since ?? run?.rangeFrom ?? undefined;

  const conditions = [
    eq(events.status, "active"),
    eq(events.cancelled, false),
    eq(events.isClub, false),
  ];
  if (since) conditions.push(gte(events.date, since));

  const rows = await db
    .select({ event: events, venueName: venues.name })
    .from(events)
    .innerJoin(venues, eq(events.venueSlug, venues.slug))
    .where(and(...conditions))
    .orderBy(asc(events.date), asc(events.time), asc(events.title));

  const byEvent = await trackRowsFor(rows.map((row) => row.event.id));

  const errors: Record<string, string> = {};
  if (run) {
    const errorRows = await db
      .select()
      .from(scrapeErrors)
      .where(eq(scrapeErrors.runId, run.id));
    for (const error of errorRows) errors[error.source] = error.message;
  }

  return {
    updated: run ? isoFromDate(run.finishedAt ?? run.startedAt) : undefined,
    range:
      run && run.rangeFrom && run.rangeTo
        ? { from: run.rangeFrom, to: run.rangeTo }
        : null,
    errors,
    events: rows.map((row) =>
      toConcertEvent(row.event, row.venueName, byEvent.get(row.event.id) ?? []),
    ),
  };
}

export async function loadEvents(opts: LoadOptions = {}): Promise<ConcertEvent[]> {
  return (await loadPayload(opts)).events ?? [];
}

export async function findEvent(id: string): Promise<ConcertEvent | null> {
  const [row] = await db
    .select({ event: events, venueName: venues.name })
    .from(events)
    .innerJoin(venues, eq(events.venueSlug, venues.slug))
    .where(eq(events.id, id))
    .limit(1);
  if (!row) return null;
  const trackRows = await db
    .select()
    .from(tracks)
    .where(eq(tracks.eventId, id))
    .orderBy(asc(tracks.position));
  return toConcertEvent(row.event, row.venueName, trackRows);
}
