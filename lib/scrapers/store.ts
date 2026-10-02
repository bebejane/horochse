// Scrape → Turso write path.
//
// One shared entry point (`scrapeAndStore`) used by both the Vercel cron route
// (`app/api/cron/scrape`) and the CLI (`scripts/scrape-to-db.ts`). It imports
// `./db/client` indirectly through the query helpers, which deliberately avoid
// `server-only` so `tsx` scripts reuse them.
//
// The app still reads `public/data/events.json`; this module only writes the
// archive. Switching the read path is a separate change.

import { DateTime } from "luxon";

import type { CollectOptions } from "./collect";
import { collect } from "./collect";
import { log, seconds } from "./log";
import type { ScrapedEvent } from "./types";
import { SOURCES } from "./registry";
import { VENUES } from "@/lib/types";
import type { EventInput, SourceInput, VenueInput } from "@/lib/db/queries";
import {
  finishScrapeRun,
  loadBandcampArtists,
  loadYoutubeVideos,
  reconcileSource,
  recordScrapeErrors,
  saveBandcampArtists,
  saveYoutubeVideos,
  startScrapeRun,
  upsertEvents,
  upsertSources,
  upsertVenues,
} from "@/lib/db/queries";

export type StoreSummary = {
  runId: number;
  eventCount: number;
  sourceCount: number;
  errorCount: number;
  ok: boolean;
  errors: Record<string, string>;
  reconciled: Record<string, number>;
  durationMs: number;
};

const SOURCE_KEYS = new Set(SOURCES.map(([name]) => name));

function toStartsAt(event: ScrapedEvent): Date {
  const raw = event.datetime;
  if (raw) {
    const dt = DateTime.fromISO(raw, { setZone: true });
    if (dt.isValid) return dt.toJSDate();
  }
  const dt = DateTime.fromISO(`${event.date}T${event.time || "19:00"}`, {
    zone: "Europe/Stockholm",
  });
  return dt.isValid ? dt.toJSDate() : new Date();
}

/**
 * Seed `venues` + `sources`. Both are foreign-key targets of `events`, so this
 * must run before any event upsert. Derived from the scanned events plus the
 * canonical `VENUES`/`SOURCES` lists so the ids always resolve.
 */
export async function seedReference(events: ScrapedEvent[], provenance: Record<string, string>): Promise<{
  venueRows: VenueInput[];
  sourceRows: SourceInput[];
}> {
  const venueBySlug = new Map<string, string>(VENUES.map((v) => [v.slug, v.name]));
  for (const event of events) {
    if (event.venue_slug && !venueBySlug.has(event.venue_slug)) {
      venueBySlug.set(event.venue_slug, event.venue || event.venue_slug);
    }
  }

  // source key -> venue slug: the venue slug of the first event it produced,
  // else the venue slug known to share its name, else "slakthusen" only for the
  // Slakthusen stages. Non-Slakthusen sources are seeded from the same-named
  // venue in `VENUES`.
  const sourceVenue = new Map<string, string>();
  for (const event of events) {
    const source = provenance[event.id];
    if (!source || sourceVenue.has(source)) continue;
    sourceVenue.set(source, event.venue_slug);
  }
  const SLAKTHUSEN_STAGES = new Set(["slaktkyrkan", "hus7"]);
  for (const key of SOURCE_KEYS) {
    if (sourceVenue.has(key)) continue;
    if (SLAKTHUSEN_STAGES.has(key)) sourceVenue.set(key, "slakthusen");
    else if (venueBySlug.has(key)) sourceVenue.set(key, key);
    else sourceVenue.set(key, "slakthusen");
  }
  // Every source's venue must exist as a row.
  for (const slug of sourceVenue.values()) {
    if (!venueBySlug.has(slug)) venueBySlug.set(slug, slug);
  }

  const venueRows: VenueInput[] = [...venueBySlug].map(([slug, name]) => ({ slug, name }));
  const sourceRows: SourceInput[] = [...sourceVenue].map(([key, venueSlug]) => ({
    key,
    venueSlug,
    label: key,
  }));
  return { venueRows, sourceRows };
}

function toEventInput(event: ScrapedEvent, sourceKey: string): EventInput {
  return {
    id: event.id,
    sourceKey,
    venueSlug: event.venue_slug,
    place: event.place ?? null,
    title: event.title,
    startsAt: toStartsAt(event),
    date: event.date,
    time: event.time,
    image: event.image ?? null,
    text: event.text ?? null,
    url: event.url,
    spotify: event.spotify ?? null,
    tracks: (event.tracks ?? []).map((track) => ({
      source: track.source,
      artist: track.artist ?? null,
      album: track.album ?? null,
      title: track.track ?? null,
      url: track.url ?? null,
      image: track.image ?? null,
      bandId: track.band_id ?? null,
      albumId: track.album_id ?? null,
      trackId: track.track_id ?? null,
      videoId: track.video_id ?? null,
      type: track.type ?? null,
    })),
  };
}

/** Run the scraper and persist the result to Turso. Returns a run summary. */
export async function scrapeAndStore(opts: CollectOptions = {}): Promise<StoreSummary> {
  const started = Date.now();
  const runId = await startScrapeRun();
  log(`DB: scrape_run #${runId} startad`);

  try {
    const bandcampCache = await loadBandcampArtists();
    const bandcampUpdates = new Map<
      string,
      { artist: string; release: Record<string, unknown> | null }
    >();
    if (bandcampCache.size) log(`DB: ${bandcampCache.size} bandcamp-artister i cache`);

    const youtubeCache = await loadYoutubeVideos();
    const youtubeUpdates = new Map<
      string,
      { artist: string; release: Record<string, unknown> | null }
    >();
    if (youtubeCache.size) log(`DB: ${youtubeCache.size} youtube-videor i cache`);

    const result = await collect({ ...opts, bandcampCache, bandcampUpdates, youtubeCache, youtubeUpdates });
    const { events, provenance, okSources, errors } = result;

    if (bandcampUpdates.size) {
      await saveBandcampArtists(bandcampUpdates);
      log(`DB: ${bandcampUpdates.size} bandcamp-artister cachade`);
    }

    if (youtubeUpdates.size) {
      await saveYoutubeVideos(youtubeUpdates);
      log(`DB: ${youtubeUpdates.size} youtube-videor cachade`);
    }

    const { venueRows, sourceRows } = await seedReference(events, provenance);
    await upsertVenues(venueRows);
    await upsertSources(sourceRows);
    log(`DB: ${venueRows.length} scener, ${sourceRows.length} källor seedade`);

    // Upsert per source so reconciliation can be scoped and only for sources
    // that finished cleanly (a failed venue keeps its previous events live).
    const bySource = new Map<string, ScrapedEvent[]>();
    for (const event of events) {
      const source = provenance[event.id];
      if (!source) continue;
      const list = bySource.get(source);
      if (list) list.push(event);
      else bySource.set(source, [event]);
    }

    let stored = 0;
    for (const [source, batch] of bySource) {
      await upsertEvents(
        runId,
        batch.map((event) => toEventInput(event, source)),
      );
      stored += batch.length;
    }
    log(`DB: ${stored} event upsertade från ${bySource.size} källor`);

    const reconciled: Record<string, number> = {};
    for (const source of okSources) {
      const seenIds = (bySource.get(source) ?? []).map((event) => event.id);
      reconciled[source] = await reconcileSource(source, seenIds);
    }

    await recordScrapeErrors(runId, errors);
    const ok = Object.keys(errors).length === 0;
    await finishScrapeRun(runId, {
      rangeFrom: result.range?.from ?? null,
      rangeTo: result.range?.to ?? null,
      eventCount: stored,
      errorCount: Object.keys(errors).length,
      ok,
    });

    const durationMs = Date.now() - started;
    log(
      `DB: scrape_run #${runId} klar — ${stored} event, ${Object.keys(errors).length} fel (${seconds(durationMs)})`,
    );
    return {
      runId,
      eventCount: stored,
      sourceCount: bySource.size,
      errorCount: Object.keys(errors).length,
      ok,
      errors,
      reconciled,
      durationMs,
    };
  } catch (err) {
    await finishScrapeRun(runId, {
      errorCount: 1,
      ok: false,
    }).catch(() => {});
    throw err;
  }
}
