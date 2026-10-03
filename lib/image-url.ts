// Allowed source hosts for remote images.
//
// `next.config.ts` turns this list into `images.remotePatterns`, so `next/image`
// will only optimize posters from these origins. Add a host here whenever a new
// venue is added; a missing host makes that venue's posters fail to optimize and
// fall back to the placeholder in the UI.

/** Allowed source hosts. Keep in sync with the venues. */
export const IMAGE_ALLOWED_HOSTS = [
  "fasching.se",
  "admin.debaser.se",
  "static.wixstatic.com",
  "kulturhusetstadsteatern.se",
  "a.storyblok.com",
  "slakthusen.se",
  "eventadmin.stockholmlive.com",
  "cdn-production.berwaldhallen.se",
  "ik.imagekit.io",
  "reimersholmehotel.se",
  "fylkingen.se",
  "cdn.prod.website-files.com",
  "larryscorner.nu",
  "kollektivetlivet.se",
  "riche.se",
  "s1.ticketm.net",
  "encoresundbyberg.se",
  "ronnells.se",
  "stampen.se",
  "konserthuset.se",
  "dynamicmedia.livenationinternational.com",
  "kmh.se",
  "landet.nu",
  "berns.se",
];

/**
 * Whether `rawUrl` points at an allowlisted host. Tolerates a `www.` prefix and
 * subdomains (matching the `remotePatterns` generated in `next.config.ts`), and
 * returns false for relative or malformed URLs. `next/image` throws when a
 * remote src is not configured, so callers must check this before rendering an
 * optimized image.
 */
export function isAllowedImageHost(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).host.replace(/^www\./, "").toLowerCase();
    return IMAGE_ALLOWED_HOSTS.some(
      (allowed) => host === allowed || host.endsWith("." + allowed),
    );
  } catch {
    return false;
  }
}
