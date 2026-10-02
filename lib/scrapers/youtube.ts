// YouTube — last-resort track source.
//
// YouTube is searched only when Bandcamp and SoundCloud both miss, and only
// once per artist ever (the result — hit or miss — is cached across runs in
// `youtube_videos`). There is no API key: we read the same `ytInitialData`
// blob the search page ships, and use the public oembed endpoint to confirm a
// video is embeddable. Playback is an embedded player, never an extracted
// audio stream.
//
// Matching is deliberately strict: YouTube returns *something* for almost any
// query (covers, karaoke, unrelated namesakes), so a wrong track is worse than
// no track. A candidate must match on channel or title, pass a title
// denylist, and be of a plausible song length.

import { httpRequest } from "./http";
import { cleanPersonName, foldName, isGenericEvent, namesMatch, sameArtist } from "./text";

export type YoutubeVideo = {
  id: string;
  title: string;
  channel: string;
  seconds: number;
};

type Release = Record<string, any>;

// The EU consent interstitial hides `ytInitialData`. A pre-set consent cookie
// skips it, the same way a browser that has already answered would.
const CONSENT_COOKIE =
  "CONSENT=YES+cb.20210328-17-p0.en+FX+678; " +
  "SOCS=CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjMwODI5LjA3X3AxGgJlbiACGgYIgLC_pwY";

// Plausible song/video length. Filters out 10-hour loops, full DJ sets and
// sub-minute clips that are rarely the artist's own music.
const MIN_SECONDS = 45;
const MAX_SECONDS = 30 * 60;

// "discover"/"recovered" don't trip `\bcover\b`, so a word-boundary match is
// safe here.
const TITLE_REJECT =
  /\b(covers?|covered|karaoke|tribute|reaction|reacts|remix|mashup|slowed|reverb|nightcore|acapella|tutorial|lesson|backing track|how to play|10 hours|8 hours|1 hour loop)\b/i;
const CHANNEL_REJECT = /\b(karaoke|covers?|tribute|reaction|remixes?)\b/i;

// A bare generic word ("Jam", "Live", "Festival") is an event, not an artist —
// and it matches unrelated acts ("The Jam"). Never search for these.
const GENERIC_ARTIST_NAMES = new Set([
  "jam", "live", "konsert", "concert", "festival", "session", "sessions",
  "dj", "band", "trio", "duo", "kvartett", "quartet", "kvintett", "quintet",
  "sextett", "sextet", "ensemble", "orchestra", "orkester", "musik", "music",
  "bluesjam", "festivaljam", "afterwork", "klubb", "club", "support",
  "gaster", "special guest", "open mic",
]);

// Below this length a single-word name is too ambiguous for a bare substring
// match; only a channel match or a leading title match will do.
const WEAK_SINGLE_WORD_LENGTH = 8;

// An artist name is not a sentence: reject queries with sentence punctuation or
// trailing filler, which are almost always event titles rather than performers.
const SENTENCE_ARTIST = /[!?…;"“”]|\b(med|sjunger|presenterar|gästas av)\b/i;

// Single words that are almost never a performer on their own but appear as the
// trailing half of a split title ("Livet är härligt, mamma!" → "mamma").
const FRAGMENT_ARTIST = new Set([
  "mamma", "pappa", "mormor", "farmor", "alla", "folk", "mannen", "kvinnan",
  "världen", "himlen", "livet", "kärleken", "stjärnorna", "solen", "månen",
]);

// YouTube tolerates only so much scraping; space searches out. Volume is tiny
// (unique artists, cached), so a simple serialized pacer is enough.
const SEARCH_MIN_INTERVAL_MS = 900;
let chain: Promise<unknown> = Promise.resolve();
let lastAt = 0;

/**
 * DISABLED. YouTube matching is not strict enough to ship: at full-catalogue
 * scale it attached unrelated videos (Queen for "Love of my life - Nils
 * Landgren", a wedding video for "Caipirinha Society", and one sideman per
 * Glenn Miller Café personnel-list title). The plumbing is kept intact so the
 * matcher can be tightened and re-enabled. While false, no search runs and no
 * track is attached — and because a miss is cached, nothing poisons the
 * `youtube_videos` table either.
 *
 * Set `SCRAPE_YOUTUBE` to "1"/"true" to experiment locally without a code change.
 */
function youtubeEnabled(): boolean {
  const flag = String(process.env.SCRAPE_YOUTUBE || "").toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

/** True while YouTube matching is turned off (the default). */
export function youtubeDisabled(): boolean {
  return !youtubeEnabled();
}

function pace(): Promise<void> {
  const step = async (): Promise<void> => {
    const wait = Math.max(0, lastAt + SEARCH_MIN_INTERVAL_MS - Date.now());
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastAt = Date.now();
  };
  const next = chain.then(step, step);
  chain = next.catch(() => undefined);
  return next;
}

function parseLength(text: unknown): number {
  const parts = String(text || "")
    .split(":")
    .map((part) => Number(part.trim()));
  if (!parts.length || parts.some((part) => !Number.isFinite(part))) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-phrase containment on folded text ("nana rashid" in "… nana rashid …"). */
function containsPhrase(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  return (
    haystack === needle ||
    haystack.startsWith(needle + " ") ||
    haystack.endsWith(" " + needle) ||
    haystack.includes(" " + needle + " ")
  );
}

export async function searchYoutube(query: string): Promise<YoutubeVideo[]> {
  await pace();
  const url =
    "https://www.youtube.com/results?search_query=" +
    encodeURIComponent(query) +
    "&hl=en&gl=SE&sp=EgIQAQ%253D%253D";
  const html = await httpRequest(url, {
    extraHeaders: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
      Cookie: CONSENT_COOKIE,
    },
    timeoutMs: 20000,
  });
  const match = /var ytInitialData = (\{.+?\});<\/script>/.exec(html);
  if (!match) return [];

  let data: any;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return [];
  }

  const found: YoutubeVideo[] = [];
  const seen = new Set<string>();
  const walk = (node: any): void => {
    if (!node || typeof node !== "object") return;
    const video = node.videoRenderer;
    if (video && video.videoId) {
      const id = String(video.videoId);
      if (!seen.has(id)) {
        seen.add(id);
        found.push({
          id,
          title: (video.title?.runs || []).map((run: any) => run.text).join("") || "",
          channel:
            (video.ownerText?.runs || []).map((run: any) => run.text).join("") ||
            (video.longBylineText?.runs || []).map((run: any) => run.text).join("") ||
            "",
          seconds: parseLength(video.lengthText?.simpleText),
        });
      }
    }
    for (const key in node) walk(node[key]);
  };
  walk(data);
  return found;
}

/** Strict score for a candidate; -1 rejects it outright. */
export function scoreVideo(video: YoutubeVideo, artist: string): number {
  if (video.seconds && (video.seconds < MIN_SECONDS || video.seconds > MAX_SECONDS)) return -1;
  if (TITLE_REJECT.test(video.title)) return -1;

  const foldedArtist = foldName(artist);
  if (!foldedArtist) return -1;
  const foldedChannel = foldName(video.channel);
  const foldedTitle = foldName(video.title);

  // "<artist> - Topic" is YouTube's auto-generated official artist channel.
  const topic =
    foldedChannel === foldedArtist + " topic" ||
    foldedChannel === foldedArtist + " official";
  // `namesMatch` is deliberately not used here: it treats one name as a prefix
  // of the other, so a long event title would "match" a short unrelated channel
  // ("Livet är härligt, mamma!" vs "Lisa Grotherus"). `sameArtist` requires the
  // extra words to be a recognised band suffix, which is what we want.
  const channelMatch = sameArtist(artist, video.channel);
  if (CHANNEL_REJECT.test(video.channel) && !topic && !channelMatch) return -1;

  if (topic) return 4;
  if (channelMatch) return 3;
  const lead = foldedTitle.startsWith(foldedArtist + " ");
  if (lead) {
    // "<Artist> - <Venue lyrics video>" embeds the artist name in the upload
    // title but is not the artist's own channel. (A real artist channel is
    // caught by `channelMatch`/`topic` above.)
    if (/\b(lyrics?|official (audio|video|lyric)|visuali[sz]er|audio)\s*$/i.test(video.title)) {
      return -1;
    }
    return 2;
  }
  // A short single word is too weak a signal for a bare substring match: "Jam"
  // must not match "The Jam - Going Underground". Require channel/leading-title
  // above, or reject.
  if (foldedArtist.split(" ").length === 1 && foldedArtist.length < WEAK_SINGLE_WORD_LENGTH) {
    return -1;
  }
  if (containsPhrase(foldedTitle, foldedArtist)) return 1;
  return -1;
}

/** Public oembed (no credentials): confirms a video is embeddable and returns
 *  its authoritative title/author. 401/404 means embedding is disabled. */
export async function youtubeOembed(
  id: string,
): Promise<{ title: string; author: string; image: string } | null> {
  try {
    const raw = await httpRequest(
      "https://www.youtube.com/oembed?url=" +
        encodeURIComponent("https://www.youtube.com/watch?v=" + id) +
        "&format=json",
      { extraHeaders: { Accept: "application/json" }, timeoutMs: 15000 },
    );
    const data = JSON.parse(raw);
    return {
      title: String(data.title || ""),
      author: String(data.author_name || ""),
      image: String(data.thumbnail_url || ""),
    };
  } catch {
    return null;
  }
}

function displayArtist(author: string, fallback: string): string {
  const clean = String(author || "").replace(/\s*-\s*Topic\s*$/i, "").trim();
  return clean || fallback;
}

/**
 * Find an embeddable video for `artist`. Returns a release-like object, or null
 * for a definitive miss (which the caller caches so it is never retried).
 */
export async function lookupYoutubeArtist(
  query: string,
  cache: Map<string, Release | null>,
  context = "",
): Promise<Release | null> {
  // Disabled: return a miss without searching or caching anything.
  if (!youtubeEnabled()) return null;
  const artist = cleanPersonName(query) || query;
  if (!artist || isGenericEvent(artist)) return null;
  if (GENERIC_ARTIST_NAMES.has(foldName(artist))) return null;
  if (FRAGMENT_ARTIST.has(foldName(artist))) return null;
  if (SENTENCE_ARTIST.test(artist)) return null;
  const key = "yt:" + foldName(artist);
  if (cache.has(key)) return cache.get(key) ?? null;

  try {
    const videos = await searchYoutube(artist);
    const ranked = videos
      .map((video) => ({ video, score: scoreVideo(video, artist) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
    if (!ranked.length) {
      cache.set(key, null);
      return null;
    }

    // Verify embeddability for the best few, in case the top hit disallows it.
    for (const { video } of ranked.slice(0, 3)) {
      const meta = await youtubeOembed(video.id);
      if (!meta) continue;
      const release: Release = {
        artist: displayArtist(meta.author || video.channel, artist),
        track: meta.title || video.title || "",
        video_id: video.id,
        url: "https://www.youtube.com/watch?v=" + video.id,
        image: meta.image || "https://i.ytimg.com/vi/" + video.id + "/hqdefault.jpg",
        seconds: video.seconds,
      };
      cache.set(key, release);
      return release;
    }
    cache.set(key, null);
    return null;
  } catch {
    // Network/consent failure is not a definitive miss — don't poison the cache.
    return null;
  }
}

export function ytTrack(release: any): Record<string, any> {
  return {
    source: "youtube",
    artist: release.artist || "",
    track: release.track || "",
    video_id: release.video_id || null,
    url: release.url || "",
    image: release.image || "",
  };
}
