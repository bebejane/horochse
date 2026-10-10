import { httpRequest, HttpError, UA } from "./http";
import { albumTitleScore, cluesCacheKey, eventLookupClues, nameWords, namesMatch, sameArtist } from "./text";
import { scoreTextAgainstClues } from "./bandcamp";
import { alignmentOf, eventStyles, placeScore, styleKey, stylesInText, type StyleHint } from "./style";

let scClientId = "";

export async function soundcloudClientId(): Promise<string> {
  if (scClientId) return scClientId;
  const page = await httpRequest("https://soundcloud.com/");
  const scripts = [...page.matchAll(/https:\/\/a-v2\.sndcdn\.com\/assets\/[^"']+\.js/g)].map((m) => m[0]);
  for (const script of scripts) {
    const js = await httpRequest(script);
    const match =
      /client_id=([A-Za-z0-9]{16,})/.exec(js) ||
      /client_id["']?\s*[:=]\s*["']([A-Za-z0-9]{16,})["']/.exec(js);
    if (match) {
      scClientId = match[1];
      return scClientId;
    }
  }
  throw new Error("hittade ingen SoundCloud-nyckel");
}

function qs(params: Record<string, unknown>): string {
  return new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
}

export async function soundcloudGet(
  path: string,
  params: Record<string, unknown> = {},
  retry = true,
): Promise<any> {
  const merged: Record<string, unknown> = { ...params };
  merged.client_id = await soundcloudClientId();
  let url: string;
  if (path.startsWith("http")) {
    url = path + (path.includes("?") ? "&" : "?") + qs(merged);
  } else {
    url = "https://api-v2.soundcloud.com" + path + "?" + qs(merged);
  }
  try {
    const raw = await httpRequest(url, {
      extraHeaders: {
        Accept: "application/json",
        Origin: "https://soundcloud.com",
        Referer: "https://soundcloud.com/",
      },
    });
    return JSON.parse(raw);
  } catch (exc) {
    if (retry && exc instanceof HttpError && (exc.status === 401 || exc.status === 403)) {
      scClientId = "";
      const next: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(merged)) if (k !== "client_id") next[k] = v;
      return soundcloudGet(path, next, false);
    }
    throw exc;
  }
}

export function scArt(url: string): string {
  if (!url) return "";
  return url.replace(/-large\.(jpg|png|webp)$/i, "-t500x500.$1");
}

export function hasProgressive(track: any): boolean {
  for (const item of track?.media?.transcodings || []) {
    if (item?.format?.protocol === "progressive") return true;
  }
  return false;
}

export function releaseFromScTrack(track: any, artistHint = ""): Record<string, any> | null {
  if (!track || !track.id || !track.streamable || !hasProgressive(track)) return null;
  const user = track.user || {};
  return {
    artist: artistHint || user.username || user.full_name || "",
    track: track.title || "",
    track_id: track.id,
    url: track.permalink_url || "",
    image: scArt(track.artwork_url || user.avatar_url || ""),
    genre: String(track.genre || ""),
  };
}

export async function latestFromScUser(user: any): Promise<Record<string, any> | null> {
  const data = await soundcloudGet("/users/" + String(user.id) + "/tracks", { limit: 8 });
  const artist = user.username || user.full_name || "";
  let widgetOnly: Record<string, any> | null = null;
  for (const track of data.collection || []) {
    const release = releaseFromScTrack(track, artist);
    if (!release) continue;
    const direct = await soundcloudStreamFromTrack(track, false, 4000);
    if (direct) return release;
    if (!widgetOnly) widgetOnly = { ...release, widgetOnly: true };
  }
  return widgetOnly;
}

async function verifiedScTrack(track: any, artistHint = ""): Promise<Record<string, any> | null> {
  const release = releaseFromScTrack(track, artistHint);
  if (!release) return null;
  return (await soundcloudStreamFromTrack(track, false, 4000))
    ? release
    : { ...release, widgetOnly: true };
}

export async function lookupSoundcloudUrl(
  url: string,
  cache: Map<string, Record<string, any> | null>,
): Promise<Record<string, any> | null> {
  const key = "scurl:" + String(url || "").split("?")[0].replace(/\/+$/, "").toLowerCase();
  if (cache.has(key)) return cache.get(key) ?? null;
  try {
    const resolved = await soundcloudGet("/resolve", { url: String(url).split("?")[0] });
    const kind = resolved.kind;
    let release: Record<string, any> | null = null;
    if (kind === "track") {
      release = await verifiedScTrack(resolved);
      if (release?.widgetOnly && resolved.user?.id) {
        try {
          const alternative = await latestFromScUser(resolved.user);
          if (alternative && !alternative.widgetOnly) release = alternative;
        } catch (exc) {
          console.warn(`soundcloud-alternativ (${resolved.user.username || resolved.user.id}):`, exc);
        }
      }
    } else if (kind === "playlist") {
      const tracks: any[] = resolved.tracks || [];
      let widgetOnly: Record<string, any> | null = null;
      for (let track of tracks.slice(0, 6)) {
        if (track.id && !track.streamable) track = await soundcloudGet("/tracks/" + String(track.id));
        const candidate = await verifiedScTrack(track);
        if (!candidate) continue;
        if (!candidate.widgetOnly) {
          release = candidate;
          break;
        }
        if (!widgetOnly) widgetOnly = candidate;
      }
      release ||= widgetOnly;
    } else if (kind === "user") {
      release = await latestFromScUser(resolved);
    }
    cache.set(key, release);
    return release;
  } catch (exc) {
    console.error(`soundcloud-url (${url}):`, exc);
    cache.set(key, null);
    return null;
  }
}

export async function lookupSoundcloudArtist(
  query: string,
  cache: Map<string, Record<string, any> | null>,
  context = "",
  styles?: StyleHint,
): Promise<Record<string, any> | null> {
  const clues = eventLookupClues(context, query);
  const hint = styles ?? eventStyles("", context);
  const key = "sc:" + clueKey(query) + "\t" + cluesCacheKey(clues) + styleKey(hint);
  if (cache.has(key)) return cache.get(key) ?? null;
  try {
    for (const albumHint of (clues.albums || []).slice(0, 2)) {
      const data = await soundcloudGet("/search/tracks", { q: query + " " + albumHint, limit: 8 });
      let best: Record<string, any> | null = null;
      let bestTrack: any = null;
      let bestScore = 0;
      for (const track of data.collection || []) {
        const user = track.user || {};
        const names = [user.username || "", user.full_name || ""];
        if (!names.some((name) => name && (namesMatch(query, name) || sameArtist(query, name)))) continue;
        const score = Math.max(
          albumTitleScore(albumHint, track.title || ""),
          albumTitleScore(albumHint, track.description || ""),
        );
        if (score < 1) continue;
        const release = releaseFromScTrack(track, names[0] || names[1]);
        if (release && score > bestScore) {
          bestTrack = track;
          best = release;
          bestScore = score;
        }
      }
      if (best) {
        const direct = await soundcloudStreamFromTrack(bestTrack, false, 4000);
        if (!direct) {
          try {
            const alternative = await latestFromScUser(bestTrack.user);
            if (alternative && !alternative.widgetOnly) best = alternative;
            else best = { ...best, widgetOnly: true };
          } catch (exc) {
            console.warn(`soundcloud-alternativ (${bestTrack.user?.username || query}):`, exc);
            best = { ...best, widgetOnly: true };
          }
        }
        cache.set(key, best);
        return best;
      }
    }
    const data = await soundcloudGet("/search/users", { q: query, limit: 8 });
    const ignore = nameWords(query);
    const ranked: { score: number; user: any }[] = [];
    for (const user of data.collection || []) {
      const names = [user.username || "", user.full_name || ""];
      if (!names.some((name) => name && namesMatch(query, name))) continue;
      const blob = [
        user.username || "",
        user.full_name || "",
        user.description || "",
        user.city || "",
        user.country || "",
      ].join(" ");
      const align = alignmentOf(stylesInText(blob), hint) + placeScore(blob, context);
      ranked.push({ score: scoreTextAgainstClues(blob, clues, context, ignore) + align, user });
    }
    ranked.sort((a, b) => b.score - a.score);
    const bestScore = ranked[0]?.score ?? 0;
    // Several accounts share the name and none of them is supported by the
    // event text or the venue's style. Guessing picks the wrong band.
    if (ranked.length > 1 && bestScore <= 0) {
      cache.set(key, null);
      return null;
    }
    const viable = ranked.filter((item) => item.score >= 0 || item.score === bestScore).slice(0, 4);
    let best: Record<string, any> | null = null;
    let bestRank = -Infinity;
    for (const { user, score } of viable) {
      const release = await latestFromScUser(user);
      if (!release) continue;
      const trackAlign = alignmentOf(stylesInText(String(release.genre || "")), hint);
      const rank = score + trackAlign;
      if (rank > bestRank) {
        best = release;
        bestRank = rank;
      }
    }
    // A namesake whose tags clash with the venue (rap at a rock club, electronics
    // at a jazz club) is worse than no SoundCloud hit — Bandcamp or Deezer can
    // still find the matching act.
    if (best && (bestRank >= 0 || !hint.wanted.length)) {
      cache.set(key, best);
      return best;
    }
    cache.set(key, null);
    return null;
  } catch (exc) {
    console.error(`soundcloud (${query}):`, exc);
    cache.set(key, null);
    return null;
  }
}

function clueKey(query: string): string {
  return String(query || "").normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export async function streamWorks(url: string, timeoutMs = 12000): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Range: "bytes=0-1",
        Referer: "https://soundcloud.com/",
        Origin: "https://soundcloud.com",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.status === 200 || res.status === 206;
  } catch {
    return false;
  }
}

export function soundcloudMeta(track: any): Record<string, any> {
  const user = track.user || {};
  return {
    artist: user.username || user.full_name || "",
    track: track.title || "",
    url: track.permalink_url || "",
    image: scArt(track.artwork_url || user.avatar_url || ""),
  };
}

export async function soundcloudStreamFromTrack(
  track: any,
  allowWidget = true,
  streamProbeTimeoutMs = 12000,
): Promise<Record<string, any> | null> {
  const transcodings = track?.media?.transcodings || [];
  const ordered = transcodings.filter((item: any) => item?.format?.protocol === "progressive");
  const auth = track?.track_authorization || "";
  const meta = soundcloudMeta(track);
  for (const item of ordered) {
    const href = item.url || "";
    if (!href) continue;
    const params: Record<string, unknown> = {};
    if (auth) params.track_authorization = auth;
    let info: any;
    try {
      info = await soundcloudGet(href, params);
    } catch {
      continue;
    }
    const stream = String(info.url || "").trim();
    if (!stream || !(await streamWorks(stream, streamProbeTimeoutMs))) continue;
    meta.stream = stream;
    return meta;
  }
  if (allowWidget && track?.streamable && meta.url) {
    meta.widget = true;
    return meta;
  }
  return null;
}

export async function soundcloudStreamUrl(trackId: number): Promise<Record<string, any> | null> {
  const track = await soundcloudGet("/tracks/" + String(Number(trackId)));
  // Only this track. Substituting another upload from the same user made Next
  // keep playing the previous song under a new title.
  return soundcloudStreamFromTrack(track);
}

export function scTrack(release: any): Record<string, any> {
  return {
    source: "soundcloud",
    artist: release.artist || "",
    track: release.track || "",
    track_id: release.track_id,
    url: release.url || "",
    image: release.image || "",
    widgetOnly: Boolean(release.widgetOnly),
  };
}
