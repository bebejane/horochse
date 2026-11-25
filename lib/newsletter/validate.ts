// Validation shared by the subscribe and preferences routes.

import { normalizeFrequency, type NewsletterFrequency } from "@/lib/db/newsletter";
import { VENUES } from "@/lib/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Returns the normalized address, or null when it is not usable. */
export function newsletterEmail(value: unknown): string | null {
  const email = String(value || "").trim().toLowerCase();
  if (!email || email.length > 254 || /\s/.test(email)) return null;
  return EMAIL_RE.test(email) ? email : null;
}

/** Keep only known venue slugs, deduplicated and in the caller's order. */
export function newsletterVenues(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map((slug) => slug.trim());
  const known = new Set<string>(VENUES.map((venue) => venue.slug));
  const seen = new Set<string>();
  const venues: string[] = [];
  for (const item of raw) {
    const slug = String(item || "").trim();
    if (!slug || !known.has(slug) || seen.has(slug)) continue;
    seen.add(slug);
    venues.push(slug);
  }
  return venues;
}

export function newsletterFrequency(value: unknown): NewsletterFrequency {
  return normalizeFrequency(value);
}
