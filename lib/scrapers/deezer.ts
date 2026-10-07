// Deezer — preview source, preferred over SoundCloud.
//
// Deezer's public API needs no credentials and every track row carries a
// streamable ~30 s MP3 `preview`. Bandcamp is tried first. Deezer is next,
// and SoundCloud only if both miss. The track is marked `preview: true` so the
// UI can present it as a förhandslyssning rather than a full track.
//
// Matching is strict, same as YouTube: Deezer returns something for almost any
// query, so a wrong track is worse than no track. The candidate's artist must
// match on name, generic queries are rejected, and the top result by Deezer's
// own popularity rank wins.

import { httpRequest } from "./http";
import { cleanPersonName, isGenericEvent, namesMatch, sameArtist } from "./text";
import { eventStyles, styleKey, type StyleHint } from "./style";

export type DeezerMatch = {
  id: number;
  artist: string;
  album: string;
  title: string;
  preview: string;
  url: string;
  image: string;
  seconds: number;
  rank: number;
};

type Release = Record<string, any>;
type DeezerArtist = { id: number; name: string; nb_album?: number };
type DeezerAlbum = { id: number; title: string; cover_medium?: string };

// Same generic set YouTube uses: these words are events, not performers.
const GENERIC_ARTIST_NAMES = new Set([
  "jam", "live", "konsert", "concert", "festival", "session", "sessions",
  "dj", "band", "trio", "duo", "kvartett", "quartet", "kvintett", "quintet",
  "sextett", "sextet", "ensemble", "orchestra", "orkester", "musik", "music",
  "bluesjam", "afterwork", "klubb", "club", "support", "gaster", "open mic",
]);

// An artist name is not a sentence: reject sentence punctuation and trailing
// filler, which are almost always event titles rather than performers.
const SENTENCE_ARTIST = /[!?…;"“”]|\b(med|sjunger|presenterar|gästas av)\b/i;

const FRAGMENT_ARTIST = new Set([
  "mamma", "pappa", "mormor", "farmor", "alla", "folk", "mannen", "kvinnan",
  "världen", "himlen", "livet", "kärleken", "stjärnorna", "solen", "månen",
]);

export async function searchDeezer(query: string): Promise<DeezerMatch[]> {
  const raw = await httpRequest(
    "https://api.deezer.com/search?q=" + encodeURIComponent(query) + "&limit=25",
    { extraHeaders: { Accept: "application/json" }, timeoutMs: 15000 },
  );
  const data = JSON.parse(raw) as { data?: any[] };
  return matchesFromRows(data?.data || []);
}

function matchesFromRows(
  rows: any[],
  albumTitle = "",
  albumImage = "",
): DeezerMatch[] {
  const out: DeezerMatch[] = [];
  for (const row of rows) {
    if (!row?.preview || !row?.artist?.name) continue;
    out.push({
      id: Number(row.id),
      artist: String(row.artist.name || ""),
      album: String(row.album?.title || albumTitle),
      title: String(row.title || ""),
      preview: String(row.preview),
      url: String(row.link || (row.id ? "https://www.deezer.com/track/" + row.id : "")),
      image: String(row.album?.cover_medium || albumImage),
      seconds: Number(row.duration || 0),
      rank: Number(row.rank || 0),
    });
  }
  return out;
}

async function deezerJson<T>(path: string): Promise<T> {
  const raw = await httpRequest("https://api.deezer.com" + path, {
    extraHeaders: { Accept: "application/json" },
    timeoutMs: 15000,
  });
  return JSON.parse(raw) as T;
}

function bestDeezerMatch(matches: DeezerMatch[], artist: string): DeezerMatch | undefined {
  return matches
    .map((match) => ({ match, score: scoreDeezer(match, artist) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score)[0]?.match;
}

async function searchDeezerArtistCatalog(artist: string): Promise<DeezerMatch | undefined> {
  const result = await deezerJson<{ data?: DeezerArtist[] }>(
    "/search/artist?q=" + encodeURIComponent(artist) + "&limit=10",
  );
  const artists = (result.data || [])
    .filter((candidate) =>
      candidate?.name &&
      namesMatch(artist, candidate.name) &&
      sameArtist(artist, candidate.name),
    )
    .sort((a, b) =>
      Number(namesMatch(artist, b.name) && namesMatch(b.name, artist)) -
      Number(namesMatch(artist, a.name) && namesMatch(a.name, artist)),
    );

  for (const candidate of artists) {
    const top = await deezerJson<{ data?: any[] }>(
      `/artist/${candidate.id}/top?limit=25`,
    );
    const topMatch = bestDeezerMatch(matchesFromRows(top.data || []), artist);
    if (topMatch) return topMatch;

    const albumResult = await deezerJson<{ data?: DeezerAlbum[] }>(
      `/artist/${candidate.id}/albums?limit=3`,
    );
    const albums = albumResult.data || [];
    const albumMatches = await Promise.all(
      albums.map(async (album) => {
        const tracks = await deezerJson<{ data?: any[] }>(
          `/album/${album.id}/tracks?limit=50`,
        );
        return matchesFromRows(tracks.data || [], album.title, album.cover_medium || "");
      }),
    );
    const catalogMatch = bestDeezerMatch(albumMatches.flat(), artist);
    if (catalogMatch) return catalogMatch;
  }
}

/** Fetch a single track (used by the stream route to resolve a fresh preview). */
export async function deezerTrackById(id: number): Promise<DeezerMatch | null> {
  try {
    const raw = await httpRequest("https://api.deezer.com/track/" + id, {
      extraHeaders: { Accept: "application/json" },
      timeoutMs: 15000,
    });
    const row = JSON.parse(raw) as any;
    const artist = row?.artist?.name || "";
    if (!artist || row?.error?.type) return null;
    return {
      id: Number(id),
      artist,
      album: String(row.album?.title || ""),
      title: String(row.title || ""),
      preview: String(row.preview || ""),
      url: String(row.link || ""),
      image: String(row.album?.cover_medium || row.album?.cover || ""),
      seconds: Number(row.duration || 0),
      rank: Number(row.rank || 0),
    };
  } catch {
    return null;
  }
}

/** Strict score for a candidate; -1 rejects it outright. Highest rank wins. */
export function scoreDeezer(match: DeezerMatch, artist: string): number {
  if (!namesMatch(artist, match.artist) || !sameArtist(artist, match.artist)) return -1;
  if (!match.preview) return -1;
  return match.rank;
}

/**
 * Find a preview for `artist`. Returns a release-like object or null for a
 * definitive miss (which the caller caches so it is never retried).
 */
export async function lookupDeezerArtist(
  query: string,
  cache: Map<string, Release | null>,
  context = "",
  styles?: StyleHint,
): Promise<Release | null> {
  const artist = cleanPersonName(query) || query;
  if (!artist || isGenericEvent(artist)) return null;
  const hint = styles ?? eventStyles("", context);
  const key = "dz:" + cleanPersonName(artist) + styleKey(hint);
  if (cache.has(key)) return cache.get(key) ?? null;

  // A style word ("jazz", "rock") steers a shared name toward the artist the
  // venue and description point at. Fall back to the bare name if that misses.
  const queries = hint.wanted.length ? [artist + " " + hint.wanted[0], artist] : [artist];
  try {
    let best: DeezerMatch | undefined;
    for (const search of queries) {
      const matches = await searchDeezer(search);
      best = bestDeezerMatch(matches, artist);
      if (best) break;
    }
    if (!best) best = await searchDeezerArtistCatalog(artist);
    if (!best) {
      cache.set(key, null);
      return null;
    }
    const release: Release = {
      artist: best.artist,
      album: best.album,
      track: best.title,
      track_id: best.id,
      url: best.url,
      image: best.image,
      preview: best.preview,
      seconds: best.seconds,
      context,
    };
    cache.set(key, release);
    return release;
  } catch {
    // Network failure is not a definitive miss — don't poison the cache.
    return null;
  }
}

export function dzTrack(release: any): Record<string, any> {
  return {
    source: "deezer",
    preview: true,
    artist: release.artist || "",
    album: release.album || "",
    track: release.track || "",
    track_id: String(release.track_id || ""),
    url: release.url || "",
    image: release.image || "",
  };
}
