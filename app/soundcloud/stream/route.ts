import { NextResponse } from "next/server";
import { pythonStream } from "@/lib/python-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") || "";
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Ogiltig förfrågan." }, { status: 400 });
  }
  const payload = await pythonStream(["soundcloud", id]);
  if (!payload || payload.error || !(payload.stream || payload.widget)) {
    return NextResponse.json({ error: payload?.error || "Ingen stream hittades." }, { status: 404 });
  }
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
