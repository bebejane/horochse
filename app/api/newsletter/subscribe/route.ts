import { NextResponse } from "next/server";

import {
  getNewsletterByEmail,
  insertNewsletter,
  parseVenueList,
  updateNewsletter,
} from "@/lib/db/newsletter";
import { mailConfigured } from "@/lib/mail";
import { sendNewsletterConfirmation } from "@/lib/newsletter/send";
import { createNewsletterToken } from "@/lib/newsletter/tokens";
import {
  newsletterEmail,
  newsletterFrequency,
  newsletterVenues,
} from "@/lib/newsletter/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 8;
const buckets = new Map<string, number[]>();

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  return (
    forwarded.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

function rateLimited(request: Request): boolean {
  const key = clientKey(request);
  const now = Date.now();
  const recent = (buckets.get(key) || []).filter((at) => now - at < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    buckets.set(key, recent);
    return true;
  }
  recent.push(now);
  buckets.set(key, recent);
  if (buckets.size > 5000) buckets.clear();
  return false;
}

function sameVenues(stored: string, next: string[]): boolean {
  const current = parseVenueList(stored);
  if (current.length !== next.length) return false;
  const set = new Set(current);
  return next.every((slug) => set.has(slug));
}

export async function POST(request: Request) {
  if (rateLimited(request)) {
    return NextResponse.json(
      { error: "För många försök. Vänta en stund och försök igen." },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Ogiltig förfrågan." }, { status: 400 });
  }

  // Honeypot: a real browser never fills this hidden field.
  if (String(body.website || "").trim()) {
    return NextResponse.json({ ok: true, status: "pending" });
  }

  const email = newsletterEmail(body.email);
  if (!email) {
    return NextResponse.json({ error: "Ange en giltig e-postadress." }, { status: 400 });
  }

  const venues = newsletterVenues(body.venues);
  if (!venues.length) {
    return NextResponse.json({ error: "Välj minst en scen." }, { status: 400 });
  }

  const frequency = newsletterFrequency(body.frequency);

  if (!mailConfigured()) {
    return NextResponse.json(
      { error: "E-post är inte konfigurerad just nu. Försök senare." },
      { status: 503 },
    );
  }

  const existing = await getNewsletterByEmail(email);

  if (existing) {
    if (existing.validated) {
      const unchanged =
        existing.frequency === frequency && sameVenues(existing.venues, venues);
      if (unchanged) {
        return NextResponse.json({ ok: true, status: "unchanged" });
      }
      await updateNewsletter(email, { venues, frequency });
      return NextResponse.json({ ok: true, status: "updated" });
    }

    const updated = await updateNewsletter(email, { venues, frequency });
    const sent = await sendNewsletterConfirmation(updated ?? existing);
    if (!sent) {
      return NextResponse.json(
        { error: "Kunde inte skicka bekräftelsemailet. Försök igen." },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, status: "pending" });
  }

  const subscriber = await insertNewsletter({
    email,
    venues,
    frequency,
    token: createNewsletterToken(),
  });
  const sent = await sendNewsletterConfirmation(subscriber);
  if (!sent) {
    return NextResponse.json(
      { error: "Kunde inte skicka bekräftelsemailet. Försök igen." },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, status: "pending" });
}
