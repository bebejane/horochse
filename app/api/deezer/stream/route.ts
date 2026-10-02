import { NextResponse } from "next/server";

import { deezerTrackById } from "@/lib/scrapers/deezer";

// Resolve a Deezer preview for playback. The preview URL returned by the
// search/product endpoints is short-lived and signed, so the stream is resolved
// fresh per play rather than stored.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const id = (new URL(request.url).searchParams.get("id") || "").trim();
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Ogiltig förfrågan." }, { status: 400 });
  }
  const match = await deezerTrackById(Number(id));
  if (!match?.preview) {
    return NextResponse.json({ error: "Ingen förhandslyssning." }, { status: 404 });
  }
  return NextResponse.json(
    {
      // One shape as the other stream routes: `stream` is what the player plays.
      artist: match.artist,
      album: match.album,
      track: match.title,
      url: match.url,
      image: match.image,
      stream: match.preview,
      preview: true,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
