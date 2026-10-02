import he from "he";

import { httpRequest, UA } from "./http";

/** Python `html.unescape`. */
export function unescape(value: unknown): string {
  return he.decode(String(value ?? ""));
}

/** Python `helpers.fold`: unescape + collapse whitespace + trim. */
export function fold(value: unknown): string {
  return unescape(String(value ?? "")).replace(/\s+/g, " ").trim();
}

export function stripTags(raw: unknown): string {
  let text = String(raw ?? "");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n");
  text = text.replace(/<[^>]+>/g, " ");
  text = unescape(text);
  text = text.replace(/\u00a0/g, " ");
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n+/g, "\n");
  return text.trim();
}

export function shorten(text: unknown, limit = 220): string {
  let value = String(text ?? "").replace(/\s+/g, " ").trim();
  if (value.length <= limit) return value;
  let cut = value.slice(0, limit + 1);
  if (cut.includes(" ")) cut = cut.slice(0, cut.lastIndexOf(" "));
  return cut.replace(/[.,;: ]+$/, "") + "…";
}

export function pickSrcset(srcset: string): string {
  let best = "";
  let bestW = -1;
  for (const part of String(srcset || "").split(",")) {
    const bits = part.trim().split(/\s+/);
    let url = unescape((bits[0] || "").trim());
    if (url.startsWith("//")) url = "https:" + url;
    if (!url.startsWith("http") || url.includes("{image}")) continue;
    if (/\.(svg)(?:$|\?)/i.test(url)) continue;
    let width = 0;
    if (bits.length === 2 && bits[1].endsWith("w")) {
      width = Number.parseInt(bits[1].slice(0, -1), 10) || 0;
    }
    const score = width || 1;
    const target = width ? Math.abs(score - 800) : 10_000;
    const current = bestW > 0 ? Math.abs(bestW - 800) : 20_000;
    if (!best || target < current) {
      best = url.split(" ")[0];
      bestW = width || 1;
    }
  }
  return best;
}

/** Python `helpers.pick_image(*values)`: first usable absolute http image URL. */
export function pickImage(...values: unknown[]): string {
  for (const value of values) {
    let url: string;
    if (Array.isArray(value)) {
      url = pickImage(...value);
    } else if (value && typeof value === "object") {
      const node = value as Record<string, unknown>;
      url = pickImage(node.url, node.contentUrl, node.src);
    } else {
      const raw = unescape(String(value ?? "")).trim();
      if (raw.includes(",") && raw.includes(" ") && /\s\d+w\b/.test(raw)) {
        url = pickSrcset(raw);
      } else {
        url = raw;
      }
    }
    if (url.startsWith("//")) url = "https:" + url;
    if (
      url.startsWith("http") &&
      !url.includes("{image}") &&
      !/\.(svg)(?:$|\?)/i.test(url) &&
      !/facebook\.com\/tr\b|google-analytics|doubleclick|\/pixel\./i.test(url)
    ) {
      return url.split(" ")[0];
    }
  }
  return "";
}

export function ogImage(page: string): string {
  for (const pattern of [
    /<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::url)?["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
  ]) {
    const match = pattern.exec(page || "");
    if (match) {
      const url = pickImage(match[1]);
      if (url) return url;
    }
  }
  return "";
}

export function ogDescription(page: string): string {
  for (const pattern of [
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
    /<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']+)/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:description["']/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
  ]) {
    const match = pattern.exec(page || "");
    if (match) {
      const text = fold(unescape(match[1]));
      if (text.length >= 24) return text;
    }
  }
  return "";
}

export async function wpFeaturedUrl(origin: string, mediaId: unknown): Promise<string> {
  const mid = Number.parseInt(String(mediaId ?? 0), 10);
  if (!Number.isFinite(mid) || !mid) return "";
  try {
    const raw = await httpRequest(origin.replace(/\/+$/, "") + `/wp-json/wp/v2/media/${mid}`);
    const data = JSON.parse(raw) as Record<string, unknown>;
    return pickImage(data.source_url);
  } catch {
    return "";
  }
}

/** Python `core.larger_image`: strip WordPress -WxH suffix. */
export function largerImage(url: string): string {
  return String(url || "").replace(/-\d+x\d+(?=\.(?:jpe?g|png|webp|gif))/i, "");
}
