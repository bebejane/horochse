import { iso, nowSthlm, weekBounds } from "./dates";
import { getHttpConcurrency, withHttpConcurrency } from "./http";
import { log, mapPool, seconds, warn, withTimeout } from "./log";
import { SOURCES } from "./registry";
import { isCancelled, isClubNight, normalizeEventTitles } from "./text";
import { attachTracks } from "./tracks";
import type { ArtistCacheEntry } from "./tracks";
import type { EventsPayload, ScrapedEvent } from "./types";

export type CollectOptions = {
  only?: string;
  concurrency?: number;
  trackConcurrency?: number;
  tracks?: boolean;
  quiet?: boolean;
  sourceTimeoutMs?: number;
  artistTimeoutMs?: number;
  /** Preloaded Bandcamp artist cache (folded name → entry). */
  bandcampCache?: Map<string, ArtistCacheEntry>;
  /** Collects newly resolved artists to persist after the run. */
  bandcampUpdates?: Map<string, { artist: string; release: Record<string, unknown> | null }>;
  /** Preloaded YouTube cache (folded name → entry). */
  youtubeCache?: Map<string, ArtistCacheEntry>;
  /** Collects newly resolved YouTube artists to persist after the run. */
  youtubeUpdates?: Map<string, { artist: string; release: Record<string, unknown> | null }>;
};

export type CollectResult = EventsPayload & {
  /** Which source produced each event id (not part of events.json). */
  provenance: Record<string, string>;
  /** Sources that ran and finished without error. */
  okSources: string[];
};

const DEFAULT_SOURCE_TIMEOUT_MS = 90000;

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export async function collect(opts: CollectOptions = {}): Promise<CollectResult> {
  const { only, quiet = false } = opts;
  const concurrency = opts.concurrency ?? 4;
  const sourceTimeoutMs = opts.sourceTimeoutMs ?? DEFAULT_SOURCE_TIMEOUT_MS;
  const [start, end] = weekBounds();
  const sources = only ? SOURCES.filter(([name]) => name === only) : SOURCES;
  const errors: Record<string, string> = {};
  const provenance: Record<string, string> = {};
  const okSources: string[] = [];
  let events: ScrapedEvent[] = [];

  log(
    `Hör & Se-scrape: ${start.toFormat("yyyy-MM-dd")} → ${end.toFormat("yyyy-MM-dd")} (5 veckor), ` +
      `${sources.length} källor, http-concurrency ${getHttpConcurrency()}, ` +
      `käll-timeout ${Math.round(sourceTimeoutMs / 1000)}s`,
  );

  const tSources = Date.now();
  const results = await mapPool(sources, concurrency, async ([name, fn]) => {
    const t = Date.now();
    if (!quiet) log(`→ ${name}`);
    try {
      const batch = await withTimeout(fn(start, end), sourceTimeoutMs, name);
      okSources.push(name);
      if (!quiet) log(`✓ ${name}: ${batch.length} konserter (${seconds(Date.now() - t)})`);
      return batch;
    } catch (exc) {
      errors[name] = String(exc);
      warn(`✗ ${name}: FEL — ${exc}`);
      return [] as ScrapedEvent[];
    }
  });
  results.forEach((batch, i) => {
    const name = sources[i][0];
    for (const event of batch) provenance[event.id] = name;
    events.push(...batch);
  });
  log(
    `Källor klara: ${events.length} konserter, ${Object.keys(errors).length} fel (${seconds(Date.now() - tSources)})`,
  );

  const skippedClub = events.filter((event) => isClubNight(event.title || "", event.text || ""));
  const skippedCancelled = events.filter((event) => isCancelled(event.title || "", event.text || ""));
  const skipIds = new Set([...skippedClub, ...skippedCancelled].map((event) => event.id));
  if (skipIds.size) {
    events = events.filter((event) => !skipIds.has(event.id));
    log(
      `Filtrerade bort ${skipIds.size} (${skippedClub.length} klubbkvällar, ${skippedCancelled.length} inställda)`,
    );
  }

  events.sort((a, b) => cmp(a.datetime || "", b.datetime || "") || cmp(a.title || "", b.title || ""));

  if (opts.tracks !== false) {
    const trackConcurrency = opts.trackConcurrency ?? 16;
    log(
      `Låtar: söker Bandcamp/SoundCloud för ${events.length} event ` +
        `(artist-pool ${concurrency}, http-cap ${trackConcurrency})`,
    );
    await withHttpConcurrency(trackConcurrency, () =>
      attachTracks(events, {
        concurrency,
        quiet,
        artistTimeoutMs: opts.artistTimeoutMs,
        bandcampCache: opts.bandcampCache,
        bandcampUpdates: opts.bandcampUpdates,
        youtubeCache: opts.youtubeCache,
        youtubeUpdates: opts.youtubeUpdates,
      }),
    );
  } else {
    log("Låtar: hoppar över (--no-tracks)");
  }

  log("Titelnormalisering…");
  normalizeEventTitles(events);

  return {
    updated: iso(nowSthlm()),
    range: { from: start.toFormat("yyyy-MM-dd"), to: end.toFormat("yyyy-MM-dd") },
    errors,
    events,
    provenance,
    okSources,
  };
}
