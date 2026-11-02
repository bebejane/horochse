import { GENERIC_NAME_SUFFIX, nameWords } from "./text";

/** Bandcamp kräver hela artistnamn; prefix kan tillhöra en annan artist. */
export function bandcampNameScore(query: string, artist: string): number {
  const q = nameWords(query);
  const a = nameWords(artist);
  if (!q.length || !a.length) return 0;
  if (q.join(" ") === a.join(" ")) {
    return nameWords(query, true).join(" ") === nameWords(artist, true).join(" ") ? 100 : 90;
  }
  // Tillåt ensemblebeteckningar för personnamn, aldrig fria namnprefix.
  const stem = (words: string[]) => {
    const result = [...words];
    while (result.length > 2 && GENERIC_NAME_SUFFIX.has(result[result.length - 1])) result.pop();
    return result;
  };
  const qs = stem(q);
  const as = stem(a);
  return qs.length >= 2 && qs.join(" ") === as.join(" ") ? 70 : 0;
}

export const BANDCAMP_CACHE_VERSION = "bc2:";
