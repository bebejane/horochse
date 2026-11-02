// One-off: Deezer becomes the playable track. Bandcamp rows stay as Hör mer
// links (no stream ids). SoundCloud stays playable only where Deezer misses,
// and otherwise becomes the secondary link.
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

type TrackInput = import("../lib/db/queries").TrackInput;

function asNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const { db } = await import("../lib/db/client");
  const { replaceTracksBatch } = await import("../lib/db/queries");
  const { events, tracks } = await import("../lib/db/schema");
  const { dzTrack, lookupDeezerArtist } = await import("../lib/scrapers/deezer");
  const { eventStyles, styleKey } = await import("../lib/scrapers/style");
  const { eventArtists } = await import("../lib/scrapers/tracks");
  const { sameArtist, cleanPersonName, isSearchableArtist } = await import("../lib/scrapers/text");
  const { log, mapPool } = await import("../lib/scrapers/log");

  type TrackRow = typeof tracks.$inferSelect;

  const eventRows = await db.select().from(events);
  const trackRows = await db.select().from(tracks);
  const byEvent = new Map<string, TrackRow[]>();
  for (const row of trackRows) {
    const list = byEvent.get(row.eventId);
    if (list) list.push(row);
    else byEvent.set(row.eventId, [row]);
  }

  const targets = eventRows.filter((event) => {
    const list = byEvent.get(event.id) || [];
    if (!list.length) return false;
    return !list.some((row) => row.type !== "link" && row.source !== "bandcamp");
  });
  log(`${targets.length} konserter utan spelbar låt att försöka igen`);

  const dzCache = new Map<string, Record<string, any> | null>();
  const inflight = new Map<string, Promise<TrackInput | null>>();
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const deezerFor = (name: string, context: string, styles: ReturnType<typeof eventStyles>) => {
    const key = name.trim().toLowerCase() + styleKey(styles);
    const pending = inflight.get(key);
    if (pending) return pending;
    const promise = (async () => {
      await sleep(350);
      let last = "";
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const release = await lookupDeezerArtist(name, dzCache, context, styles);
          if (!release) return null;
          const track = dzTrack(release);
          const item: TrackInput = {
            source: "deezer",
            artist: track.artist || null,
            album: track.album || null,
            title: track.track || null,
            url: track.url || null,
            image: track.image || null,
            trackId: asNumber(track.track_id),
          };
          return item.trackId ? item : null;
        } catch (err) {
          last = String(err);
          await sleep(1500 * (attempt + 1));
        }
      }
      if (last) log(last);
      return null;
    })();
    inflight.set(key, promise);
    return promise;
  };

  const variants = (name: string): string[] => {
    const cleaned = cleanPersonName(name) || name.trim();
    const out = [cleaned];
    const stripped = cleaned
      .replace(/\s+(trio|quartet|quintet|sextet|septet|octet|ensemble|orchestra|band|group|duo|project|kvartett|kvintett|orkester)$/i, "")
      .trim();
    if (stripped && stripped !== cleaned && stripped.split(/\s+/).length >= 2) out.push(stripped);
    return [...new Set(out)];
  };

  const remember = (names: string[], name: string) => {
    const cleaned = (cleanPersonName(name) || name).trim();
    if (!cleaned || names.some((item) => sameArtist(item, cleaned))) return;
    names.push(cleaned);
  };

  let deezerAdded = 0;
  let silent = 0;
  const groups: { eventId: string; tracks: TrackInput[] }[] = [];

  await mapPool(targets, 2, async (event, index) => {
    const list = byEvent.get(event.id) || [];
    const names: string[] = [];
    for (const row of list) if (row.artist) remember(names, row.artist);
    const fromTitle = eventArtists(event.title, event.text || "").filter((person) => isSearchableArtist(person));
    const context = [event.title, event.text || "", event.place || ""].filter(Boolean).join(" ");
    const styles = eventStyles(event.venueSlug, context);
    const playable: TrackInput[] = [];
    const links: TrackInput[] = [];
    const deezerArtists = new Set<string>();

    for (const name of names) {
      const existing = list.find(
        (row) => row.source === "deezer" && row.trackId && row.artist && sameArtist(row.artist, name),
      );
      if (existing) {
        playable.push({
          source: "deezer",
          artist: existing.artist,
          album: existing.album,
          title: existing.title,
          url: existing.url,
          image: existing.image,
          trackId: existing.trackId,
        });
        deezerArtists.add(name);
        continue;
      }
      if (playable.filter((item) => item.source === "deezer").length >= 3) continue;
      for (const variant of variants(name)) {
        const item = await deezerFor(variant, context, styles);
        if (!item) continue;
        playable.push(item);
        deezerArtists.add(name);
        deezerAdded += 1;
        break;
      }
    }

    if (!playable.some((item) => item.source === "deezer")) {
      for (const person of fromTitle) {
        if (names.some((item) => sameArtist(item, person))) continue;
        if (playable.filter((item) => item.source === "deezer").length >= 3) break;
        for (const variant of variants(person)) {
          const item = await deezerFor(variant, context, styles);
          if (!item) continue;
          playable.push(item);
          deezerArtists.add(person);
          deezerAdded += 1;
          break;
        }
      }
    }

    const hasDeezer = (name: string) => [...deezerArtists].some((artist) => sameArtist(artist, name));
    const hasBandcampLink = (name: string) =>
      links.some((item) => item.source === "bandcamp" && item.artist && sameArtist(item.artist, name));

    for (const row of list) {
      if (row.source !== "bandcamp" || !row.url) continue;
      const artist = row.artist || "";
      if (artist && hasBandcampLink(artist)) continue;
      if (!artist && links.some((item) => item.source === "bandcamp" && item.url === row.url)) continue;
      links.push({ source: "bandcamp", artist: artist || null, url: row.url, type: "link" });
    }

    for (const row of list) {
      if (row.source !== "soundcloud" || !row.url) continue;
      const artist = row.artist || "";
      const covered = artist ? hasDeezer(artist) : playable.some((item) => item.source === "deezer");
      if (covered) {
        if (artist && hasBandcampLink(artist)) continue;
        if (links.some((item) => item.source === "soundcloud" && item.url === row.url)) continue;
        links.push({ source: "soundcloud", artist: artist || null, url: row.url, type: "link" });
        continue;
      }
      if (playable.some((item) => item.source === "soundcloud" && item.trackId === row.trackId)) continue;
      playable.push({
        source: "soundcloud",
        artist: row.artist,
        album: row.album,
        title: row.title,
        url: row.url,
        image: row.image,
        trackId: row.trackId,
        type: row.type,
      });
    }

    if (!playable.some((item) => item.source === "deezer" || item.source === "soundcloud")) {
      for (const row of list) {
        if (row.source !== "youtube" || !row.videoId) continue;
        playable.push({
          source: "youtube",
          artist: row.artist,
          title: row.title,
          url: row.url,
          image: row.image,
          videoId: row.videoId,
        });
      }
    }

    if (!playable.length) silent += 1;
    groups.push({ eventId: event.id, tracks: [...playable, ...links] });
    if ((index + 1) % 25 === 0 || index + 1 === targets.length) {
      log(`(${index + 1}/${targets.length}) ${deezerAdded} Deezer-spår, ${silent} utan spelbar låt`);
    }
  });

  const chunk = 12;
  for (let i = 0; i < groups.length; i += chunk) {
    await replaceTracksBatch(groups.slice(i, i + chunk));
    log(`DB: ${Math.min(i + chunk, groups.length)}/${groups.length} konserter uppdaterade`);
  }
  log(`Klart. ${deezerAdded} nya Deezer-spår, ${silent} konserter utan spelbar låt.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
