import { NextResponse } from "next/server";

import { adminPassword, isAdmin } from "@/lib/admin/auth";
import { addEventTrack, AdminTrackError, removeEventTrack, replaceEventTrack } from "@/lib/admin/tracks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!adminPassword()) {
    return NextResponse.json({ error: "Admin är inte konfigurerad." }, { status: 503 });
  }
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Logga in." }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const action = body?.action;
  const eventId = typeof body?.eventId === "string" ? body.eventId : "";
  const position = Number(body?.position);
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!/^[a-z0-9-]+$/.test(eventId)) {
    return NextResponse.json({ error: "Ogiltig konsert." }, { status: 400 });
  }
  try {
    const tracks =
      action === "remove"
        ? await removeEventTrack(eventId, position)
        : action === "add"
          ? await addEventTrack(eventId, url)
          : action === "replace"
            ? await replaceEventTrack(eventId, position, url)
            : null;
    if (!tracks) return NextResponse.json({ error: "Ogiltig åtgärd." }, { status: 400 });
    return NextResponse.json({ tracks }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const status = err instanceof AdminTrackError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Kunde inte spara.";
    return NextResponse.json({ error: message }, { status });
  }
}
