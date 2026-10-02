// Server-only signing for proxied image URLs.
//
// Only URLs produced here can be proxied by /api/image: the route verifies an
// HMAC over `url|w`, so an arbitrary `?url=` (SSRF, resource abuse) is rejected
// even for allowed hosts. The secret never reaches the client — signing happens
// where the payload is built (`lib/db/queries.ts`), and the client just renders
// the resulting URL.

import { createHmac, timingSafeEqual } from "node:crypto";

import { IMAGE_WIDTHS, IMAGE_DEFAULT_WIDTH } from "./image-url";

const SECRET =
  process.env.IMAGE_SECRET ||
  process.env.CRON_SECRET ||
  // Dev-only fallback so local runs work without extra setup.
  "dev-insecure-image-secret";

export function snapImageWidth(width: number): number {
  return IMAGE_WIDTHS.reduce(
    (best, w) => (Math.abs(w - width) < Math.abs(best - width) ? w : best),
    IMAGE_DEFAULT_WIDTH,
  );
}

function sign(url: string, width: number): string {
  return createHmac("sha256", SECRET).update(`${url}|${width}`).digest("base64url").slice(0, 27);
}

/** Signed proxy URL for a source image, or "" when there is no image. */
export function signedImageUrl(src: string | undefined | null, width?: number): string {
  const url = (src || "").trim();
  if (!url) return "";
  const w = snapImageWidth(width ?? IMAGE_DEFAULT_WIDTH);
  const sig = sign(url, w);
  return `/api/image?url=${encodeURIComponent(url)}&w=${w}&sig=${sig}`;
}

/** Constant-time verification of a signed proxy request. */
export function verifyImageSignature(url: string, width: number, sig: string): boolean {
  if (!sig) return false;
  const expected = sign(url, width);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}
