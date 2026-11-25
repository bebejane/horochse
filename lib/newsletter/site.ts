// Absolute URLs used in emails. `NEXT_PUBLIC_SITE_URL` lets a local run send
// links to http://localhost:3000; production falls back to the canonical
// www address when the variable is unset. Posters use
// `NEWSLETTER_IMAGE_BASE_URL` (default: the canonical origin) so a local email
// can keep localhost links while still loading images from the public site.
// `new URL` serializes a unicode host as punycode, which is safer inside mail
// clients.

import { isAllowedImageHost } from "@/lib/image-url";
import { findVenue, siteOrigin } from "@/lib/seo";
import type { ConcertEvent } from "@/lib/types";

function normalizeOrigin(value: string): string | null {
  const raw = /^https?:\/\//i.test(value)
    ? value
    : /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(value)
      ? `http://${value}`
      : `https://${value}`;
  try {
    const url = new URL(raw);
    if (url.protocol === "http:" || url.protocol === "https:") return url.origin;
  } catch {
    /* invalid value: fall back to the canonical origin */
  }
  return null;
}

function emailBaseUrl(): string {
  return normalizeOrigin((process.env.NEXT_PUBLIC_SITE_URL || "").trim()) ?? siteOrigin();
}

/** Public base for poster images. Server-only; not exposed to the client bundle. */
export function newsletterImageBaseUrl(): string {
  return (
    normalizeOrigin((process.env.NEWSLETTER_IMAGE_BASE_URL || "").trim()) ??
    siteOrigin()
  );
}

export function siteUrl(path = "/"): string {
  return new URL(path, emailBaseUrl()).toString();
}

export function newsletterManageUrl(token: string): string {
  return siteUrl(`/prenumerera/${encodeURIComponent(token)}`);
}

export function newsletterVerifyUrl(token: string): string {
  return siteUrl(`/api/newsletter/verify?token=${encodeURIComponent(token)}`);
}

/** Human-facing unsubscribe page (GET is safe; the page posts the removal). */
export function newsletterUnsubscribeUrl(token: string): string {
  return siteUrl(`/prenumerera/${encodeURIComponent(token)}/avsluta`);
}

/** One-click endpoint for the List-Unsubscribe header and the manage page. */
export function newsletterUnsubscribeApiUrl(token: string): string {
  return siteUrl(`/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`);
}

/** Deep link to the event card on its venue page. `EventCard` carries the id. */
export function eventSiteUrl(event: ConcertEvent): string {
  const slug = String(event.venue_slug || "");
  const path = findVenue(slug) ? `/${slug}` : "/";
  return siteUrl(`${path}#${encodeURIComponent(event.id)}`);
}

export function eventIcsUrl(event: ConcertEvent): string {
  return siteUrl(`/kalender/${encodeURIComponent(event.id)}.ics`);
}

/** Vercel Image Optimization URL for a poster. Returns "" for hosts that are
 *  not allowlisted, so the email never points at an image the optimizer will
 *  reject. Uses the public image host, not the (possibly localhost) link host. */
export function optimizedPosterUrl(raw: string | undefined, width = 400): string {
  const src = String(raw || "").trim();
  if (!src || !isAllowedImageHost(src)) return "";
  const query = new URLSearchParams({
    url: src,
    w: String(width),
    q: "75",
  });
  return new URL(`/_next/image?${query.toString()}`, newsletterImageBaseUrl()).toString();
}
