import { BANDCAMP_CACHE_VERSION } from "./bandcamp-match";
import { bandcampReleaseMatchesArtist, isBandcampSearchBlocked, lookupBandcampLink } from "./bandcamp";
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

function bandcampLinkTrack(release: { artist?: string; url?: string } | null | undefined): ScrapedTrack | null {
  const url = String(release?.url || "").trim();
  if (!url || !/bandcamp\.com/i.test(url)) return null;
  return { source: "bandcamp", artist: release?.artist || "", url, type: "link" };
}

function isLinkTrack(track: ScrapedTrack): boolean {
  return track.type === "link" || track.source === "bandcamp";
}

export function applyPrimaryMedia(event: ScrapedEvent, tracks: ScrapedTrack[]): void {
  delete event.bandcamp;
  delete event.soundcloud;
  delete event.youtube;
  delete event.deezer;
  const playable = tracks.filter((item) => !isLinkTrack(item));
  const links = tracks.filter(isLinkTrack).map((item) =>
    item.source === "bandcamp" ? bandcampLinkTrack(item) || item : item,
  );
  const ordered = [...playable, ...links];
  if (!ordered.length) {
    delete event.tracks;
    return;
  }
  event.tracks = ordered;
  const first = playable[0];
  if (!first) return;
  if (first.source === "youtube") {
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
    const legacyBaseKey = bareKey + styleKey(styles);
    const baseKey = BANDCAMP_CACHE_VERSION + legacyBaseKey;
    const nameKey = clueKey ? baseKey + "\t" + clueKey : baseKey;
    if (bcResolved.has(nameKey)) {
      stats.cached += 1;
      return Promise.resolve(bcResolved.get(nameKey) ?? null);
    }
    // Cross-run cache: a previously resolved (or ruled-out) artist is instant.
    // A hit stored before the style suffix, or under the bare name, still wins
    // over SoundCloud. An explicit style in the event text does not reuse that
    // older hit — it may be a different namesake.
    const legacyKey = clueKey ? legacyBaseKey + "\t" + clueKey : legacyBaseKey;
    const legacy = persistent?.get(legacyKey);
    const exact = persistent?.get(nameKey) ?? (legacy?.found ? legacy : undefined);
    const bare = bareKey === nameKey ? exact : persistent?.get(bareKey);
    const bareHit = bare?.found && bare.release ? bare : undefined;
    const persisted = (exact?.found && exact.release)
      ? exact
      : (!styles.explicit && bareHit)
        ? bareHit
        : exact;
    if (persisted !== undefined && (!persisted.found || persisted.release && bandcampReleaseMatchesArtist(person, persisted.release))) {
      const release = (persisted.release as Release | null) ?? null;
      bcResolved.set(nameKey, release);
      stats.persistentHits += 1;
      return Promise.resolve(release);
    }
    const contextKey = nameKey + "\t" + context;
    if (bcInflight.has(contextKey)) return bcInflight.get(contextKey)!;
    const promise = withTimeout(lookupBandcampLink(person, context, styles), artistTimeoutMs, `bandcamp ${person}`)
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
      if (source === "soundcloud") {
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

    const playableExisting = existing.filter((item) => !isLinkTrack(item));
    const alreadyCovered =
      playableExisting.length > 0 &&
      (interpreted
        ? people.length > 0 && playableExisting.every(matchesPeople)
        : !people.length || people.every((person) => playableExisting.some((item) => sameArtist(person, item.artist || ""))));

    if (alreadyCovered) {
      applyPrimaryMedia(event, existing);
    } else {
      const [bcLinks, scLinks, spotifyLinks] = await takePageLinks(event);
      const pageTracks: ScrapedTrack[] = [];
      for (const url of bcLinks) {
        const link = bandcampLinkTrack({ url });
        if (link) {
          pageTracks.push(link);
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

      const playableFor = (person: string) =>
        tracks.some((item) => !isLinkTrack(item) && sameArtist(person, item.artist || ""));
      const bandcampLinkFor = (person: string) =>
        tracks.some((item) => item.source === "bandcamp" && item.artist && sameArtist(person, item.artist));
      const takeUnusedPage = (source: string): ScrapedTrack | null => {
        for (let i = 0; i < pageTracks.length; i++) {
          if (usedPage.has(i) || pageTracks[i].source !== source) continue;
          usedPage.add(i);
          return pageTracks[i];
        }
        return null;
      };
      const addPlayable = (item: ScrapedTrack | null | undefined): void => {
        if (!item || isLinkTrack(item)) return;
        const artist = item.artist || "";
        if (artist && playableFor(artist)) return;
        tracks.push(item);
      };
      const addLink = (item: ScrapedTrack | null | undefined): void => {
        if (!item?.url) return;
        const artist = item.artist || "";
        if (item.source === "bandcamp") {
          if (artist && bandcampLinkFor(artist)) return;
          if (!artist && tracks.some((entry) => entry.source === "bandcamp" && entry.url === item.url)) return;
          tracks.push({ source: "bandcamp", artist, url: item.url, type: "link" });
          return;
        }
        if (artist && tracks.some((entry) => entry.type === "link" && entry.source === item.source && sameArtist(artist, entry.artist || ""))) return;
        tracks.push({ source: item.source, artist, url: item.url, type: "link" });
      };

      for (const item of event.tracks || []) {
        if (interpreted && !matchesPeople(item)) continue;
        if (isLinkTrack(item)) addLink(item.source === "bandcamp" ? bandcampLinkTrack(item) : item);
        else addPlayable(item);
      }
      for (const item of pageTracks) {
        if (item.source === "bandcamp") addLink(item);
      }

      // Deezer is the track we play. SoundCloud fills in only where Deezer misses.
      // Bandcamp is stored as a link for Hör mer, never as audio.
      const lookupDeezerFor = async (person: string): Promise<ScrapedTrack | null> => {
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
          // Only remember a real answer. A timeout must not skip the artist.
          if (release) dzResolved.set(nameKey, release);
        }
        const release = dzResolved.get(nameKey) ?? null;
        return release ? (dzTrack(release) as ScrapedTrack) : null;
      };

      if (people.length) {
        let deezerHit = false;
        const deezerItems = await mapPool(people, Math.max(2, people.length), (person) =>
          playableFor(person) ? Promise.resolve(null) : lookupDeezerFor(person),
        );
        for (const item of deezerItems) {
          if (!item) continue;
          addPlayable(item);
          deezerHit = true;
        }
        if (deezerHit) stats.deezerHits += 1;
      }

      // Spotify oembed supplies a cleaner artist name when the title lookup missed.
      let spotifyTitle = "";
      if (!interpreted && spotifyLinks.length) {
        const spArtist = spotifyLinks.find((l) => l.kind === "artist");
        const spAlbum = spotifyLinks.find((l) => l.kind === "album");
        if (spArtist || spAlbum) event.spotify = (spArtist || spAlbum)!.url;
        const meta = await spotifyMeta(spArtist || spAlbum!);
        spotifyTitle = meta?.title || "";
        if (spotifyTitle && !playableFor(spotifyTitle) && !tracks.some((item) => !isLinkTrack(item))) {
          const item = await lookupDeezerFor(spotifyTitle);
          if (item) {
            addPlayable(item);
            stats.spotifyHits += 1;
            stats.deezerHits += 1;
          }
        }
      }

      if (people.length) {
        const bandcampLinks = await mapPool(people, Math.max(2, people.length), (person) =>
          bandcampLinkFor(person)
            ? Promise.resolve(null)
            : lookupBandcampFor(person, context, styles).then((release) => bandcampLinkTrack(release)),
        );
        for (const item of bandcampLinks) addLink(item);
      }
      if (spotifyTitle && !bandcampLinkFor(spotifyTitle)) {
        addLink(bandcampLinkTrack(await lookupBandcampFor(spotifyTitle, context, styles)));
      }

      if (people.length) {
        const soundcloudItems = await mapPool(people, Math.max(2, people.length), async (person) => {
          const playing = playableFor(person);
          if (playing && bandcampLinkFor(person)) return null;
          if (!playing && tracks.some((item) => !isLinkTrack(item) && item.source === "soundcloud" && sameArtist(person, item.artist || ""))) {
            return null;
          }
          const item = await lookupPerson(person, pageTracks, usedPage, ["soundcloud"], context, styles);
          if (!item) return null;
          if (playing) return { source: "soundcloud", artist: item.artist || person, url: item.url || "", type: "link" } as ScrapedTrack;
          return item;
        });
        for (const item of soundcloudItems) {
          if (!item) continue;
          if (item.type === "link") addLink(item);
          else addPlayable(item);
        }
      }
      if (!interpreted && !tracks.some((item) => !isLinkTrack(item))) addPlayable(takeUnusedPage("soundcloud"));

      // YouTube is off unless SCRAPE_YOUTUBE=1, and only when nothing is playable.
      if (!tracks.some((item) => !isLinkTrack(item)) && people.length) {
        const ytPeople = spotifyTitle
          ? people.filter((person) => !sameArtist(person, spotifyTitle) && !namesMatch(person, spotifyTitle))
          : people;
        const youtubeItems = await mapPool(ytPeople, 2, (person) =>
          playableFor(person)
            ? Promise.resolve(null)
            : lookupYoutubeFor(person, context).then((release) =>
                release ? (ytTrack(release) as ScrapedTrack) : null,
              ),
        );
        for (const item of youtubeItems) addPlayable(item);
        if (tracks.some((item) => item.source === "youtube")) stats.youtubeHits += 1;
      }

      applyPrimaryMedia(event, tracks);
    }

    const playableCount = (event.tracks || []).filter((item) => !isLinkTrack(item)).length;
    if (playableCount) {
      stats.found += 1;
      stats.extra += Math.max(0, playableCount - 1);
    }

    done += 1;
    if (!quiet) {
      const n = `(${done}/${total})`;
      const count = (event.tracks || []).filter((item) => !isLinkTrack(item)).length;
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
