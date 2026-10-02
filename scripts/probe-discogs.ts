// Read-only Discogs coverage probe.
//
// Answers, across the whole current event set, whether Discogs is worth wiring
// in as a track source:
//   1. how many artists resolve to an exact Discogs artist entity
//   2. how many of those have a recent release carrying a YouTube `videos[]`
//   3. how many of those videos pass the embed + duration filter
//
// No writes. Uses the current `tracks` data only to split artists into
// "already has a track" and "has none", so we can see whether Discogs adds
// anything the Bandcamp/SoundCloud path missed.
//
// Run: node --env-file=.env --import tsx scripts/probe-discogs.ts
// Flags: --limit <n>   cap the artist count (for a quick smoke run)
//        --json        emit machine-readable JSON

import {
  DISCOGS_TOKEN,
  discogsArtistReleases,
  discogsArtistSearch,
  discogsVideosFor,
  pickDiscogsVideo,
  type DiscogsVideo,
} from "./discogs";
const argv = process.argv.slice(2);
const argValue = (name: string): string | null => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] ?? null : null;
};

async function main(): Promise<void> {
  const limit = Number(argValue("--limit") || 0) || 0;
  const asJson = argv.includes("--json");

  const { loadPayload } = await import("../lib/db/queries");
  const payload = await loadPayload();
  const events = payload.events || [];

  // Unique artist names, tagged with whether the event already has a track.
  const seen = new Map<string, { name: string; hadTrack: boolean }>();
  for (const event of events) {
    for (const track of event.tracks || []) {
      const name = (track.artist || "").trim();
      if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), { name, hadTrack: true });
    }
  }
  const withTracks = seen.size;
  // Artists the event pipeline tried but produced no track for are not recorded
  // anywhere, so the "no track" side is approximated by event titles that ended
  // up trackless.
  const trackless = events.filter((e) => !(e.tracks || []).length);

  let artists = [...seen.values()];
  if (limit) artists = artists.slice(0, limit);

  const stats = {
    events: events.length,
    artistsWithTracks: withTracks,
    tracklessEvents: trackless.length,
    probed: artists.length,
    resolvedExactArtist: 0,
    withRecentRelease: 0,
    withVideos: 0,
    videosEmbeddable: 0,
    chosen: 0,
  };
  const rows: any[] = [];

  console.log(
    `Discogs-probe: ${events.length} event, ${withTracks} artister med spår, ${trackless.length} spårlösa event` +
      `${limit ? ` (begränsad till ${limit})` : ""}` +
      `${DISCOGS_TOKEN ? " [token]" : " [anonym, 25/min]"}`,
  );

  for (const [i, artist] of artists.entries()) {
    const row: any = { artist: artist.name };
    try {
      const hit = await discogsArtistSearch(artist.name);
      if (!hit) {
        row.result = "no-artist";
        rows.push(row);
        continue;
      }
      stats.resolvedExactArtist += 1;
      row.discogsId = hit.id;
      row.discogsName = hit.title;

      const releases = await discogsArtistReleases(hit.id, 5);
      if (!releases.length) {
        row.result = "no-releases";
        rows.push(row);
        continue;
      }
      stats.withRecentRelease += 1;

      let bestVideo: DiscogsVideo | null = null;
      let bestRelease: any = null;
      let videoCount = 0;
      for (const rel of releases.slice(0, 3)) {
        const videos = await discogsVideosFor(rel);
        videoCount += videos.length;
        for (const video of videos) {
          const picked = pickDiscogsVideo(video);
          if (!picked) continue;
          stats.videosEmbeddable += 1;
          if (!bestVideo) {
            bestVideo = picked;
            bestRelease = { id: rel.id, title: rel.title, year: rel.year, type: rel.type };
          }
        }
        if (bestVideo) break;
      }
      row.videoCount = videoCount;
      if (bestVideo) {
        stats.withVideos += 1;
        stats.chosen += 1;
        row.result = "video";
        row.video = bestVideo.uri;
        row.videoTitle = bestVideo.title;
        row.release = bestRelease;
      } else {
        row.result = "no-video";
      }
    } catch (err) {
      row.result = "error";
      row.error = String(err);
    }
    rows.push(row);
    if (!asJson) {
      const tag = row.result.padEnd(12);
      const extra = row.videoTitle ? ` → ${row.videoTitle}` : row.discogsName && !row.video ? ` (${row.discogsName})` : "";
      console.log(`  ${String(i + 1).padStart(3)} ${tag} ${artist.name}${extra}`);
    }
  }

  if (asJson) {
    console.log(JSON.stringify({ stats, rows }, null, 2));
    return;
  }
  console.log("\n=== sammanfattning ===");
  for (const [k, v] of Object.entries(stats)) console.log(`  ${k}: ${v}`);
  const pct = (n: number) => `${((n / Math.max(1, stats.probed)) * 100).toFixed(0)}%`;
  console.log(`\n  artist uppslagen:   ${stats.resolvedExactArtist}/${stats.probed} (${pct(stats.resolvedExactArtist)})`);
  console.log(`  med video:          ${stats.withVideos}/${stats.probed} (${pct(stats.withVideos)})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
