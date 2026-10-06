// Löptext som kommit in i versaler. Meningsform, med namn i versalgemen.

const SMALL = new Set([
  "och", "att", "som", "en", "ett", "den", "det", "de", "dem", "i", "på", "av", "till", "för",
  "med", "om", "vid", "från", "utan", "eller", "men", "varje", "inte", "har", "kan", "ska", "är",
  "the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "at", "by", "with", "from", "into",
]);

const ACRONYMS = new Set(["dj", "uk", "us", "eu", "ep", "lp", "cd", "mc", "tv", "vip"]);

const NAME_SPLIT = /\s*(?:\+|\/|&|,|;|\band\b|\boch\b|\bfeat\.?\b|\bft\.?\b)\s*/i;

export type ProseSource = {
  title?: string;
  venue?: string;
  place?: string;
  tracks?: { artist?: string | null }[];
};

function lettersOf(value: string): string[] {
  return value.match(/\p{L}/gu) || [];
}

function isUpper(ch: string): boolean {
  return ch === ch.toUpperCase() && ch !== ch.toLowerCase();
}

function isLower(ch: string): boolean {
  return ch === ch.toLowerCase() && ch !== ch.toUpperCase();
}

/** Hela texten är versal, och lång nog att vara en beskrivning. */
export function isShouting(value: string): boolean {
  const letters = lettersOf(value);
  return letters.length >= 8 && letters.every(isUpper);
}

/** Svenska citattecken: ”…” och apostrof ’. Raka tecken och engelskt “ byts ut. */
export function typographicQuotes(value: string): string {
  return String(value).replace(/[“„"]/g, "”").replace(/[‘']/g, "’");
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function coreWord(word: string): string {
  return word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").toLocaleLowerCase("sv");
}

function titleCaseWord(word: string): string {
  return word
    .split("/")
    .map((part) => part.replace(/\p{L}+/u, (token) => token.charAt(0).toLocaleUpperCase("sv") + token.slice(1).toLocaleLowerCase("sv")))
    .join("/");
}

/** Versalgemen: stor begynnelsebokstav, småord inne i frasen gemena. */
export function titleCasePhrase(phrase: string): string {
  let seen = false;
  return phrase.replace(/\p{L}+(?:\/\p{L}+)*/gu, (word) => {
    const cased = !seen || !SMALL.has(word.toLocaleLowerCase("sv")) ? titleCaseWord(word) : word.toLocaleLowerCase("sv");
    seen = true;
    return cased;
  });
}

function properPhrase(phrase: string): string {
  const letters = lettersOf(phrase);
  if (!letters.length) return phrase;
  if (letters.every(isUpper) || letters.every(isLower)) return titleCasePhrase(phrase.toLocaleLowerCase("sv"));
  return phrase;
}

function pushPhrase(out: string[], seen: Set<string>, phrase: string) {
  const clean = phrase.replace(/\s+/g, " ").trim();
  const key = clean.toLocaleLowerCase("sv");
  if (lettersOf(clean).length < 3 || SMALL.has(key) || seen.has(key)) return;
  seen.add(key);
  out.push(clean);
}

/** Namn att behålla: titelns delar, scen, plats och artister. */
export function proseNames(source?: ProseSource | null): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const raw = [
    source?.venue,
    source?.place,
    source?.title,
    ...(source?.tracks || []).map((track) => track.artist),
  ];
  for (const value of raw) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    pushPhrase(out, seen, text);
    const parts = text.split(NAME_SPLIT).map((part) => part.trim()).filter(Boolean);
    for (const part of parts) {
      pushPhrase(out, seen, part);
      const words = part.split(/\s+/);
      let run: string[] = [];
      const flush = () => {
        if (run.length >= 2) pushPhrase(out, seen, run.join(" "));
        else if (run.length === 1 && coreWord(run[0]).length >= 4) pushPhrase(out, seen, run[0]);
        run = [];
      };
      for (const word of words) {
        const core = coreWord(word);
        if (!core || SMALL.has(core)) flush();
        else run.push(word);
      }
      flush();
    }
  }
  out.sort((a, b) => b.length - a.length);
  return out;
}

function sentenceCase(text: string): string {
  const lower = text.toLocaleLowerCase("sv");
  return lower.replace(/\p{L}/u, (ch) => ch.toLocaleUpperCase("sv")).replace(/([.!?…]\s+)(\p{L})/gu, (_, lead: string, ch: string) => lead + ch.toLocaleUpperCase("sv"));
}

/**
 * Beskrivande text ska inte vara helt versal. Namn skrivs versalgement.
 * Text som redan blandar versaler och gemener lämnas orörd.
 */
export function displayProse(text: string, source?: ProseSource | string[] | null): string {
  const raw = typographicQuotes(String(text || "").replace(/\s+/g, " ").trim());
  if (!raw || !isShouting(raw)) return raw;
  const names = Array.isArray(source) ? source : proseNames(source);

  let out = sentenceCase(raw);
  out = out.replace(/[“"«”]([^“"«”»]+)[“"»”]/g, (match, inner: string) => {
    return match[0] + titleCasePhrase(inner) + match[match.length - 1];
  });
  out = out.replace(
    /\b(live|support|feat|ft)\s*:\s*([^\d☆]+?)(?=\s+\d|\s+(?:live|support|feat|ft)\s*:|\s*$)/gi,
    (_, label: string, name: string) => titleCaseWord(label) + ": " + titleCasePhrase(name.trim()),
  );
  out = out.replace(
    /(\d{1,2}\s*\/\s*\d{1,2})(\s*[–—-]\s*)([^\d☆]+?)(?=\s+\d|\s*$)/g,
    (_, date: string, dash: string, name: string) => date + dash + titleCasePhrase(name.trim()),
  );
  for (const name of names) {
    const proper = properPhrase(name);
    out = out.replace(new RegExp("(?<![\\p{L}\\p{N}])" + escapeRe(name) + "(?![\\p{L}\\p{N}])", "giu"), proper);
  }
  out = out.replace(/\p{L}+(?:\/\p{L}+)+/gu, (token) => titleCasePhrase(token));
  out = out.replace(/\p{L}+/gu, (word) => (ACRONYMS.has(word.toLocaleLowerCase("sv")) ? word.toLocaleUpperCase("sv") : word));
  return typographicQuotes(out);
}
