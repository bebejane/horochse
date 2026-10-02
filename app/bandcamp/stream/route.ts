import { NextResponse } from "next/server";
import { pythonStream } from "@/lib/python-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const band = searchParams.get("band") || "";
  const album = searchParams.get("album") || "";
  const kind = searchParams.get("type") || "a";
  if (!/^\d+$/.test(band) || !/^\d+$/.test(album) || !["a", "t"].includes(kind)) {
    return NextResponse.json({ error: "Ogiltig förfrågan." }, { status: 400 });
  }
  const payload = await pythonStream(["bandcamp", band, album, kind]);
  if (!payload || payload.error || !payload.stream) {
    return NextResponse.json({ error: payload?.error || "Ingen stream hittades." }, { status: 404 });
  }
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
