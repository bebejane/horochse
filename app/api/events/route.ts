import { NextResponse } from "next/server";

import { loadPayload } from "@/lib/db/queries";

// Reads the scraped event feed from Turso. The client component fetches this
// instead of a static public/data/events.json.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await loadPayload();
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
