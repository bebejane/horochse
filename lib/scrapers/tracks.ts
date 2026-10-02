import { bcTrack, lookupBandcamp, lookupBandcampUrl } from "./bandcamp";
import { lookupSoundcloudArtist, lookupSoundcloudUrl, scTrack } from "./soundcloud";
import { takePageLinks } from "./links";
import { mapPool, memoInflight, log, warn, seconds, withTimeout } from "./log";
import {
  artistCandidates,
  billArtists,
  foldName,
  isGenericEvent,
  sameArtist,
} from "./text";
import type { ScrapedEvent, ScrapedTrack } from "./types";

type Release = Record<string, any>;

export function trackArtistSeen(tracks: any[], artist: string): boolean {
  return tracks.some((item) => sameArtist(artist, item.artist || ""));
}

export function eventArtists(title: string, text = ""): string[] {
  const people = billArtists(title, text);
  if (people.length) return people;
  return artistCandidates(title);
}

export function trackFitsEvent(track: any, artists: string[], title: string): boolean {
  const name = track.artist || "";
  if (!name) return false;
  if (artists.length && artists.some((person) => sameArtist(person, name))) return true;
  const foldedArtist = foldName(name);
  const foldedTitle = foldName(title);
  if (!foldedArtist || !foldedTitle) return false;
  if (foldedArtist.length >= 5 && foldedTitle.includes(foldedArtist)) return true;
  const words = foldedArtist.split(" ").filter((w) => !["the", "a", "an", "and", "och"].includes(w));
  const titleWords = new Set(foldedTitle.split(" "));
  return words.length >= 2 && words.every((word) => titleWords.has(word));
}

export function applyPrimaryMedia(event: ScrapedEvent, tracks: ScrapedTrack[]): void {
  delete event.bandcamp;
  delete event.soundcloud;
  if (!tracks.length) {
    delete event.tracks;
    return;
  }
  event.tracks = tracks;
  const first = tracks[0];
  if (first.source === "bandcamp") {
    event.bandcamp = {
      artist: first.artist || "",
      album: first.album || "",
      track: first.track || "",
      url: first.url || "",
      band_id: first.band_id,
      album_id: first.album_id,
      track_id: first.track_id,
      type: first.type || "a",
    };
  } else {
    event.soundcloud = {
      artist: first.artist || "",
      track: first.track || "",
      track_id: first.track_id,
      url: first.url || "",
      image: first.image || "",
    };
  }
}

function firstMatchingPageTrack(
  pageTracks: ScrapedTrack[],
  usedPage: Set<number>,
  person: string,
  source: string,
): ScrapedTrack | null {
  for (let i = 0; i < pageTracks.length; i++) {
    const item = pageTracks[i];
    if (usedPage.has(i) || item.source !== source) continue;
    if (sameArtist(person, item.artist || "")) {
      usedPage.add(i);
      return item;
    }
  }
  return null;
}

export type AttachOptions = {
  concurrency?: number;
  eventConcurrency?: number;
  quiet?: boolean;
  artistTimeoutMs?: number;
};

function trim(value: string): string {
  return value.length > 64 ? value.slice(0, 61) + "…" : value;
}

const DEFAULT_ARTIST_TIMEOUT_MS = 45000;

export async function attachTracks(events: ScrapedEvent[], opts: AttachOptions = {}): Promise<void> {
  const bc = new Map<string, Release | null>();
  const sc = new Map<string, Release | null>();
  const bcInflight = new Map<string, Promise<Release | null>>();
  const scInflight = new Map<string, Promise<Release | null>>();
  // Persistent across the whole run: an artist already resolved (or ruled out)
  // is never looked up again, so repeated names cost nothing.
  const bcResolved = new Map<string, Release | null>();
  const scResolved = new Map<string, Release | null>();
  const stats = { found: 0, fromPage: 0, extra: 0, cached: 0 };
  const total = events.length;
  const quiet = opts.quiet ?? false;
  const concurrency = opts.concurrency ?? 8;
  const eventConcurrency = opts.eventConcurrency ?? 24;
  const artistTimeoutMs = opts.artistTimeoutMs ?? DEFAULT_ARTIST_TIMEOUT_MS;
  const started = Date.now();
  let done = 0;

  const lookupBandcampFor = (person: string, context: string): Promise<Release | null> => {
    const nameKey = foldName(person);
    if (bcResolved.has(nameKey)) {
      stats.cached += 1;
      return Promise.resolve(bcResolved.get(nameKey) ?? null);
    }
    const contextKey = nameKey + "\t" + context;
    if (bcInflight.has(contextKey)) return bcInflight.get(contextKey)!;
    const promise = withTimeout(lookupBandcamp(person, bc, context), artistTimeoutMs, `bandcamp ${person}`)
      .catch((err) => {
        warn(String(err));
        return null;
      })
      .then((release) => {
        bcResolved.set(nameKey, release);
        return release;
      })
      .finally(() => bcInflight.delete(contextKey));
    bcInflight.set(contextKey, promise);
    return promise;
  };
  const lookupSoundcloudFor = (person: string, context: string): Promise<Release | null> => {
    const nameKey = foldName(person);
    if (scResolved.has(nameKey)) {
      stats.cached += 1;
      return Promise.resolve(scResolved.get(nameKey) ?? null);
    }
    const contextKey = "sc:" + nameKey + "\t" + context;
    if (scInflight.has(contextKey)) return scInflight.get(contextKey)!;
    const promise = withTimeout(lookupSoundcloudArtist(person, sc, context), artistTimeoutMs, `soundcloud ${person}`)
      .catch((err) => {
        warn(String(err));
        return null;
      })
      .then((release) => {
        scResolved.set(nameKey, release);
        return release;
      })
      .finally(() => scInflight.delete(contextKey));
    scInflight.set(contextKey, promise);
    return promise;
  };

  const lookupPerson = async (
    person: string,
    pageTracks: ScrapedTrack[],
    usedPage: Set<number>,
    sources: string[],
    context: string,
  ): Promise<ScrapedTrack | null> => {
    for (const source of sources) {
      if (source === "bandcamp") {
        const item = firstMatchingPageTrack(pageTracks, usedPage, person, "bandcamp");
        if (item) return item;
        const release = await lookupBandcampFor(person, context);
        if (release) return bcTrack(release) as ScrapedTrack;
      } else if (source === "soundcloud") {
        const item = firstMatchingPageTrack(pageTracks, usedPage, person, "soundcloud");
        if (item) return item;
        const release = await lookupSoundcloudFor(person, context);
        if (release) return scTrack(release) as ScrapedTrack;
      }
    }
    return null;
  };

  const processEvent = async (event: ScrapedEvent): Promise<void> => {
    const title = event.title || "";
    const text = (event.text || "").replace(/\\+/g, " ").replace(/\s+/g, " ").trim();
    if (text !== (event.text || "")) event.text = text;

    let artists = eventArtists(title, text);
    let people = artists.length && !isGenericEvent(title) ? artists : [];
    const existing = (event.tracks || []) as ScrapedTrack[];

    if (
      existing.length &&
      (!people.length ||
        people.every((person) => existing.some((item) => sameArtist(person, item.artist || ""))))
    ) {
      applyPrimaryMedia(event, existing);
      stats.found += 1;
      stats.extra += Math.max(0, existing.length - 1);
    } else {
      const [bcLinks, scLinks] = await takePageLinks(event);
      const pageTracks: ScrapedTrack[] = [];
      for (const url of bcLinks) {
        const release = await lookupBandcampUrl(url, bc);
        if (release) {
          pageTracks.push(bcTrack(release) as ScrapedTrack);
          stats.fromPage += 1;
        }
      }
      for (const url of scLinks) {
        const release = await lookupSoundcloudUrl(url, sc);
        if (release) {
          pageTracks.push(scTrack(release) as ScrapedTrack);
          stats.fromPage += 1;
        }
      }

      artists = eventArtists(title, text);
      const context = [title, text].filter(Boolean).join(" ");
      const tracks: ScrapedTrack[] = [];
      const usedPage = new Set<number>();
      people = artists.length && !isGenericEvent(title) ? artists : [];

      const takeUnusedPage = (source: string): ScrapedTrack | null => {
        for (let i = 0; i < pageTracks.length; i++) {
          if (usedPage.has(i) || pageTracks[i].source !== source) continue;
          usedPage.add(i);
          return pageTracks[i];
        }
        return null;
      };
      const addTrack = (item: ScrapedTrack | null | undefined): void => {
        if (!item) return;
        const artist = item.artist || "";
        if (artist && trackArtistSeen(tracks, artist)) return;
        tracks.push(item);
      };

      for (const item of event.tracks || []) addTrack(item);

      // Look up all artists in a phase concurrently, then add in original order
      // so first-wins dedupe and track order stay deterministic.
      const runPhase = async (sources: string[]): Promise<(ScrapedTrack | null)[]> =>
        mapPool(people, Math.max(2, people.length), (person) =>
          tracks.some((item) => sameArtist(person, item.artist || ""))
            ? Promise.resolve(null)
            : lookupPerson(person, pageTracks, usedPage, sources, context),
        );
      for (const item of await runPhase(["bandcamp"])) addTrack(item);
      if (!tracks.length) addTrack(takeUnusedPage("bandcamp"));
      if (people.length) {
        const soundcloudItems = await mapPool(people, Math.max(2, people.length), (person) =>
          tracks.some((item) => sameArtist(person, item.artist || "")) || (tracks.length && people.length < 2)
            ? Promise.resolve(null)
            : lookupPerson(person, pageTracks, usedPage, ["soundcloud"], context),
        );
        for (const item of soundcloudItems) addTrack(item);
      }
      if (!tracks.length) addTrack(takeUnusedPage("soundcloud"));

      applyPrimaryMedia(event, tracks);
      if (tracks.length) {
        stats.found += 1;
        stats.extra += Math.max(0, tracks.length - 1);
      }
    }

    done += 1;
    if (!quiet) {
      const n = `(${done}/${total})`;
      const count = (event.tracks || []).length;
      if (count) log(`♪ ${n} ${trim(event.title)} → ${count} spår`);
      else log(`· ${n} ${trim(event.title)}`);
    }
  };

  await mapPool(events, eventConcurrency, processEvent);
  log(
    `Låtar klara: ${stats.found}/${total} poster med spelbar låt ` +
      `(${stats.fromPage} från evenemangssida, ${stats.extra} extra artistspår, ` +
      `${stats.cached} cachade artistuppslag) på ${seconds(Date.now() - started)}`,
  );
}
