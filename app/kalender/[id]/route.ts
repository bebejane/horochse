import { NextResponse } from "next/server";
import { eventIcs } from "@/lib/ics";
import { findEvent } from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const eventId = id.replace(/\.ics$/i, "");
  const event = await findEvent(eventId);
  if (!event) {
    return new NextResponse("Evenemanget hittades inte.", { status: 404 });
  }
  const body = eventIcs(event);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${eventId}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
