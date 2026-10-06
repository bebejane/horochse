import { NextResponse } from "next/server";

import { adminPassword, isAdmin } from "@/lib/admin/auth";
import { loadPayload } from "@/lib/db/queries";
import { MONTHS, WEEKDAYS } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dateLabel(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  const weekday = WEEKDAYS[date.getUTCDay()] || "";
  const name = weekday ? weekday.charAt(0).toUpperCase() + weekday.slice(1) : "";
  return `${name} ${day} ${MONTHS[month - 1] || ""}`.trim();
}

export async function GET() {
  if (!adminPassword()) {
    return NextResponse.json({ error: "Admin är inte konfigurerad." }, { status: 503 });
  }
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Logga in." }, { status: 401 });
  }
  try {
    const payload = await loadPayload();
    const events = (payload.events ?? []).map((event) => ({
      id: event.id,
      title: event.title,
      venue: event.venue,
      place: event.place || "",
      date: dateLabel(event.date),
      time: event.time || "",
      tracks: (event.tracks ?? []).map((track, position) => ({
        position,
        source: track.source || "",
        artist: track.artist || "",
        title: track.track || "",
        url: track.url || "",
        bandId: track.band_id ?? null,
        albumId: track.album_id ?? null,
        trackId: track.track_id ?? null,
        videoId: track.video_id ?? null,
        type: track.type ?? null,
      })),
    }));
    return NextResponse.json({ events }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunde inte hämta listan." },
      { status: 500 },
    );
  }
}
