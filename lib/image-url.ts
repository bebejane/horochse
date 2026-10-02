// Client-safe helpers for the image proxy. No Node-only imports here so this
// can be imported from components; the server core lives in `image-proxy.ts`.

/** Allowed source hosts. Keep in sync with the server proxy. */
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

export const IMAGE_WIDTHS = [200, 400, 800, 1200] as const;
export const IMAGE_DEFAULT_WIDTH = 400;

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

function snap(value: number): number {
  return IMAGE_WIDTHS.reduce(
    (best, w) => (Math.abs(w - value) < Math.abs(best - value) ? w : best),
    IMAGE_DEFAULT_WIDTH,
  );
}

/** Build a proxy URL for a card; falls back to the original when not allowed. */
export function imageProxyUrl(
  src: string | undefined | null,
  width = IMAGE_DEFAULT_WIDTH,
): string {
  if (!src || !isAllowedImageHost(src)) return src || "";
  return `/api/image?url=${encodeURIComponent(src)}&w=${snap(width)}`;
}
