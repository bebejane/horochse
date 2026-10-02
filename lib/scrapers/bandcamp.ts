import { httpJson, httpRequest, HttpError } from "./http";
import { parseBcDate } from "./dates";
import { parseBandcampIds } from "./links";
import { warn } from "./log";
import { albumTitleScore, cleanPersonName, cluesCacheKey, eventLookupClues, foldName, namesMatch, sameArtist } from "./text";

type Release = Record<string, any>;

/**
 * Bandcamp's search API (`autocomplete_elastic`) rate-limits per IP and can
 * return 429 on bursts. On serverless a long time-based pause is wrong: the
 * function budget is a few minutes, so pausing 10 min would disable search for
 * the whole run. Instead use a short, adaptive cooldown that grows only with
 * consecutive 429s and resets on any success. The rest of Bandcamp (mobile API,
 * artist pages) is unaffected — only search-assisted lookups pause.
 */
const COOLDOWN_BASE_MS = 5_000;
const COOLDOWN_MAX_MS = 60_000;
let searchCooldownUntil = 0;
let consecutive429 = 0;

export function isBandcampSearchBlocked(): boolean {
  return Date.now() < searchCooldownUntil;
}

function noteSearch429(): void {
  consecutive429 += 1;
  const cooldown = Math.min(COOLDOWN_BASE_MS * 2 ** (consecutive429 - 1), COOLDOWN_MAX_MS);
  searchCooldownUntil = Date.now() + cooldown;
  warn(
    `bandcamp-sökning: 429 (${consecutive429} i rad) — pausar sökningar i ${Math.round(
      cooldown / 1000,
    )}s, fortsätter sedan`,
  );
}

function noteSearchOk(): void {
  consecutive429 = 0;
  searchCooldownUntil = 0;
}

export async function searchBandcampRowsAsync(query: string, searchFilter: string): Promise<any[]> {
  if (isBandcampSearchBlocked()) return [];
  try {
    const data = await httpJson(
      "https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_elastic",
      { search_text: query, search_filter: searchFilter, full_page: false, fan_id: null },
    );
    noteSearchOk();
    return (data?.auto?.results as any[]) || [];
  } catch (err) {
    if (err instanceof HttpError && err.status === 429) {
      noteSearch429();
      return [];
    }
    throw err;
  }
}

export async function searchBandcampArtists(query: string, allowFolded = false): Promise<any[]> {
  const hits: any[] = [];
  for (const row of await searchBandcampRowsAsync(query, "artist")) {
    if (row.type !== "b" || row.is_label) continue;
    const name = row.name || "";
    if (!namesMatch(query, name, allowFolded)) continue;
    hits.push({
      name,
      band_id: row.id,
      url: row.item_url_root || "",
      location: row.location || "",
    });
  }
  return hits;
}

export async function bandcampRowMatchesArtist(query: string, row: any): Promise<boolean> {
  if (row.is_label) return false;
  const bandName = row.band_name || "";
  const name = row.name || "";
  if (row.type === "b") return Boolean(name) && (namesMatch(query, name) || sameArtist(query, name));
  return Boolean(bandName) && (namesMatch(query, bandName) || sameArtist(query, bandName));
}

export async function searchBandcampReleasesForArtist(query: string): Promise<any[]> {
  const seen = new Set<string>();
  const hits: any[] = [];
  for (const searchFilter of ["album", ""]) {
    for (const row of await searchBandcampRowsAsync(query, searchFilter)) {
      if (row.type !== "a" && row.type !== "t") continue;
      if (!(await bandcampRowMatchesArtist(query, row))) continue;
      const rowKey = [String(row.band_id || ""), String(row.album_id || row.id || ""), String(row.type || "")].join(":");
      if (seen.has(rowKey)) continue;
      seen.add(rowKey);
      hits.push(row);
    }
    if (hits.length) break;
  }
  hits.sort((a, b) => (a.type === "a" ? 0 : 1) - (b.type === "a" ? 0 : 1));
  return hits;
}

export async function releaseFromBandcampSearchRow(row: any, cache: Map<string, Release | null>): Promise<Release | null> {
  const bandId = row.band_id;
  let itemId: unknown;
  let itemType: string;
  if (row.type === "a") {
    itemId = row.id;
    itemType = "a";
  } else if (row.album_id) {
    itemId = row.album_id;
    itemType = "a";
  } else {
    itemId = row.id;
    itemType = "t";
  }
  const release = await releaseFromBandcampIds(bandId, itemId, itemType, cache, row.item_url_path || "");
  if (release) return release;
  const url = String(row.item_url_path || "").trim();
  if (url && (url.includes("/album/") || url.includes("/track/"))) return lookupBandcampUrl(url, cache);
  return null;
}

export function locationContextScore(location: string, context: string): number {
  const ctx = new Set(foldName(context).split(" "));
  let score = 0;
  for (const word of foldName(location).split(" ")) {
    if (word.length >= 5 && ctx.has(word)) score += 12;
  }
  return score;
}

export function scoreTextAgainstClues(blob: string, clues: any, context = ""): number {
  const folded = foldName(blob);
  if (!folded) return 0;
  let score = 0;
  for (const hint of clues.albums || []) {
    if (albumTitleScore(hint, blob) || folded.includes(foldName(hint))) score += 24;
  }
  for (const hint of clues.labels || []) {
    const hf = foldName(hint);
    if (hf && folded.includes(hf)) score += 16;
  }
  for (const hint of clues.phrases || []) {
    const hf = foldName(hint);
    if (hf && hf.length >= 8 && folded.includes(hf)) score += 6;
  }
  if ((clues.albums || []).length || (clues.labels || []).length) {
    if (folded.includes("sweden") || folded.includes("sverige") || folded.includes("stockholm")) score += 3;
  }
  score += locationContextScore(blob, context);
  return score;
}

export async function bandcampDetails(bandId: number): Promise<any> {
  return httpJson("https://bandcamp.com/api/mobile/24/band_details", { band_id: Number(bandId) });
}

export async function bandcampTralbum(bandId: number, tralbumId: number, tralbumType = "a"): Promise<any> {
  return httpJson("https://bandcamp.com/api/mobile/24/tralbum_details", {
    band_id: Number(bandId),
    tralbum_id: Number(tralbumId),
    tralbum_type: tralbumType,
  });
}

export function bandcampArtUrl(artId: unknown): string {
  if (!artId) return "";
  return "https://f4.bcbits.com/img/a" + String(artId) + "_5.jpg";
}

export function pickStreamTrack(album: any): any | null {
  const featured = album.featured_track_id;
  const tracks: any[] = album.tracks || [];
  const ordered: any[] = [];
  if (featured) ordered.push(...tracks.filter((t) => t.track_id === featured));
  ordered.push(...tracks.filter((t) => !ordered.includes(t)));
  for (const track of ordered) {
    const stream = String(track?.streaming_url?.["mp3-128"] || "").trim();
    if (track?.is_streamable && stream) {
      return {
        track: track.title || "",
        track_id: track.track_id,
        stream,
        url: track.track_url || album.bandcamp_url || "",
      };
    }
  }
  return null;
}

export async function latestFromBand(band: any, details?: any): Promise<Release | null> {
  const info = details !== undefined ? details : await bandcampDetails(band.band_id);
  const discog: any[] = info.discography || [];
  for (const item of discog.slice(0, 4)) {
    const itemType = item.item_type === "track" ? "t" : "a";
    const album = await bandcampTralbum(band.band_id, item.item_id, itemType);
    const picked = pickStreamTrack(album);
    if (!picked) continue;
    return {
      artist: info.name || band.name || "",
      album: album.title || item.title || "",
      album_id: album.id || item.item_id,
      band_id: band.band_id,
      type: itemType,
      url: album.bandcamp_url || picked.url,
      released: item.release_date || "",
      track: picked.track,
      track_id: picked.track_id,
    };
  }
  return null;
}

export async function releaseFromBandcampIds(
  bandId: unknown,
  itemId: unknown,
  itemType: string,
  cache: Map<string, Release | null>,
  url = "",
): Promise<Release | null> {
  if (!bandId || !itemId) return null;
  const key = "bcids:" + String(bandId) + ":" + String(itemId) + ":" + (itemType || "a");
  if (cache.has(key)) return cache.get(key) ?? null;
  try {
    const album = await bandcampTralbum(Number(bandId), Number(itemId), itemType || "a");
    const picked = pickStreamTrack(album);
    if (!picked) {
      cache.set(key, null);
      return null;
    }
    const release: Release = {
      artist: album.tralbum_artist || album.band?.name || "",
      album: album.title || "",
      album_id: album.id || itemId,
      band_id: Number(bandId),
      type: itemType || "a",
      url: album.bandcamp_url || picked.url || url,
      released: "",
      track: picked.track,
      track_id: picked.track_id,
    };
    cache.set(key, release);
    return release;
  } catch (exc) {
    console.error(`bandcamp-id (${bandId}/${itemId}):`, exc);
    cache.set(key, null);
    return null;
  }
}

export async function findBandcampAlbumForArtist(
  artist: string,
  hints: string[],
  cache: Map<string, Release | null>,
): Promise<Release | null> {
  if (isBandcampSearchBlocked()) return null;
  const queries: string[] = [];
  for (const hint of hints) {
    queries.push(artist + " " + hint);
    queries.push(hint);
  }
  const seenQ = new Set<string>();
  const seenRow = new Set<string>();
  const ranked: [number, any][] = [];
  for (const query of queries) {
    const key = foldName(query);
    if (!key || seenQ.has(key)) continue;
    seenQ.add(key);
    for (const row of await searchBandcampRowsAsync(query, "album")) {
      if (row.type !== "a" && row.type !== "t") continue;
      const bandName = row.band_name || "";
      if (!(namesMatch(artist, bandName) || sameArtist(artist, bandName))) continue;
      const albumName = row.album_name || row.name || "";
      const trackName = row.type === "t" ? row.name || "" : "";
      let score = 0;
      for (const hint of hints) {
        score = Math.max(
          score,
          albumTitleScore(hint, albumName) * 10,
          albumTitleScore(hint, trackName) * 4,
        );
      }
      if (score === 0) score = 1;
      if (row.type === "a") score += 5;
      const rowKey = String(row.band_id) + ":" + String(row.album_id || row.id);
      if (seenRow.has(rowKey)) continue;
      seenRow.add(rowKey);
      ranked.push([score, row]);
    }
    if (ranked.some(([score]) => score >= 35)) break;
  }
  ranked.sort((a, b) => b[0] - a[0]);
  for (const [, row] of ranked) {
    const release = await releaseFromBandcampSearchRow(row, cache);
    if (release) return release;
  }
  return null;
}

export async function lookupBandcampUrl(url: string, cache: Map<string, Release | null>): Promise<Release | null> {
  const key = "url:" + String(url || "").split("?")[0].replace(/\/+$/, "").toLowerCase();
  if (cache.has(key)) return cache.get(key) ?? null;
  try {
    const page = await httpRequest(url);
    const [bandId, itemId, itemType] = parseBandcampIds(page);
    if (!bandId) {
      cache.set(key, null);
      return null;
    }
    if (itemId && (itemType === "a" || itemType === "t")) {
      const album = await bandcampTralbum(bandId, itemId, itemType);
      const picked = pickStreamTrack(album);
      if (picked) {
        const release: Release = {
          artist: album.tralbum_artist || album.band?.name || "",
          album: album.title || "",
          album_id: album.id || itemId,
          band_id: bandId,
          type: itemType,
          url: album.bandcamp_url || picked.url || url,
          released: "",
          track: picked.track,
          track_id: picked.track_id,
        };
        cache.set(key, release);
        return release;
      }
    }
    const release = await latestFromBand({ band_id: bandId, name: "" });
    cache.set(key, release);
    return release;
  } catch (exc) {
    console.error(`bandcamp-url (${url}):`, exc);
    cache.set(key, null);
    return null;
  }
}

export async function lookupBandcamp(
  query: string,
  cache: Map<string, Release | null>,
  context = "",
): Promise<Release | null> {
  query = cleanPersonName(query) || query;
  const clues = eventLookupClues(context, query);
  const key = foldName(query) + "\t" + cluesCacheKey(clues);
  if (cache.has(key)) {
    const hit = cache.get(key) ?? null;
    if (hit) console.log(`bandcamp (${query}): cachad`);
    return hit;
  }
  const started = Date.now();
  try {
    const hints = [...(clues.albums || []), ...(clues.labels || [])];
    if (hints.length) {
      const release = await findBandcampAlbumForArtist(query, hints, cache);
      if (release) {
        console.log(`bandcamp (${query}): ${release.album || release.track} via evenemangstext (${secs(started)})`);
        cache.set(key, release);
        return release;
      }
    }
    let hits = await searchBandcampArtists(query);
    if (!hits.length) hits = await searchBandcampArtists(query, true);
    const limit = foldName(query).split(" ").length < 2 ? 4 : 3;
    let best: Release | null = null;
    let bestTuple: [number, number] | null = null;
    for (const band of hits.slice(0, limit)) {
      const details = await bandcampDetails(band.band_id);
      const release = await latestFromBand(band, details);
      if (!release) continue;
      const clueScore = scoreTextAgainstClues(
        [
          details.name || band.name || "",
          details.location || band.location || "",
          details.bio || "",
          (details.discography || []).slice(0, 8).map((item: any) => item.title || "").join(" "),
        ].join(" "),
        clues,
        context,
      );
      const when = parseBcDate(release.released || "").toMillis();
      const rank: [number, number] = [clueScore, when];
      if (best === null || rank[0] > bestTuple![0] || (rank[0] === bestTuple![0] && rank[1] > bestTuple![1])) {
        best = release;
        bestTuple = rank;
      }
    }
    if (best) {
      console.log(`bandcamp (${query}): ${best.album || best.track} via artist (${secs(started)})`);
      cache.set(key, best);
      return best;
    }
    for (const row of (await searchBandcampReleasesForArtist(query)).slice(0, 4)) {
      const release = await releaseFromBandcampSearchRow(row, cache);
      const artist = release?.artist || "";
      if (release && (sameArtist(query, artist) || namesMatch(query, artist))) {
        console.log(`bandcamp (${query}): ${release.album || release.track} via album-sökning (${secs(started)})`);
        cache.set(key, release);
        return release;
      }
    }
    if (isBandcampSearchBlocked()) {
      return null;
    }
    console.log(`bandcamp (${query}): inget träff (${secs(started)})`);
    cache.set(key, null);
    return null;
  } catch (exc) {
    console.error(`bandcamp (${query}):`, exc);
    if (!(exc instanceof HttpError && exc.status === 429)) cache.set(key, null);
    return null;
  }
}

function secs(started: number): string {
  return ((Date.now() - started) / 1000).toFixed(1) + "s";
}

export function bcTrack(release: any): Record<string, any> {
  return {
    source: "bandcamp",
    artist: release.artist || "",
    album: release.album || "",
    track: release.track || "",
    url: release.url || "",
    band_id: release.band_id,
    album_id: release.album_id,
    track_id: release.track_id,
    type: release.type || "a",
  };
}

export async function bandcampStreamUrl(bandId: number, tralbumId: number, tralbumType = "a"): Promise<any | null> {
  const album = await bandcampTralbum(bandId, tralbumId, tralbumType || "a");
  const picked = pickStreamTrack(album);
  if (!picked) return null;
  return {
    artist: album.tralbum_artist || album.band?.name || "",
    album: album.title || "",
    track: picked.track,
    url: picked.url || album.bandcamp_url || "",
    image: bandcampArtUrl(album.art_id),
    stream: picked.stream,
  };
}
