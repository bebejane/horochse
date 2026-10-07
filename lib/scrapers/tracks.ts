import { bcTrack, isBandcampSearchBlocked, lookupBandcamp, lookupBandcampUrl } from "./bandcamp";
import { lookupSoundcloudArtist, lookupSoundcloudUrl, scTrack } from "./soundcloud";
import { lookupYoutubeArtist, youtubeDisabled, ytTrack } from "./youtube";
import { lookupDeezerArtist, dzTrack } from "./deezer";
import { takePageLinks, spotifyMeta } from "./links";
import { mapPool, memoInflight, log, warn, seconds, withTimeout } from "./log";
import {
  artistCandidates,
  billArtists,
  cluesCacheKey,
  eventLookupClues,
  foldName,
  interpretedPerformers,
  isGenericEvent,
  isInterpretedWork,
  isSearchableArtist,
  namesMatch,
  sameArtist,
} from "./text";
import { eventStyles, styleKey, type StyleHint } from "./style";
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
  delete event.youtube;
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
  } else if (first.source === "youtube") {
    event.youtube = {
      artist: first.artist || "",
      track: first.track || "",
      video_id: first.video_id,
      url: first.url || "",
      image: first.image || "",
    };
  } else if (first.source === "deezer") {
    event.deezer = {
      artist: first.artist || "",
      album: first.album || "",
      track: first.track || "",
      track_id: first.track_id,
      url: first.url || "",
      image: first.image || "",
      preview: true,
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

export type ArtistCacheEntry = { release: Record<string, unknown> | null; found: boolean };

export type AttachOptions = {
  concurrency?: number;
  eventConcurrency?: number;
  quiet?: boolean;
  artistTimeoutMs?: number;
  /** Preloaded Bandcamp artist cache (folded name → entry) from Turso. */
  bandcampCache?: Map<string, ArtistCacheEntry>;
  /** Receives newly resolved artists (folded name → { artist, release }) to persist. */
  bandcampUpdates?: Map<string, { artist: string; release: Record<string, unknown> | null }>;
  /** Preloaded YouTube cache (folded name → entry) from Turso. */
  youtubeCache?: Map<string, ArtistCacheEntry>;
  /** Receives newly resolved YouTube artists to persist. */
  youtubeUpdates?: Map<string, { artist: string; release: Record<string, unknown> | null }>;
};

function trim(value: string): string {
  return value.length > 64 ? value.slice(0, 61) + "…" : value;
}

const DEFAULT_ARTIST_TIMEOUT_MS = 45000;

export async function attachTracks(events: ScrapedEvent[], opts: AttachOptions = {}): Promise<void> {
  const bc = new Map<string, Release | null>();
  const sc = new Map<string, Release | null>();
  const yt = new Map<string, Release | null>();
  const dz = new Map<string, Release | null>();
  const bcInflight = new Map<string, Promise<Release | null>>();
  const scInflight = new Map<string, Promise<Release | null>>();
  // Persistent across the whole run: an artist already resolved (or ruled out)
  // is not looked up again, so repeated names cost nothing.
  const bcResolved = new Map<string, Release | null>();
  const scResolved = new Map<string, Release | null>();
  const ytResolved = new Map<string, Release | null>();
  // Deezer has no persistent cache: the API is public, key-less and generous
  // with rate limits, and an in-run memo is enough to avoid repeats.
  const dzResolved = new Map<string, Release | null>();
  // Persisted across runs (Turso): successful results are reused, while old
  // negative results expire so a temporary miss does not become permanent.
  const persistent = opts.bandcampCache;
  const persistentUpdates = opts.bandcampUpdates;
  const persistentYt = opts.youtubeCache;
  const ytUpdates = opts.youtubeUpdates;
  const stats = { found: 0, fromPage: 0, extra: 0, cached: 0, persistentHits: 0, spotifyHits: 0, youtubeHits: 0, deezerHits: 0 };
  const total = events.length;
  const quiet = opts.quiet ?? false;
  const concurrency = opts.concurrency ?? 8;
  const eventConcurrency = opts.eventConcurrency ?? 24;
  const artistTimeoutMs = opts.artistTimeoutMs ?? DEFAULT_ARTIST_TIMEOUT_MS;
  const started = Date.now();
  let done = 0;

  const lookupBandcampFor = (person: string, context: string, styles: StyleHint): Promise<Release | null> => {
    // Style is part of the key so a jazz Mike Stern is not reused for another
    // act, and a poisoned "not found" from an older run is not treated as final.
    // Description phrases are part of it too: a bare-name miss must not skip
    // Bandcamp when the event text can tell two namesakes apart.
    const clues = eventLookupClues(context, person);
    const clueKey = cluesCacheKey(clues);
    const bareKey = foldName(person);
    const baseKey = bareKey + styleKey(styles);
    const nameKey = clueKey ? baseKey + "\t" + clueKey : baseKey;
    if (bcResolved.has(nameKey)) {
      stats.cached += 1;
      return Promise.resolve(bcResolved.get(nameKey) ?? null);
    }
    // Cross-run cache: a previously resolved (or ruled-out) artist is instant.
    // A hit stored before the style suffix, or under the bare name, still wins
    // over SoundCloud. An explicit style in the event text does not reuse that
    // older hit — it may be a different namesake.
    const exact = persistent?.get(nameKey);
    const bare = bareKey === nameKey ? exact : persistent?.get(bareKey);
    const bareHit = bare?.found && bare.release ? bare : undefined;
    const persisted = (exact?.found && exact.release)
      ? exact
      : (!styles.explicit && bareHit)
        ? bareHit
        : exact;
    if (persisted !== undefined) {
      const release = (persisted.release as Release | null) ?? null;
      bcResolved.set(nameKey, release);
      stats.persistentHits += 1;
      return Promise.resolve(release);
    }
    const contextKey = nameKey + "\t" + context;
    if (bcInflight.has(contextKey)) return bcInflight.get(contextKey)!;
    const promise = withTimeout(lookupBandcamp(person, bc, context, styles), artistTimeoutMs, `bandcamp ${person}`)
      .catch((err) => {
        warn(String(err));
        return null;
      })
      .then((release) => {
        bcResolved.set(nameKey, release);
        // A 429 opens the search circuit and every later artist comes back empty.
        // That is not a real miss — caching it would skip Bandcamp forever.
        if (release || !isBandcampSearchBlocked()) {
          persistentUpdates?.set(nameKey, { artist: person, release: release ?? null });
          // Replace a bare-name miss once a described event actually finds the band.
          if (release && nameKey !== baseKey) {
            persistentUpdates?.set(baseKey, { artist: person, release });
          }
        }
        return release;
      })
      .finally(() => bcInflight.delete(contextKey));
    bcInflight.set(contextKey, promise);
    return promise;
  };
  const lookupSoundcloudFor = (person: string, context: string, styles: StyleHint): Promise<Release | null> => {
    const nameKey = foldName(person) + styleKey(styles);
    if (scResolved.has(nameKey)) {
      stats.cached += 1;
      return Promise.resolve(scResolved.get(nameKey) ?? null);
    }
    const contextKey = "sc:" + nameKey + "\t" + context;
    if (scInflight.has(contextKey)) return scInflight.get(contextKey)!;
    const promise = withTimeout(lookupSoundcloudArtist(person, sc, context, styles), artistTimeoutMs, `soundcloud ${person}`)
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
  // YouTube is the last resort and its search is rate-sensitive, so — unlike
  // Bandcamp/SoundCloud — this is never run wide; callers cap the pool at 2 and
  // the module serializes the requests.
  const lookupYoutubeFor = (person: string, context: string): Promise<Release | null> => {
    const nameKey = foldName(person);
    if (ytResolved.has(nameKey)) {
      stats.cached += 1;
      return Promise.resolve(ytResolved.get(nameKey) ?? null);
    }
    const persisted = persistentYt?.get(nameKey);
    if (persisted !== undefined) {
      const release = (persisted.release as Release | null) ?? null;
      ytResolved.set(nameKey, release);
      stats.persistentHits += 1;
      return Promise.resolve(release);
    }
    const promise = withTimeout(lookupYoutubeArtist(person, yt, context), artistTimeoutMs, `youtube ${person}`)
      .catch((err) => {
        warn(String(err));
        return null;
      })
      .then((release) => {
        ytResolved.set(nameKey, release);
        // Only persist real search outcomes. `lookupYoutubeArtist` returns null
        // without searching when YouTube is disabled, and caching that as a
        // "definitive miss" would wrongly exclude the artist once re-enabled.
        if (release || !youtubeDisabled()) {
          ytUpdates?.set(nameKey, { artist: person, release: release ?? null });
        }
        return release;
      });
    return promise;
  };

  const lookupPerson = async (
    person: string,
    pageTracks: ScrapedTrack[],
    usedPage: Set<number>,
    sources: string[],
    context: string,
    styles: StyleHint,
  ): Promise<ScrapedTrack | null> => {
    for (const source of sources) {
      if (source === "bandcamp") {
        const item = firstMatchingPageTrack(pageTracks, usedPage, person, "bandcamp");
        if (item) return item;
        const release = await lookupBandcampFor(person, context, styles);
        if (release) return bcTrack(release) as ScrapedTrack;
      } else if (source === "soundcloud") {
        const item = firstMatchingPageTrack(pageTracks, usedPage, person, "soundcloud");
        if (item) return item;
        const release = await lookupSoundcloudFor(person, context, styles);
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
    const interpreted = isInterpretedWork(title, text);
    if (interpreted) {
      people = interpretedPerformers(title, text).filter(isSearchableArtist);
    }
    const existing = (event.tracks || []) as ScrapedTrack[];
    const matchesPeople = (item: { artist?: string }) =>
      people.some((person) => sameArtist(person, item.artist || ""));

    if (
      existing.length &&
      (interpreted
        ? people.length > 0 && existing.every(matchesPeople)
        : !people.length || people.every((person) => existing.some((item) => sameArtist(person, item.artist || ""))))
    ) {
      applyPrimaryMedia(event, existing);
      stats.found += 1;
      stats.extra += Math.max(0, existing.length - 1);
    } else {
      const [bcLinks, scLinks, spotifyLinks] = await takePageLinks(event);
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
      const context = [event.venue, event.place, title, text].filter(Boolean).join(" ");
      const styles = eventStyles(event.venue_slug || "", context);
      const tracks: ScrapedTrack[] = [];
      const usedPage = new Set<number>();
      people = artists.length && !isGenericEvent(title) ? artists : [];
      if (interpreted) {
        people = interpretedPerformers(title, text).filter(isSearchableArtist);
      }

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

      for (const item of event.tracks || []) {
        if (interpreted && !matchesPeople(item)) continue;
        addTrack(item);
      }

      // Look up all artists in a phase concurrently, then add in original order
      // so first-wins dedupe and track order stay deterministic.
      // Source order: Bandcamp, then Deezer, SoundCloud only if both miss.
      // A later source is only used for an artist the earlier ones missed.
      const runPhase = async (sources: string[]): Promise<(ScrapedTrack | null)[]> =>
        mapPool(people, Math.max(2, people.length), (person) =>
          tracks.some((item) => sameArtist(person, item.artist || ""))
            ? Promise.resolve(null)
            : lookupPerson(person, pageTracks, usedPage, sources, context, styles),
        );
      for (const item of await runPhase(["bandcamp"])) addTrack(item);
      if (!interpreted && !tracks.length) addTrack(takeUnusedPage("bandcamp"));
      // Spotify fallback: pages (Nalen, Fasching, Hartwig, …) often embed a
      // Spotify artist/album the normal lookup missed. The public oembed endpoint
      // gives the authoritative name without credentials; use it as a stronger
      // search key for Bandcamp. The link itself is kept for the UI.
      if (!interpreted && !tracks.length && spotifyLinks.length) {
        const spArtist = spotifyLinks.find((l) => l.kind === "artist");
        const spAlbum = spotifyLinks.find((l) => l.kind === "album");
        if (spArtist || spAlbum) event.spotify = (spArtist || spAlbum)!.url;
        const meta = await spotifyMeta(spArtist || spAlbum!);
        if (meta?.title) {
          const already = tracks.some((item) =>
            sameArtist(meta.title, item.artist || "") || namesMatch(meta.title, item.artist || ""),
          );
          if (!already) {
            const release = await lookupBandcampFor(meta.title, context, styles);
            if (release) {
              addTrack(bcTrack(release) as ScrapedTrack);
              stats.spotifyHits += 1;
            }
          }
        }
      }

      // Deezer before SoundCloud. The widget is unreliable, so a preview wins
      // over a SoundCloud track for any artist the earlier sources missed.
      if (people.length) {
        let deezerHit = false;
        const deezerItems = await mapPool(people, Math.max(2, people.length), async (person) => {
          if (tracks.some((item) => sameArtist(person, item.artist || ""))) return null;
          const nameKey = foldName(person) + styleKey(styles);
          if (!dzResolved.has(nameKey)) {
            const release = await withTimeout(
              lookupDeezerArtist(person, dz, context, styles),
              artistTimeoutMs,
              `deezer ${person}`,
            ).catch((err) => {
              warn(String(err));
              return null;
            });
            dzResolved.set(nameKey, release);
          }
          const release = dzResolved.get(nameKey) ?? null;
          return release ? (dzTrack(release) as ScrapedTrack) : null;
        });
        for (const item of deezerItems) {
          if (!item) continue;
          addTrack(item);
          deezerHit = true;
        }
        if (deezerHit) stats.deezerHits += 1;
      }

      if (people.length) {
        const soundcloudItems = await mapPool(people, Math.max(2, people.length), (person) =>
          tracks.some((item) => sameArtist(person, item.artist || "")) || (tracks.length && people.length < 2)
            ? Promise.resolve(null)
            : lookupPerson(person, pageTracks, usedPage, ["soundcloud"], context, styles),
        );
        for (const item of soundcloudItems) addTrack(item);
      }
      if (!interpreted && !tracks.length) addTrack(takeUnusedPage("soundcloud"));

      // YouTube is off unless SCRAPE_YOUTUBE=1. It only runs when Bandcamp,
      // Deezer and SoundCloud all missed.
      if (!tracks.length && people.length) {
        // Skip any artist that the Spotify-metadata step already ruled out, so
        // a wrong name (e.g. a sentence-like event title) is not searched twice.
        let spTitle = "";
        if (spotifyLinks.length) {
          const spArtist = spotifyLinks.find((l) => l.kind === "artist");
          const spAlbum = spotifyLinks.find((l) => l.kind === "album");
          const meta = await spotifyMeta(spArtist || spAlbum!);
          spTitle = meta?.title || "";
        }
        const ytPeople = spTitle
          ? people.filter((person) => !sameArtist(person, spTitle) && !namesMatch(person, spTitle))
          : people;
        const youtubeItems = await mapPool(ytPeople, 2, (person) =>
          tracks.some((item) => sameArtist(person, item.artist || ""))
            ? Promise.resolve(null)
            : lookupYoutubeFor(person, context).then((release) =>
                release ? (ytTrack(release) as ScrapedTrack) : null,
              ),
        );
        for (const item of youtubeItems) addTrack(item);
        if (tracks.length) stats.youtubeHits += 1;
      }

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
      `${stats.spotifyHits} via Spotify-metadata, ${stats.youtubeHits} via YouTube, ` +
      `${stats.deezerHits} via Deezer-förhandslyssning, ` +
      `${stats.cached} cachade i körningen, ${stats.persistentHits} från tidigare körningar) ` +
      `på ${seconds(Date.now() - started)}`,
  );
}
