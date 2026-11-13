const EXCLUDED_CHUNK = 3200;
const EXCLUDED_MAX_AGE = 60 * 60 * 24 * 400;

function excludedCookieName(cookie: string, index: number): string {
  return index === 0 ? cookie : `${cookie}.${index}`;
}

function readExcludedChunks(cookie: string): { index: number; value: string }[] {
  return document.cookie.split("; ").flatMap((row) => {
    const eq = row.indexOf("=");
    if (eq < 0) return [];
    const name = row.slice(0, eq);
    const value = row.slice(eq + 1);
    if (name === cookie) return [{ index: 0, value }];
    if (!name.startsWith(`${cookie}.`)) return [];
    const index = Number(name.slice(cookie.length + 1));
    if (!Number.isInteger(index) || index < 1) return [];
    return [{ index, value }];
  });
}

export function readExcluded(cookie: string): Set<string> {
  const chunks = readExcludedChunks(cookie).sort((a, b) => a.index - b.index);
  if (!chunks.length) return new Set();
  try {
    const ids = JSON.parse(chunks.map((chunk) => decodeURIComponent(chunk.value)).join(""));
    if (!Array.isArray(ids)) return new Set();
    return new Set(ids.filter((id) => typeof id === "string" && id));
  } catch {
    return new Set();
  }
}

export function writeExcluded(cookie: string, ids: Set<string>) {
  const parts: string[] = [];
  let part = "";
  for (const character of JSON.stringify([...ids])) {
    const encoded = encodeURIComponent(character);
    if (part.length + encoded.length > EXCLUDED_CHUNK) {
      parts.push(part);
      part = "";
    }
    part += encoded;
  }
  if (part) parts.push(part);
  const keep = new Set(parts.map((_, index) => index));
  for (const chunk of readExcludedChunks(cookie)) {
    if (keep.has(chunk.index)) continue;
    document.cookie = `${excludedCookieName(cookie, chunk.index)}=; Path=/; Max-Age=0; SameSite=Lax`;
  }
  parts.forEach((part, index) => {
    document.cookie = `${excludedCookieName(cookie, index)}=${part}; Path=/; Max-Age=${EXCLUDED_MAX_AGE}; SameSite=Lax`;
  });
}

