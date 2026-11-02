import assert from "node:assert/strict";
import { test } from "node:test";
import { bandcampNameScore } from "./bandcamp-match";
import { bandcampReleaseMatchesArtist, lookupBandcamp, releaseFromBandcampSearchRow } from "./bandcamp";

test("hela artistnamn krävs, med stöd för typografi och ensemblebeteckningar", () => {
  for (const [query, artist] of [
    ["Westlife", "Westlife Worship"],
    ["Mariam the Believer", "Mariam"],
    ["Bill Evans", "Bill Evans Tribute Trio"],
    ["Low", "Low Band"],
  ]) assert.equal(bandcampNameScore(query, artist), 0, `${query} / ${artist}`);
  for (const [query, artist] of [
    ["Mariam the Believer", "MARIAM THE BELIEVER"],
    ["The National", "National"],
    ["José González", "Jose Gonzalez"],
    ["Bill Evans", "Bill Evans Trio"],
  ]) assert.ok(bandcampNameScore(query, artist), `${query} / ${artist}`);
  assert.equal(bandcampReleaseMatchesArtist("Westlife", { artist: "Westlife", album: "More Bootlegs" }), false);
  assert.equal(bandcampReleaseMatchesArtist("Westlife", { artist: "Westlife", track: "My Love (Westlife Cover)" }), false);
  assert.equal(bandcampReleaseMatchesArtist("Westlife", { artist: "Westlife", album: "Coast to Coast" }), true);
  assert.ok(bandcampNameScore("Bill Evans", "Bill Evans") > bandcampNameScore("Bill Evans", "Bill Evans Trio"));
});

test("sökvägarna verifierar artisten och återanvänder söksvaret", async () => {
  const original = globalThis.fetch;
  const calls: any[] = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body));
    calls.push({ url: String(url), ...body });
    let result: any;
    if (String(url).includes("autocomplete_elastic")) {
      result = { auto: { results: body.search_text === "Westlife" ? [
        { type: "b", id: 1, name: "Westlife Worship" },
        { type: "a", id: 2, band_id: 1, band_name: "Westlife Worship" },
      ] : [{ type: "b", id: 3, name: "Mariam The Believer" }] } };
    } else if (String(url).includes("band_details")) {
      assert.equal(body.band_id, 3);
      result = { name: "Mariam The Believer", discography: [{ item_id: 4, item_type: "album", title: "The Wishing Well EP" }] };
    } else {
      result = { id: 4, title: "The Wishing Well EP", tracks: [{ title: "Becoming", track_id: 5, is_streamable: true, streaming_url: { "mp3-128": "https://example.com/audio" } }] };
    }
    return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
  };
  try {
    assert.equal(await lookupBandcamp("Westlife", new Map()), null);
    assert.ok(calls.every(call => call.url.includes("autocomplete_elastic")));
    calls.length = 0;
    const release = await lookupBandcamp("Mariam the Believer", new Map());
    assert.equal(release?.artist, "Mariam The Believer");
    assert.equal(release?.track, "Becoming");
    assert.equal(calls.filter(call => call.url.includes("autocomplete_elastic")).length, 1);
    calls.length = 0;
    await releaseFromBandcampSearchRow({ type: "t", id: 5, album_id: 4, band_id: 3 }, new Map());
    assert.equal(calls[0].tralbum_type, "t");
    assert.equal(calls[0].tralbum_id, 5);
  } finally {
    globalThis.fetch = original;
  }
});
