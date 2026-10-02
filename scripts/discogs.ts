// Discogs — authoritative artist/release resolution.
//
// Replaces YouTube *search* as the last-resort track source. Where the YouTube
// matcher guessed from a free-text query (and confidently attached Queen to a
// Nils Landgren concert), Discogs resolves an exact artist entity first, then
// reads the moderated `videos[]` array on that artist's releases. The videos
// are real YouTube links, but they arrive pre-associated with the right artist
// and release, which is the disambiguation the search never had.
//
// Auth: a personal access token (`DISCOGS_TOKEN`) raises the rate limit from
// 25 to 60 req/min. A unique User-Agent is mandatory — Discogs returns empty
// responses without one, and may silently block apps that impersonate a
// browser.
//
// Rate limiting tracks a moving average over 60 s, so calls are paced locally
// (see `discogsGet`) rather than fired wide.

import { httpRequest, HttpError } from "../lib/scrapers/http";
import { cleanPersonName, foldName, isGenericEvent, sameArtist } from "../lib/scrapers/text";

export const DISCOGS_TOKEN = process.env.DISCOGS_TOKEN || "";

const UA = "HorOchSe/0.1 +https://horochse.app";
const API = "https://api.discogs.com";

// 60/min authenticated, 25/min anonymous. Leave headroom for the moving average.
const MIN_INTERVAL_MS = DISCOGS_TOKEN ? 1100 : 2600;

let chain: Promise<unknown> = Promise.resolve();
let lastAt = 0;
let rateLimitedUntil = 0;

function pace(): Promise<void> {
  const step = async (): Promise<void> => {
    const now = Date.now();
    const wait = Math.max(0, Math.max(lastAt + MIN_INTERVAL_MS, rateLimitedUntil) - now);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastAt = Date.now();
  };
  const next = chain.then(step, step);
  chain = next.catch(() => undefined);
  return next;
}

async function discogsGet(path: string): Promise<any | null> {
  await pace();
  const url = API + path;
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "application/json",
    "Accept-Encoding": "gzip",
  };
  if (DISCOGS_TOKEN) headers.Authorization = "Discogs token=" + DISCOGS_TOKEN;
  try {
    const raw = await httpRequest(url, { extraHeaders: headers, timeoutMs: 20000 });
    return JSON.parse(raw);
  } catch (err) {
    // 429: back off the whole host, not just this call.
    if (err instanceof HttpError && err.status === 429) {
      rateLimitedUntil = Date.now() + 60_000;
    }
    return null;
  }
}

export type DiscogsArtist = { id: number; name: string; resourceUrl?: string };

/**
 * Resolve an artist *name* to an exact Discogs artist entity. Returns null when
 * nothing matches confidently — the caller treats that as "no Discogs data",
 * not as a reason to guess.
 */
export async function discogsArtistSearch(query: string): Promise<DiscogsArtist | null> {
  const name = cleanPersonName(query) || query;
  if (!name || isGenericEvent(name)) return null;
  const data = await discogsGet("/database/search?type=artist&q=" + encodeURIComponent(name));
  const results: any[] = data?.results || [];
  const exact = results.find((row) => sameArtist(name, row.title || ""));
  if (!exact) return null;
  return { id: exact.id, name: exact.title, resourceUrl: exact.resource_url };
}

export type DiscogsReleaseStub = {
  id: number;
  title: string;
  year?: number;
  /** "master" | "release" — masters hold the canonical videos/tracklist. */
  type: string;
};

/**
 * An artist's *own* releases, newest first.
 *
 * Every row carries a `role`; only `"Main"` is the artist's own record.
 * `"Appearance"` / `"TrackAppearance"` are credits on someone else's release,
 * and `"Remix"`/`"Producer"` etc. are other contributions — those are exactly
 * the sideman credits that wrecked the YouTube matcher, so drop them.
 */
export async function discogsArtistReleases(
  artistId: number,
  perPage = 10,
): Promise<DiscogsReleaseStub[]> {
  const data = await discogsGet(
    `/artists/${artistId}/releases?sort=year&sort_order=desc&per_page=${perPage}`,
  );
  const releases: any[] = data?.releases || [];
  const seen = new Set<string>();
  const out: DiscogsReleaseStub[] = [];
  for (const rel of releases) {
    if (rel.role !== "Main") continue;
    const key = String(rel.title || "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: rel.id,
      title: rel.title,
      year: rel.year,
      type: String(rel.type || "release"),
    });
  }
  return out;
}

export async function discogsRelease(releaseId: number): Promise<any | null> {
  return discogsGet(`/releases/${releaseId}`);
}

export async function discogsMaster(masterId: number): Promise<any | null> {
  return discogsGet(`/masters/${masterId}`);
}

/** Videos for a stub, reading the master when that is what the artist listing
 *  returned. Masters carry the canonical `videos[]`; a specific pressing often
 *  has none. */
export async function discogsVideosFor(stub: DiscogsReleaseStub): Promise<any[]> {
  const detail =
    stub.type === "master" ? await discogsMaster(stub.id) : await discogsRelease(stub.id);
  return detail?.videos || [];
}

export type DiscogsVideo = {
  uri: string;
  title: string;
  duration: number;
  videoId: string;
};

function youtubeId(url: string): string {
  const m = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(String(url || ""));
  return m ? m[1] : "";
}

/**
 * Accept a `videos[]` entry only when it is an embeddable YouTube video of a
 * plausible song length. Discogs already gives us `embed` and a real duration,
 * so this needs no oembed round-trip.
 */
export function pickDiscogsVideo(video: any, minSeconds = 45, maxSeconds = 30 * 60): DiscogsVideo | null {
  if (!video || video.embed === false) return null;
  const uri = String(video.uri || "");
  if (!/youtube\.com|youtu\.be/i.test(uri)) return null;
  const videoId = youtubeId(uri);
  if (!videoId) return null;
  const duration = Number(video.duration || 0);
  if (duration && (duration < minSeconds || duration > maxSeconds)) return null;
  return {
    uri,
    title: String(video.title || video.description || ""),
    duration,
    videoId,
  };
}

export function discogsFoldedKey(name: string): string {
  return foldName(name);
}
