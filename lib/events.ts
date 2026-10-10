import { calendarDays, toIso, todayDate, weekDaysFromMonday, weekMondayIso } from "./dates";
import { typographicQuotes } from "./prose";
import type { ConcertEvent, FilterMode, PlaylistItem, Track, TrackSource } from "./types";
import { VENUES } from "./types";

const TITLE_SKIP: Record<string, boolean> = {
  and: true, och: true, the: true, to: true, for: true, of: true, a: true, an: true,
  at: true, in: true, on: true, with: true, from: true, maybe: true, more: true,
  coming: true, you: true, all: true, out: true, there: true, people: true,
  welcome: true, lets: true, give: true, big: true, warm: true, plus: true,
  live: true, night: true, party: true, band: true, trio: true, duo: true,
  dj: true, support: true, album: true, release: true, concert: true, konsert: true,
};

function escapeRe(value: string): string {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleLetters(value: string): string[] {
  return String(value || "").match(/\p{L}/gu) || [];
}

function isAllUpperTitle(title: string): boolean {
  const letters = titleLetters(title);
  return letters.length > 0 && letters.every((ch) => ch === ch.toUpperCase() && ch !== ch.toLowerCase());
}

function isAllLowerTitle(title: string): boolean {
  const letters = titleLetters(title);
  return letters.length > 0 && letters.every((ch) => ch === ch.toLowerCase() && ch !== ch.toUpperCase());
}

function toTitleCase(title: string): string {
  return String(title || "").replace(/\p{L}+/gu, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function capitalizeFirstLetter(title: string): string {
  return String(title || "").replace(/\p{L}/u, (ch) => ch.toUpperCase());
}

function properName(name: string): string {
  const text = String(name || "").trim();
  if (!text) return "";
  return isAllLowerTitle(text) ? toTitleCase(text) : text;
}

export function eventTracks(event?: ConcertEvent | null): Track[] {
  let tracks: Track[] = [];
  if (event && Array.isArray(event.tracks) && event.tracks.length) tracks = event.tracks.slice();
  else if (event && event.bandcamp && event.bandcamp.band_id && event.bandcamp.album_id) {
    tracks = [{ source: "bandcamp", ...event.bandcamp }];
  } else if (event && event.deezer && event.deezer.track_id) {
    tracks = [{ source: "deezer", ...event.deezer }];
  } else if (event && event.soundcloud && event.soundcloud.track_id) {
    tracks = [{ source: "soundcloud", ...event.soundcloud }];
  } else if (event && event.youtube && event.youtube.video_id) {
    tracks = [{ source: "youtube", ...event.youtube }];
  }
  if (tracks.length < 2) return tracks;
  // SoundCloud spelas bara när varken Bandcamp eller Deezer finns.
  const rest: Track[] = [];
  const soundcloud: Track[] = [];
  for (const track of tracks) {
    if (trackSource(track) === "soundcloud") soundcloud.push(track);
    else rest.push(track);
  }
  return rest.length ? rest.concat(soundcloud) : tracks;
}

function applyTitleNames(title: string, event: ConcertEvent | undefined, withWords: boolean): string {
  const venue = event && event.venue ? event.venue : "";
  if (venue && /larry/i.test(venue)) {
    title = title.replace(/larrys?\s*corner/gi, venue);
  }
  if (venue) {
    title = title.replace(new RegExp(escapeRe(venue), "gi"), venue);
  }
  if (!withWords) return title;
  const parts: string[] = [];
  eventTracks(event).forEach((track) => {
    const name = properName(track.artist || "");
    if (!name) return;
    parts.push(name);
    name.split(/\s+/).forEach((word) => parts.push(word));
  });
  parts.sort((a, b) => b.length - a.length);
  const seen: Record<string, boolean> = {};
  parts.forEach((part) => {
    const clean = String(part || "").replace(/^[,.!:;]+|[,.!:;]+$/g, "");
    const key = clean.toLowerCase();
    if (clean.length < 3 || TITLE_SKIP[key] || seen[key]) return;
    seen[key] = true;
    title = title.replace(new RegExp(escapeRe(clean), "gi"), clean);
  });
  return title;
}

export function displayTitle(event?: ConcertEvent | null): string {
  let title = String((event && event.title) || "").replace(/\s+/g, " ").trim();
  if (!title) return "";
  if (isAllUpperTitle(title)) title = toTitleCase(title);
  else if (isAllLowerTitle(title)) title = applyTitleNames(title, event || undefined, true);
  else title = applyTitleNames(title, event || undefined, false);
  return typographicQuotes(capitalizeFirstLetter(title));
}

export function collapseSameDayEvents(events: ConcertEvent[]): ConcertEvent[] {
  const out: ConcertEvent[] = [];
  const index: Record<string, ConcertEvent> = {};
  events.forEach((event) => {
    const key = (event.date || "") + "\t" + (event.venue_slug || "") + "\t" + displayTitle(event).toLowerCase();
    const prev = index[key];
    if (!prev) {
      const copy = { ...event, times: event.time ? [event.time] : [] };
      index[key] = copy;
      out.push(copy);
      return;
    }
    if (event.time && prev.times && prev.times.indexOf(event.time) < 0) prev.times.push(event.time);
  });
  out.forEach((event) => {
    event.times?.sort();
  });
  return out;
}

export function eventTimes(event?: ConcertEvent | null): string[] {
  if (event && event.times && event.times.length) return event.times;
  return event && event.time ? [event.time] : [];
}

const CANCELLED_RE =
  /\b(installd[ae]?|installt|canceled|cancelled|cancellation|avlyst[ae]?|avlysning|aflyst[ae]?)\b/;

export function isCancelledEvent(event?: ConcertEvent | null): boolean {
  if (!event) return false;
  const blob = foldLetters(`${event.title || ""} ${event.text || ""}`);
  return CANCELLED_RE.test(blob);
}

export function filteredEvents(
  events: ConcertEvent[],
  mine: string[],
  mode: FilterMode,
  peek: string | null = null,
): ConcertEvent[] {
  const selected = new Set(mine);
  return collapseSameDayEvents(
    events.filter((event) => {
      if (isCancelledEvent(event)) return false;
      if (peek) return event.venue_slug === peek;
      if (mode === "mine") return selected.has(event.venue_slug);
      return true;
    }),
  );
}

export function upcomingEvents(
  events: ConcertEvent[],
  mine: string[],
  mode: FilterMode,
  peek: string | null = null,
): ConcertEvent[] {
  const today = toIso(todayDate());
  return filteredEvents(events, mine, mode, peek).filter((event) => event.date && event.date >= today);
}

export function isPlayable(event: ConcertEvent): boolean {
  return eventTracks(event).length > 0;
}

export function mobileCompatibleEvents(
  events: ConcertEvent[],
  blockedTrackKeys: ReadonlySet<string> = new Set(),
): ConcertEvent[] {
  return events.map((event) => {
    const tracks = eventTracks(event);
    const compatible = tracks.filter((track, index) =>
      !(
        trackSource(track) === "soundcloud" &&
        (track.widgetOnly || blockedTrackKeys.has(event.id + ":" + index))
      ),
    );
    if (compatible.length === tracks.length) return event;
    const rest = { ...event };
    delete rest.bandcamp;
    delete rest.soundcloud;
    delete rest.youtube;
    delete rest.deezer;
    return { ...rest, tracks: compatible };
  });
}

export function trackSource(track?: Track | null): TrackSource | "" {
  if (track && track.source === "bandcamp") return "bandcamp";
  if (track && track.source === "soundcloud") return "soundcloud";
  if (track && track.source === "youtube") return "youtube";
  if (track && track.source === "deezer") return "deezer";
  if (track && track.band_id && track.album_id) return "bandcamp";
  if (track && track.video_id) return "youtube";
  // `track_id` alone means SoundCloud — keep after the deezer check, since
  // deezer tracks carry a `track_id` too.
  if (track && track.track_id) return "soundcloud";
  return "";
}

export type StreamRequest = {
  href: string;
  source: TrackSource;
  fallback: string;
  /** YouTube only: the video id for the embedded player (no /api fetch). */
  videoId?: string;
};

export function streamRequest(track?: Track | null): StreamRequest | null {
  const source = trackSource(track);
  if (source === "bandcamp") {
    return {
      href: "/api/bandcamp/stream?" + new URLSearchParams({
        band: String(track?.band_id || ""),
        album: String(track?.album_id || ""),
        type: track?.type || "a",
      }).toString(),
      source,
      fallback: track?.url || "",
    };
  }
  if (source === "soundcloud") {
    return {
      href: "/api/soundcloud/stream?id=" + encodeURIComponent(String(track?.track_id || "")),
      source,
      fallback: track?.url || "",
    };
  }
  if (source === "youtube") {
    const videoId = String(track?.video_id || "");
    if (!videoId) return null;
    // No stream to resolve: the embedded player takes the id directly.
    return { href: "", source, fallback: track?.url || "", videoId };
  }
  if (source === "deezer") {
    return {
      href: "/api/deezer/stream?id=" + encodeURIComponent(String(track?.track_id || "")),
      source,
      fallback: track?.url || "",
    };
  }
  return null;
}

export function mediaPageUrl(value?: string | Track | null): string {
  const url = typeof value === "string" ? value : (value && value.url) || "";
  return String(url).split("?")[0].replace(/\/+$/, "");
}

export function artistExploreUrl(track?: Track | null): string {
  // YouTube has no separate artist page in this model; don't link out to a
  // meaningless "watch" URL. `trackExploreUrl` handles the video itself.
  if (track?.source === "youtube" || /youtube\.com|youtu\.be/i.test(track?.url || "")) return "";
  const url = mediaPageUrl(track);
  if (!url) return "";
  const bandcamp = url.match(/^(https?:\/\/(?:www\.)?[^/]+\.bandcamp\.com)/i);
  if (bandcamp) return bandcamp[1] + "/";
  const soundcloud = url.match(/^(https?:\/\/(?:www\.)?soundcloud\.com\/[^/?#]+)/i);
  if (soundcloud) return soundcloud[1];
  return url;
}

export function trackExploreUrl(track?: Track | null): string {
  if (track?.source === "youtube" || /youtube\.com|youtu\.be/i.test(track?.url || "")) {
    const id = track?.video_id || "";
    return id ? "https://www.youtube.com/watch?v=" + id : track?.url || "";
  }
  const url = mediaPageUrl(track);
  return url || "";
}

export function trackSourceName(track?: Track | null): string {
  const src = (track && track.source) || "";
  const url = (track && track.url) || "";
  if (src === "youtube" || /youtube\.com|youtu\.be/i.test(url)) return "YouTube";
  if (src === "soundcloud" || /soundcloud\.com/i.test(url)) return "SoundCloud";
  if (src === "bandcamp" || /bandcamp\.com/i.test(url)) return "Bandcamp";
  if (src === "deezer" || /deezer\.com/i.test(url)) return "Deezer";
  return "";
}

export function listenMoreItems(event: ConcertEvent): { url: string; artist: string; source: string }[] {
  const items: { url: string; artist: string; source: string }[] = [];
  const seen: Record<string, boolean> = {};
  eventTracks(event).forEach((track) => {
    const url = artistExploreUrl(track);
    if (!url || seen[url]) return;
    seen[url] = true;
    items.push({ url, artist: track.artist || "", source: trackSourceName(track) });
  });
  // Spotify link found on the venue page — opens in the Spotify app/web player.
  if (event.spotify) {
    const url = mediaPageUrl(event.spotify);
    if (url && !seen[url]) {
      seen[url] = true;
      items.push({ url, artist: "", source: "Spotify" });
    }
  }
  return items;
}

export function foldLetters(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function findInTitle(title: string, name: string): { start: number; end: number } | null {
  const needle = foldLetters(name);
  if (!title || !needle) return null;
  let folded = "";
  const map: number[] = [];
  const src = String(title);
  for (let i = 0; i < src.length; i++) {
    const chunk = src.charAt(i).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    for (let j = 0; j < chunk.length; j++) {
      folded += chunk.charAt(j);
      map.push(i);
    }
  }
  const idx = folded.indexOf(needle);
  if (idx < 0) return null;
  const last = idx + needle.length - 1;
  if (last >= map.length) return null;
  return { start: map[idx], end: map[last] + 1 };
}

export type TitleHit = { i: number; start: number; end: number; text: string };

export function titleHits(event: ConcertEvent): TitleHit[] {
  const title = displayTitle(event);
  const tracks = eventTracks(event);
  const hits: TitleHit[] = [];
  if (tracks.length < 2) return hits;
  tracks.forEach((track, i) => {
    const name = track.artist || "";
    let found = findInTitle(title, name);
    if (!found) {
      const first = name.trim().split(/\s+/)[0] || "";
      if (foldLetters(first).length >= 4) found = findInTitle(title, first);
    }
    if (!found) return;
    const overlap = hits.some((hit) => found!.start < hit.end && found!.end > hit.start);
    if (overlap) return;
    hits.push({ i, start: found.start, end: found.end, text: title.slice(found.start, found.end) });
  });
  hits.sort((a, b) => a.start - b.start);
  return hits;
}

export function groupEventsByWeek(events: ConcertEvent[]): { key: string; days: string[]; events: ConcertEvent[] }[] {
  const groups: { key: string; days: string[]; events: ConcertEvent[] }[] = [];
  const map: Record<string, { key: string; days: string[]; events: ConcertEvent[] }> = {};
  events.forEach((event) => {
    const key = weekMondayIso(event.date);
    if (!map[key]) {
      map[key] = { key, days: weekDaysFromMonday(key), events: [] };
      groups.push(map[key]);
    }
    map[key].events.push(event);
  });
  return groups;
}

export function groupByDay(events: ConcertEvent[]): { date: string; events: ConcertEvent[] }[] {
  const groups: { date: string; events: ConcertEvent[] }[] = [];
  const map: Record<string, ConcertEvent[]> = {};
  events.forEach((event) => {
    if (!map[event.date]) {
      map[event.date] = [];
      groups.push({ date: event.date, events: map[event.date] });
    }
    map[event.date].push(event);
  });
  return groups;
}

export function playlistFrom(events: ConcertEvent[]): PlaylistItem[] {
  const items: PlaylistItem[] = [];
  events.forEach((event) => {
    eventTracks(event).forEach((track, i) => {
      items.push({ event, track, i, key: event.id + ":" + i });
    });
  });
  return items;
}

export function calendarWeeks(rangeTo?: string | null): string[][] {
  const days = calendarDays(rangeTo);
  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

function knownVenueSlugs(): Set<string> {
  return new Set(VENUES.map((item) => item.slug));
}

function migrateVenueSlug(slug: string): string {
  if (slug === "slaktkyrkan" || slug === "hus7") return "slakthusen";
  return slug;
}

function loadHiddenSlugs(): string[] {
  try {
    const raw = localStorage.getItem("konserter-hidden");
    const list = raw ? JSON.parse(raw) : [];
    return (list || []).filter((slug: string) => slug && slug !== "all");
  } catch {
    return [];
  }
}

export function loadMine(): string[] {
  const known = knownVenueSlugs();
  try {
    const raw = localStorage.getItem("konserter-mine");
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        return [...new Set(list.map((slug: string) => migrateVenueSlug(slug)))].filter((slug: string) => known.has(slug));
      }
    }
  } catch {
    /* ignore */
  }
  const hidden = new Set(loadHiddenSlugs());
  if (!hidden.size) return [];
  return VENUES.map((item) => item.slug).filter((slug) => !hidden.has(slug));
}

export function saveMine(mine: string[]): void {
  try {
    localStorage.setItem("konserter-mine", JSON.stringify(mine));
  } catch {
    /* ignore */
  }
}

export function loadFilterMode(): FilterMode {
  try {
    const raw = localStorage.getItem("konserter-filter");
    if (raw === "mine" || raw === "all") return raw;
  } catch {
    /* ignore */
  }
  return loadMine().length ? "mine" : "all";
}

export function saveFilterMode(mode: FilterMode): void {
  try {
    localStorage.setItem("konserter-filter", mode);
  } catch {
    /* ignore */
  }
}

export function loadPickerOpen(): boolean {
  try {
    if (localStorage.getItem("konserter-seen-picker")) return false;
    if (localStorage.getItem("konserter-mine")) return false;
  } catch {
    return false;
  }
  return true;
}

export function savePickerSeen(): void {
  try {
    localStorage.setItem("konserter-seen-picker", "1");
  } catch {
    /* ignore */
  }
}

export function isLocalHost(): boolean {
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

export function clearStoredSettings(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("konserter-")) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
