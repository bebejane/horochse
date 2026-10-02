import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { httpBuffer } from "@/lib/scrapers/http";
import {
  IMAGE_WIDTHS,
  IMAGE_DEFAULT_WIDTH,
  isAllowedImageHost,
} from "@/lib/image-url";

/**
 * Image proxy core.
 *
 * Venue pages link full-resolution originals (some 16 MB) that we render as
 * small thumbnails, so this fetches once and re-encodes to the requested width.
 *
 * Caching layers:
 *  - Browser: long immutable Cache-Control (caller sets it).
 *  - CDN (Vercel): caches the route response; the function only runs on a miss.
 *  - Disk: `.cache/images` — persists in dev so repeats are instant; on Vercel
 *    the FS is ephemeral, so it is a harmless no-op in production.
 */

const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

/** Bump when resize logic changes to invalidate cached variants. */
const CACHE_VERSION = "v1";

const CACHE_DIR = path.join(process.cwd(), ".cache", "images");

export { isAllowedImageHost };

export function normalizeWidth(value: string | null): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return IMAGE_DEFAULT_WIDTH;
  return IMAGE_WIDTHS.reduce(
    (best, w) => (Math.abs(w - n) < Math.abs(best - n) ? w : best),
    IMAGE_DEFAULT_WIDTH,
  );
}

function cacheKey(url: string, width: number, format: string): string {
  return createHash("sha1")
    .update(`${CACHE_VERSION}:${url}:${width}:${format}`)
    .digest("hex");
}

/** In-process dedupe so concurrent misses for the same key resize once. */
const inflight = new Map<string, Promise<Buffer>>();

export type Proxied = { body: Buffer; contentType: string } | { redirect: string };

async function readCache(file: string): Promise<Buffer | null> {
  try {
    return await readFile(file);
  } catch {
    return null;
  }
}

async function writeCache(file: string, body: Buffer): Promise<void> {
  try {
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = file + "." + process.pid + ".tmp";
    await writeFile(tmp, body);
    await rename(tmp, file);
  } catch {
    /* cache write is best-effort */
  }
}

async function resize(
  url: string,
  width: number,
  accept: string,
): Promise<Buffer> {
  const input = await httpBuffer(url, { timeoutMs: 20000 });
  if (input.byteLength > MAX_SOURCE_BYTES) throw new Error("image too large");
  const pipeline = sharp(input).rotate().resize({ width, withoutEnlargement: true });
  if (accept.includes("image/avif")) return pipeline.avif({ quality: 62 }).toBuffer();
  if (accept.includes("image/webp")) return pipeline.webp({ quality: 74 }).toBuffer();
  return pipeline.jpeg({ quality: 78, mozjpeg: true }).toBuffer();
}

/**
 * Fetch + resize with browser/CDN/disk caching. Returns resized bytes, or a
 * redirect to the original if the fetch fails (never breaks the page).
 */
export async function proxyImage(url: string, width: number, accept: string): Promise<Proxied> {
  if (!isAllowedImageHost(url)) throw new Error("host not allowed");

  const format = accept.includes("image/avif")
    ? "avif"
    : accept.includes("image/webp")
      ? "webp"
      : "jpeg";
  const key = cacheKey(url, width, format);
  const file = path.join(CACHE_DIR, format, String(width), key);
  const contentType = `image/${format}`;

  const cached = await readCache(file);
  if (cached) return { body: cached, contentType };

  const existing = inflight.get(key);
  if (existing) {
    try {
      return { body: await existing, contentType };
    } catch {
      return { redirect: url };
    }
  }

  const job = resize(url, width, accept);
  inflight.set(key, job);
  try {
    const body = await job;
    await writeCache(file, body);
    return { body, contentType };
  } catch {
    return { redirect: url };
  } finally {
    inflight.delete(key);
  }
}

/** Delete the disk cache (dev helper). */
export async function clearImageCache(): Promise<void> {
  try {
    await rm(CACHE_DIR, { recursive: true, force: true });
  } catch {
    /* nothing to clear */
  }
}
