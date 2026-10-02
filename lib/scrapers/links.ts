import { HttpError, httpRequest } from "./http";
import { unescape } from "./html";
import { warn } from "./log";
import type { ScrapedEvent } from "./types";

const BANDCAMP_URL_RE =
  /https?:\/\/(?:www\.)?(?:[a-z0-9-]+\.)?bandcamp\.com(?:\/[^\s"'<>\\]*)?/gi;
const BANDCAMP_SKIP_HOSTS = new Set([
  "daily.bandcamp.com",
  "help.bandcamp.com",
  "blog.bandcamp.com",
]);

// Event pages on these hosts require a session cookie / bot challenge; they
// only ever return 401 and never expose Bandcamp/SoundCloud links, so fetching
// them just creates noise. Skip the request entirely.
const EVENT_PAGE_SKIP_HOSTS = [
  /(^|\.)ticketmaster\.(se|com|dk|no|fi)$/i,
  /(^|\.)livenation\.(se|com)$/i,
];

function isSkippableEventPage(url: string): boolean {
  try {
    const host = new URL(url).host;
    return EVENT_PAGE_SKIP_HOSTS.some((re) => re.test(host));
  } catch {
    return false;
  }
}

export function cleanBandcampUrl(raw: string): string {
  let url = unescape(String(raw || "")).trim();
  url = url.replace(/\\\//g, "/");
  url = url.split("&quot;")[0].split("\\u0022")[0].split("\\n")[0];
  url = url.replace(/[).,;:\]"']+$/, "");
  if (url.endsWith("\\")) url = url.slice(0, -1);
  return url;
}

export function isVenueBandcamp(host: string, venueSlug: string): boolean {
  host = String(host || "").toLowerCase();
  if (BANDCAMP_SKIP_HOSTS.has(host)) return true;
  let name = host.split(".bandcamp.com")[0];
  if (name.startsWith("www.")) name = name.slice(4);
  const slug = String(venueSlug || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const own = name.replace(/[^a-z0-9]+/g, "");
  if (slug && own === slug) return true;
  if (slug === "ronnells" && own.startsWith("ronnell")) return true;
  if (slug === "larryscorner" && own.startsWith("larry")) return true;
  return false;
}

export function extractBandcampLinks(raw: string, venueSlug = ""): string[] {
  const text = unescape(String(raw || "")).replace(/\\\//g, "/");
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(BANDCAMP_URL_RE)) {
    const url = cleanBandcampUrl(match[0]);
    if (!url) continue;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    const host = parsed.host.toLowerCase();
    const path = parsed.pathname || "/";
    if (isVenueBandcamp(host, venueSlug)) continue;
    if (host === "bandcamp.com" || host === "www.bandcamp.com") {
      if (!/\/(album|track|EmbeddedPlayer)\//i.test(path)) continue;
    }
    const key = host + path.replace(/\/+$/, "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    found.push(url);
  }
  return found;
}

export function parseBandcampIds(page: string): [number | null, number | null, string] {
  let bandId: number | null = null;
  let itemId: number | null = null;
  let itemType = "";
  const bandMatch = /band_id=(\d+)/.exec(page);
  if (bandMatch) bandId = Number(bandMatch[1]);
  const itemMatch = /item_id=(\d+)/.exec(page);
  if (itemMatch) itemId = Number(itemMatch[1]);
  const typeMatch = /item_type=([atb])/.exec(page);
  if (typeMatch && "at".includes(typeMatch[1])) itemType = typeMatch[1];
  if (!itemId) {
    const embed = /(?:EmbeddedPlayer\/)?(?:album|track)=(\d+)/i.exec(page);
    if (embed) {
      itemId = Number(embed[1]);
      if (!itemType) itemType = /(?:^|\/)track=/i.test(page) ? "t" : "a";
    }
  }
  return [bandId, itemId, itemType || "a"];
}

const SOUNDCLOUD_URL_RE =
  /https?:\/\/(?:www\.)?soundcloud\.com\/[^\s"'<>\\]+/gi;
const SOUNDCLOUD_SKIP = new Set([
  "you", "discover", "search", "pages", "signin", "settings", "upload",
  "charts", "stream", "terms-of-use", "imprint", "messages", "notifications",
  "popular", "feed", "about", "jobs",
]);

export type SpotifyLink = {
  /** "artist" | "album" | "track" | "playlist" | "show" | "episode" */
  kind: string;
  id: string;
  url: string;
};

const SPOTIFY_RE =
  /https?:\/\/open\.spotify\.com\/(?:embed\/)?(artist|album|track|playlist|show|episode)\/([A-Za-z0-9]+)/gi;

/**
 * Spotify links from a page. Spotify audio cannot be streamed for anonymous
 * visitors, so these are used two ways: (1) resolve the authoritative artist /
 * album name via the public oembed endpoint (no credentials), which becomes a
 * stronger search key for Bandcamp/SoundCloud, and (2) shown as a "listen"
 * link. Artist links first, then album, then track.
 */
export function extractSpotifyLinks(raw: string): SpotifyLink[] {
  const text = unescape(String(raw || "")).replace(/\\\//g, "/");
  const order: Record<string, number> = { artist: 0, album: 1, track: 2, playlist: 3, show: 4, episode: 5 };
  const found: SpotifyLink[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(SPOTIFY_RE)) {
    const kind = match[1].toLowerCase();
    const id = match[2];
    if (seen.has(id)) continue;
    seen.add(id);
    found.push({ kind, id, url: `https://open.spotify.com/${kind}/${id}` });
  }
  found.sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9));
  return found;
}

/** Spotify oembed metadata (title/author/thumbnail) — public, no credentials. */
export async function spotifyMeta(link: SpotifyLink): Promise<{ title: string; image: string } | null> {
  try {
    const raw = await httpRequest(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(link.url)}`,
      { timeoutMs: 12000 },
    );
    const data = JSON.parse(raw) as { title?: string; thumbnail_url?: string };
    if (!data?.title) return null;
    return { title: data.title, image: data.thumbnail_url || "" };
  } catch {
    return null;
  }
}

export function extractSoundcloudLinks(raw: string): string[] {
  const text = unescape(String(raw || "")).replace(/\\\//g, "/");
  const found: [number, string][] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(SOUNDCLOUD_URL_RE)) {
    const url = unescape(match[0]).split("?")[0].replace(/[/).,;"']+$/, "");
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (!parts.length || SOUNDCLOUD_SKIP.has(parts[0].toLowerCase())) continue;
    let kind: number;
    if (parts.length >= 2 && parts[1].toLowerCase() === "sets") kind = 1;
    else if (parts.length === 1) kind = 2;
    else kind = 0;
    const key = parsed.host.toLowerCase() + parsed.pathname.replace(/\/+$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push([kind, url]);
  }
  found.sort((a, b) => a[0] - b[0]);
  return found.map(([, url]) => url);
}

export function pageMediaFields(raw: string, venueSlug: string): {
  _bandcamp_links: string[];
  _soundcloud_links: string[];
  _spotify_links: SpotifyLink[];
} {
  return {
    _bandcamp_links: extractBandcampLinks(raw, venueSlug),
    _soundcloud_links: extractSoundcloudLinks(raw),
    _spotify_links: extractSpotifyLinks(raw),
  };
}

export async function takePageLinks(
  event: ScrapedEvent,
): Promise<[string[], string[], SpotifyLink[]]> {
  const bc = event._bandcamp_links;
  const sc = event._soundcloud_links;
  const sp = event._spotify_links;
  delete event._bandcamp_links;
  delete event._soundcloud_links;
  delete event._spotify_links;
  if (bc !== undefined || sc !== undefined || sp !== undefined) {
    return [bc || [], sc || [], sp || []];
  }
  const chunks: string[] = [event.text || "", event.title || ""];
  if (event.url && !isSkippableEventPage(event.url)) {
    try {
      const html = await httpRequest(event.url);
      chunks.push(html);
      return [
        extractBandcampLinks(chunks.join("\n"), event.venue_slug || ""),
        extractSoundcloudLinks(chunks.join("\n")),
        extractSpotifyLinks(html),
      ];
    } catch (exc) {
      const msg = exc instanceof HttpError ? `HTTP ${exc.status}` : String(exc);
      warn(`evenemangssida ${event.url}: ${msg} (hoppar över)`);
    }
  }
  const blob = chunks.join("\n");
  const slug = event.venue_slug || "";
  return [
    extractBandcampLinks(blob, slug),
    extractSoundcloudLinks(blob),
    extractSpotifyLinks(blob),
  ];
}
