import { trackArtistKey } from "@/lib/scrapers/text";

import type { TrackInput } from "./queries";

export type TrackOverrideInput = {
  artistKey: string;
  action: string;
  source?: string | null;
  artist?: string | null;
  album?: string | null;
  title?: string | null;
  url?: string | null;
  image?: string | null;
  bandId?: number | null;
  albumId?: number | null;
  trackId?: number | null;
  videoId?: string | null;
  type?: string | null;
};

function keyOf(item: TrackInput): string {
  return trackArtistKey(item.artist, item.title, item.url);
}

/** Slå ihop skrapade låtar med manuella byten och borttagningar. */
export function mergeScrapedTracks(scraped: TrackInput[], overrides: TrackOverrideInput[]): TrackInput[] {
  const removed = new Set(
    overrides.filter((row) => row.action === "remove" && row.artistKey).map((row) => row.artistKey),
  );
  const blocked = new Set(removed);
  const replacements: TrackInput[] = [];

  for (const row of overrides) {
    if (!row.artistKey) continue;
    blocked.add(row.artistKey);
    if (row.action !== "replace" || !row.source) continue;
    const item: TrackInput = {
      source: row.source,
      artist: row.artist ?? null,
      album: row.album ?? null,
      title: row.title ?? null,
      url: row.url ?? null,
      image: row.image ?? null,
      bandId: row.bandId ?? null,
      albumId: row.albumId ?? null,
      trackId: row.trackId ?? null,
      videoId: row.videoId ?? null,
      type: row.type ?? null,
    };
    const key = keyOf(item);
    if (key && removed.has(key)) continue;
    replacements.push(item);
  }

  const kept = scraped.filter((item) => {
    const key = keyOf(item);
    return !key || !blocked.has(key);
  });
  return dedupeTracks([...replacements, ...kept]);
}

export function dedupeTracks(items: TrackInput[]): TrackInput[] {
  const seen = new Set<string>();
  const out: TrackInput[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(item);
  }
  return out;
}
