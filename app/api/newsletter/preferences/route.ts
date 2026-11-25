import { NextResponse } from "next/server";

import { getNewsletterByToken, updateNewsletterByToken } from "@/lib/db/newsletter";
import {
  newsletterFrequency,
  newsletterVenues,
} from "@/lib/newsletter/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const token = String(body?.token || "").trim();
  if (!token) {
    return NextResponse.json({ error: "Länken saknar token." }, { status: 400 });
  }

  const subscriber = await getNewsletterByToken(token);
  if (!subscriber) {
    return NextResponse.json({ error: "Länken är ogiltig." }, { status: 404 });
  }

  const venues = newsletterVenues(body?.venues);
  if (!venues.length) {
    return NextResponse.json({ error: "Välj minst en scen." }, { status: 400 });
  }

  const updated = await updateNewsletterByToken(token, {
    venues,
    frequency: newsletterFrequency(body?.frequency),
  });
  if (!updated) {
    return NextResponse.json({ error: "Kunde inte spara." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    validated: updated.validated,
    frequency: updated.frequency,
    venues: updated.venues,
  });
}
