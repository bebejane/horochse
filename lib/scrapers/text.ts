import { stripTags, shorten, unescape } from "./html";

// ---------------------------------------------------------------------------
// Name folding / matching
// ---------------------------------------------------------------------------

export const GENERIC_NAME_SUFFIX = new Set([
  "band", "trio", "quartet", "quintet", "ensemble", "orchestra",
  "group", "duo", "sextet", "septet", "octet", "project", "music",
]);

function eq(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

export function foldName(value: unknown): string {
  let text = String(value ?? "").normalize("NFKD");
  text = text.replace(/\p{M}+/gu, "");
  text = text.toLowerCase();
  text = text.replace(/[^a-z0-9]+/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

export function foldNameLetters(value: unknown): string {
  let text = String(value ?? "").normalize("NFC").toLowerCase();
  text = text.replace(/[^\p{L}\p{N}_]+/gu, " ");
  return text.replace(/\s+/g, " ").trim();
}

export function nameWords(value: unknown, marks = false): string[] {
  let words = (marks ? foldNameLetters(value) : foldName(value)).split(" ");
  if (words[0] === "the") words = words.slice(1);
  return words;
}

export function namesMatch(query: string, name: string, allowFolded = false): boolean {
  const qw = nameWords(query);
  const nw = nameWords(name);
  if (!qw.length || !nw.length) return false;
  const foldedEq = eq(qw, nw);
  const prefixQ =
    qw.length >= 2 && eq(qw, nw.slice(0, qw.length)) &&
    (nw.length === qw.length || GENERIC_NAME_SUFFIX.has(nw[nw.length - 1]));
  const prefixN = nw.length >= 2 && eq(nw, qw.slice(0, nw.length));
  if (!(foldedEq || prefixQ || prefixN)) return false;
  const qwd = nameWords(query, true);
  const nwd = nameWords(name, true);
  if (!qwd.length || !nwd.length) return false;
  if (eq(qwd, nwd)) return true;
  if (
    prefixQ && eq(qwd, nwd.slice(0, qwd.length)) &&
    (nwd.length === qwd.length || GENERIC_NAME_SUFFIX.has(nw[nw.length - 1]))
  ) {
    return true;
  }
  if (prefixN && eq(nwd, qwd.slice(0, nwd.length))) return true;
  return Boolean(allowFolded);
}

export function sameArtist(query: string, artist: string): boolean {
  if (namesMatch(query, artist) || namesMatch(artist, query)) return true;
  const q = foldName(query);
  const a = foldName(artist);
  if (!q || !a) return false;
  if (!(q === a || a.startsWith(q + " ") || q.startsWith(a + " "))) return false;
  const qd = nameWords(query, true);
  const ad = nameWords(artist, true);
  if (!qd.length || !ad.length) return false;
  const qs = qd.join(" ");
  const aS = ad.join(" ");
  return qs === aS || aS.startsWith(qs + " ") || qs.startsWith(aS + " ");
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

const CANCELLED_RE =
  /\b(installd[ae]?|installt|canceled|cancelled|cancellation|avlyst[ae]?|avlysning|aflyst[ae]?)\b/;

export function isCancelled(title: string, text = "", status = ""): boolean {
  const blob = foldName(title) + " " + foldName(text);
  if (CANCELLED_RE.test(blob)) return true;
  const st = foldName(status);
  return Boolean(st) && (st.includes("cancel") || st.includes("avlyst") || st.includes("installd") || st.includes("installt"));
}

export function isClubNight(title: string, text = ""): boolean {
  const t = foldName(title);
  const blob = t + " " + foldName(text);
  if (t === "club soul" || t === "klubbn") return true;
  if (/\bafter party\b|\befterfest\b/.test(blob)) return true;
  if (/\bkind people club\b/.test(t)) return true;
  if (/(?:^|\s)klubb(?:en|n)?(?:\s|$)/.test(t) && !t.includes("konsert")) return true;
  if (/^club\b/.test(t) && !t.includes("killers")) return true;
  return false;
}

export function isGenericEvent(title: string): boolean {
  const t = foldName(title);
  if (isClubNight(title)) return true;
  return /\bhyllnings/.test(t);
}

// ---------------------------------------------------------------------------
// Artist extraction
// ---------------------------------------------------------------------------

export function artistCandidates(title: string): string[] {
  let t = unescape(String(title || "")).replace(/\u00a0/g, " ");
  t = t.replace(/\s+/g, " ").replace(/[ !]+$/, "").replace(/^[ !]+/, "");
  t = t.split(/\s*\|\s*/)[0];
  t = t.replace(/\([^)]*\)/g, " ");
  t = t.replace(/^(releasekonsert|release party|album release party|konsert)\s*[-–—:]\s*/i, "");
  t = t.replace(/\s+((album\s+)?release party|en hyllningskonsert|hyllningskonsert)$/i, "");
  t = t.replace(/\s*["'“”‘’][^"'“”‘’]+["'“”‘’]/g, " ");
  t = t.replace(/\s+/g, " ").replace(/^[ \-–—:]+/, "").replace(/[ \-–—:]+$/, "");
  if (!t) return [];
  if (t.includes(":")) {
    const [left, right] = t.split(":", 2);
    if (left.split(" ").filter(Boolean).length > 0 && left.split(" ").filter(Boolean).length <= 4) {
      t = right.trim();
    }
  }
  const candidates: string[] = [];
  if (/\s[-–—]\s/.test(t)) {
    const parts = t.split(/\s[-–—]\s/);
    const left = (parts[0] || "").trim();
    let right = parts.slice(1).join(" ").trim();
    if (!right) right = "";
    const leftIsBill = /[&+]| and | och /.test(left);
    if (!leftIsBill && /^[A-ZÅÄÖ]/.test(right) && right.split(" ").filter(Boolean).length >= 1 && right.split(" ").filter(Boolean).length <= 3 && !right.toLowerCase().includes("party")) {
      candidates.push(right);
    }
    candidates.push(...left.split(/\s*(?:&|\+| and | och )\s*/));
    if (!candidates.includes(left)) candidates.push(left);
  } else {
    candidates.push(...t.split(/\s*(?:&|\+| and | och )\s*/));
    if (!candidates.includes(t)) candidates.push(t);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of candidates) {
    const name = raw.replace(/\s+/g, " ").replace(/^[ \-–—:,.]+/, "").replace(/[ \-–—:,.]+$/, "");
    const key = foldName(name);
    if (!name || seen.has(key) || key.length < 4) continue;
    if (/^(club|live|night|party|konsert|festival|the)$/.test(key)) continue;
    const words = key.split(" ").filter((w) => !["the", "a", "an", "di"].includes(w));
    if (words.length < 2 && foldName(title).length > key.length + 3) continue;
    seen.add(key);
    out.push(name);
  }
  return out.slice(0, 4);
}

export function soundcloudQueries(title: string): string[] {
  const names = artistCandidates(title);
  if (!names.length) return [];
  const full = names[names.length - 1];
  const queries = [full];
  const foldedFull = foldName(full);
  for (const name of names.slice(0, -1)) {
    const key = foldName(name);
    if (!key || key === foldedFull) continue;
    const words = key.split(" ");
    if (words.length < 2) continue;
    if (foldedFull.startsWith(key) || GENERIC_NAME_SUFFIX.has(words[words.length - 1])) {
      queries.push(name);
    }
  }
  return queries;
}

const BILL_SPLIT_RE =
  /\s*(?:&amp;|&|\+|,|;|\/\/|\band\b|\boch\b|\bfeat\.?\b|\bft\.?\b|\bx\b)\s*/i;

export const BILL_SKIP = new Set([
  "friends", "friend", "company", "guest", "guests", "special guests", "maybe more",
  "more", "support", "band", "live", "night", "party", "konsert", "festival", "the",
  "plus", "magic", "surprise", "piano", "pianist", "gitarr", "guitar", "guitarist",
  "bass", "bas", "drums", "drum", "trummor", "saxofon", "sax", "saxophone",
  "elektronik", "electronics", "percussion", "sang", "vocals", "voice", "cello",
  "violin", "viola", "flojt", "flute", "trumpet", "trombone", "keyboard", "synth",
  "host", "hosts",
]);

const PERSON_NAME_PUNCT = " -–—:,.!?;)(\"'\\/";
const PERSON_NAME_FILLERS = new Set([
  "pretty", "gonna", "currently", "coming", "welcome", "australian",
  "experimental", "divides", "korsat", "varandras", "vagar", "festivaler",
]);

// Trailing instrument/role abbreviations that venues append to performer names,
// e.g. "Jonas Bäckman dr", "Elvira Lundstedt voc", "Jan Adefelt kb".
const INSTRUMENT_SUFFIX = new Set([
  "dr", "drm", "tr", "trp", "tp", "sax", "as", "ts", "bs", "p", "pf", "kb",
  "b", "bs", "cb", "g", "gt", "git", "voc", "vox", "vocals", "voc", "sång",
  "fl", "cl", "tp", "tbn", "tb", "perc", "percussion", "comp", "arr", "ldr",
]);

function stripChars(value: string, chars: string): string {
  const set = new Set(chars);
  let start = 0;
  let end = value.length;
  while (start < end && set.has(value[start])) start++;
  while (end > start && set.has(value[end - 1])) end--;
  return value.slice(start, end);
}

/** Remove a trailing instrument/role token ("Jonas Bäckman dr" -> "Jonas Bäckman"). */
function stripInstrumentSuffix(value: string): string {
  const parts = value.split(" ");
  if (parts.length < 2) return value;
  const last = parts[parts.length - 1].toLowerCase().replace(/\.$/, "");
  if (INSTRUMENT_SUFFIX.has(last)) return parts.slice(0, -1).join(" ");
  return value;
}

export function cleanPersonName(name: string): string {
  let text = unescape(String(name || "")).replace(/\u00a0/g, " ");
  text = text.replace(/\\+/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  text = stripChars(text, PERSON_NAME_PUNCT);
  return stripInstrumentSuffix(text);
}

export function isPersonName(name: string, allowSingle = true): boolean {
  const cleaned = cleanPersonName(name);
  const key = foldName(cleaned);
  const words = key.split(" ");
  if (!cleaned || !words.length) return false;
  if (words.length > 6 || (!allowSingle && words.length < 2)) return false;
  if (BILL_SKIP.has(key) || BILL_SKIP.has(words[0])) return false;
  if (/[?]|https?:\/\/|\d{4,}/.test(cleaned)) return false;
  if (words.some((word) => PERSON_NAME_FILLERS.has(word))) return false;
  return true;
}

export function splitTitlePeople(title: string): string[] {
  let t = unescape(String(title || "")).replace(/\u00a0/g, " ");
  t = t.replace(/\s+/g, " ").replace(/^[ !.?)]+/, "").replace(/[ !.?)]+$/, "");
  t = t.split(/\s*\|\s*/)[0];
  t = t.replace(/\([^)]*\)/g, " ");
  t = t.replace(/^(releasekonsert|release party|album release party|konsert|yeah\.+we got the)\s*[-–—:]?\s*/i, "");
  t = t.replace(/\s*["'“”‘’][^"'“”‘’]+["'“”‘’]/g, " ");
  t = t.replace(/\s*:\s*support\b.*$/i, "");
  t = t.replace(/^support:\s*/i, "");
  t = t.replace(/\s+/g, " ").replace(/^[ \-–—:]+/, "").replace(/[ \-–—:]+$/, "");
  if (t.includes(":")) {
    const [left, right] = t.split(":", 2);
    if (BILL_SPLIT_RE.test(right) && !BILL_SPLIT_RE.test(left)) t = right.trim();
  }
  if (/\s[-–—]\s/.test(t)) {
    const parts = t.split(/\s[-–—]\s/);
    const left = (parts[0] || "").trim();
    if (BILL_SPLIT_RE.test(left) || /[&+]|\band\b|\boch\b/i.test(left)) t = left;
  }
  if (!BILL_SPLIT_RE.test(t)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of t.split(BILL_SPLIT_RE)) {
    let name = raw.replace(/^(the\s+)?(and\s+)?/i, "");
    name = name.replace(/^support:\s*/i, "");
    if (/\bwith\b/i.test(name) && name.split(" ").filter(Boolean).length > 3) {
      name = name.split(/\bwith\b/i).pop()!.trim();
    }
    name = cleanPersonName(name);
    const key = foldName(name);
    if (!name || seen.has(key) || key.length < 3 || !isPersonName(name)) continue;
    if (/\b(friends|company|guest|guests|maybe more|coming back|make magic)\b/.test(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out.length >= 2 ? out : [];
}

export function enrichPeople(people: string[], text: string): string[] {
  const extras: string[] = [];
  const seenExtra = new Set<string>();
  for (const raw of [...artistCandidates(text), ...splitTitlePeople(text)]) {
    const name = cleanPersonName(raw);
    const key = foldName(name);
    if (!key || seenExtra.has(key) || !isPersonName(name, false)) continue;
    seenExtra.add(key);
    extras.push(name);
  }
  const used = new Set<string>();
  const out: string[] = [];
  for (const name of people) {
    let picked = cleanPersonName(name) || name;
    for (const extra of extras) {
      const ek = foldName(extra);
      if (used.has(ek)) continue;
      if (sameArtist(picked, extra)) {
        if (ek.length > foldName(picked).length) picked = extra;
        used.add(ek);
        break;
      }
    }
    out.push(picked);
  }
  return out;
}

export function billArtists(title: string, text = ""): string[] {
  const people = splitTitlePeople(title);
  if (people.length >= 2) return enrichPeople(people, text);
  return [];
}

// ---------------------------------------------------------------------------
// Title normalization
// ---------------------------------------------------------------------------

export const TITLE_NAME_SKIP = new Set([
  "and", "och", "the", "to", "for", "of", "a", "an", "at", "in", "on", "with",
  "from", "maybe", "more", "coming", "you", "all", "out", "there", "people",
  "welcome", "lets", "give", "big", "warm", "plus", "live", "night", "party",
  "band", "trio", "duo", "dj", "support", "album", "release", "concert", "konsert",
]);

const LARRY_CORNER_RE = /larrys?\s*corner/i;

function isUpper(ch: string): boolean {
  return ch === ch.toUpperCase() && ch !== ch.toLowerCase();
}

function isLower(ch: string): boolean {
  return ch === ch.toLowerCase() && ch !== ch.toUpperCase();
}

export function titleLetterMode(title: string): "none" | "upper" | "lower" | "mixed" {
  const letters = Array.from(title).filter((ch) => /\p{L}/u.test(ch));
  if (!letters.length) return "none";
  if (letters.every(isUpper)) return "upper";
  if (letters.every(isLower)) return "lower";
  return "mixed";
}

export function toTitleCase(title: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < title.length) {
    const ch = title[i];
    if (/\p{L}/u.test(ch)) {
      let j = i + 1;
      while (j < title.length && /\p{L}/u.test(title[j])) j++;
      const word = title.slice(i, j);
      out.push(word[0].toUpperCase() + word.slice(1).toLowerCase());
      i = j;
      continue;
    }
    out.push(ch);
    i++;
  }
  return out.join("");
}

export function capitalizeFirstLetter(title: string): string {
  const match = /\p{L}/u.exec(title);
  if (!match || match.index == null) return title;
  const i = match.index;
  return title.slice(0, i) + title[i].toUpperCase() + title.slice(i + 1);
}

export function properPersonName(name: string): string {
  const text = String(name || "").trim();
  if (!text) return "";
  return titleLetterMode(text) === "lower" ? toTitleCase(text) : text;
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function applyTitleNames(
  title: string,
  event: { venue?: string; tracks?: { artist?: string }[] } | null | undefined,
  withWords: boolean,
): string {
  const venue = event?.venue || "";
  if (venue && /larry/i.test(venue)) title = title.replace(LARRY_CORNER_RE, venue);
  if (venue) title = title.replace(new RegExp(escapeRe(venue), "gi"), venue);
  if (!withWords) return title;
  const parts: string[] = [];
  for (const track of event?.tracks || []) {
    const name = properPersonName(track.artist || "");
    if (!name) continue;
    parts.push(name);
    parts.push(...name.split(" "));
  }
  parts.sort((a, b) => b.length - a.length);
  const seen = new Set<string>();
  for (const part of parts) {
    const clean = part.replace(/^[,.!:;]+/, "").replace(/[,.!:;]+$/, "");
    const key = foldName(clean);
    if (clean.length < 3 || TITLE_NAME_SKIP.has(key) || seen.has(key)) continue;
    seen.add(key);
    title = title.replace(new RegExp(escapeRe(clean), "gi"), clean);
  }
  return title;
}

export function displayTitle(event: { title?: string; venue?: string; tracks?: { artist?: string }[] } | null | undefined): string {
  let title = String(event?.title || "").replace(/\s+/g, " ").trim();
  if (!title) return "";
  const mode = titleLetterMode(title);
  if (mode === "upper") title = toTitleCase(title);
  else if (mode === "lower") title = applyTitleNames(title, event, true);
  else title = applyTitleNames(title, event, false);
  return capitalizeFirstLetter(title);
}

export function normalizeEventTitles(events: { title?: string; venue?: string; tracks?: { artist?: string }[] }[]): void {
  for (const event of events) event.title = displayTitle(event);
}

export function uniqueFolded(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = foldName(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function eventLookupClues(text: string, person = ""): {
  albums: string[];
  labels: string[];
  phrases: string[];
} {
  const raw = unescape(String(text || "")).replace(/\u00a0/g, " ");
  const personFold = foldName(person);
  const albums: string[] = [];
  for (const match of raw.matchAll(/["“”«»‘’]([^"“”«»‘’]{2,80})["“”«»‘’]/g)) {
    const quote = match[1].replace(/\s+/g, " ").trim();
    if (foldName(quote) && foldName(quote) !== personFold) albums.push(quote);
  }
  const labels: string[] = [];
  for (const match of raw.matchAll(
    /\b(?:skivbolaget|skivbolag|record label|label(?:et)?)\s+([A-ZÅÄÖ][\p{L}\p{N}_&/'’-]+)/giu,
  )) {
    const lab = match[1].replace(/[.,;:)]+$/, "");
    if (foldName(lab) && foldName(lab) !== personFold) labels.push(lab);
  }
  const phrases: string[] = [];
  for (const match of raw.matchAll(/\b([A-ZÅÄÖ][\p{L}\p{N}_’'-]+(?:\s+[A-ZÅÄÖ][\p{L}\p{N}_’'-]+)+)\b/gu)) {
    const folded = foldName(match[1]);
    if (!folded || folded === personFold) continue;
    phrases.push(match[1]);
  }
  return {
    albums: uniqueFolded(albums),
    labels: uniqueFolded(labels),
    phrases: uniqueFolded(phrases),
  };
}

export function cluesCacheKey(clues: { albums?: string[]; labels?: string[] }): string {
  const parts = [...(clues.albums || []), ...(clues.labels || [])];
  return parts.map((part) => foldName(part)).join("\t");
}

export function albumTitleScore(hint: string, name: string): number {
  const h = foldName(hint);
  const n = foldName(name);
  if (!h || !n || h.length < 4) return 0;
  if (h === n) return 3;
  if (n.startsWith(h + " ") || h.startsWith(n + " ")) return 2;
  if (h.includes(n) || n.includes(h)) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Venue-specific title/description helpers (kept here from core.py)
// ---------------------------------------------------------------------------

export function isRonnellsMusic(title: string, timeRaw: string): boolean {
  const skip = /bokrelease|föredrag|nya bok|en ny bok|gästar med en ny bok/i.test(title);
  const music =
    /konsert|jazz|band|live|kvartett|kvintett|trio|duo|festival|organ|orgel|musik|vinyl|skiv|improvis|frim|piano|gitarr|saxofon|kör|choir|sång|selam|orkester|ensemble/i.test(title);
  if (skip && !music) return false;
  if (timeRaw.toLowerCase().includes("insläpp")) return true;
  return Boolean(music);
}

export function isLarrysMusic(title: string): boolean {
  const t = title.toLowerCase();
  return !/\bweek of art\b|\bart show\b|\bart by\b|\butst[aä]llning\b|\bexhibition\b/.test(t);
}

export function extractSlaktTime(text: string): string {
  const patterns = [
    /Live från:\s*(?:ca\s*)?(?:kl\.?\s*)?(\d{1,2})[.:](\d{2})/i,
    /Insläpp:\s*(?:ca\s*)?(?:kl\.?\s*)?(\d{1,2})[.:](\d{2})/i,
    /Dörr(?:arna|ar)?\s*(?:öppnar)?\s*(?:kl\.?\s*)?(\d{1,2})[.:](\d{2})/i,
    /öppnar\s+kl\.?\s*(\d{1,2})[.:](\d{2})/i,
    /kl\.?\s*(\d{1,2})[.:](\d{2})/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
  }
  return "";
}

export function extractSlaktText(rawHtml: string): string {
  const text = stripTags(rawHtml);
  const skip = /^(band|datum|insläpp|live från|lokal|åldersgräns|dörrar|doors)\b/i;
  const parts = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const kept: string[] = [];
  for (const part of parts) {
    let chunk = part;
    chunk = chunk.replace(/(Band|Datum|Insläpp|Live från|Lokal|Åldersgräns)\s*:\s*[^\n]+/gi, " ");
    chunk = chunk.replace(/\s+/g, " ").replace(/^[ \-–—]+/, "").replace(/[ \-–—]+$/, "");
    if (!chunk || skip.test(chunk) || chunk.length < 40) continue;
    kept.push(chunk);
    if (kept.reduce((sum, value) => sum + value.length, 0) > 80) break;
  }
  return shorten(kept.length ? kept.join(" ") : text);
}
