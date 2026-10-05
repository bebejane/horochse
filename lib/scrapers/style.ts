import { foldName } from "./text";

/**
 * A venue's usual music, used when several artists share a name.
 * Description text wins over the venue when it names a style itself.
 */
export type StyleId =
  | "jazz"
  | "rock"
  | "electronic"
  | "hiphop"
  | "classical"
  | "experimental"
  | "folk";

export type StyleHint = {
  wanted: StyleId[];
  /** True when the event text itself names a style, not only the venue. */
  explicit: boolean;
};

const VENUE_STYLES: Record<string, StyleId[]> = {
  fasching: ["jazz"],
  stampen: ["jazz", "folk"],
  glennmillercafe: ["jazz"],
  debaser: ["rock"],
  engelen: ["rock", "folk"],
  petsoundsbar: ["rock"],
  kollektivetlivet: ["electronic"],
  slakthusen: ["electronic"],
  fylkingen: ["experimental", "electronic"],
  konserthuset: ["classical"],
  berwaldhallen: ["classical"],
  ericericsonhallen: ["classical"],
};

const TAG_WORDS: Record<StyleId, string[]> = {
  jazz: ["jazz", "bebop", "swing", "bop", "fusion"],
  rock: ["rock", "punk", "indie", "metal", "garage", "grunge", "alternative"],
  electronic: ["electronic", "house", "techno", "edm", "trance", "dance"],
  hiphop: ["hip hop", "hiphop", "rap", "grime", "trap"],
  classical: ["classical", "orchestra", "chamber"],
  experimental: ["experimental", "noise", "avant"],
  folk: ["folk", "blues", "country", "americana", "singer songwriter"],
};

/** Styles that almost never share a bill. A match on the wanted style still wins. */
const CONFLICTS: Record<StyleId, StyleId[]> = {
  jazz: ["hiphop", "electronic"],
  rock: ["hiphop", "classical"],
  electronic: ["classical", "jazz"],
  hiphop: ["jazz", "classical"],
  classical: ["hiphop", "electronic", "rock"],
  experimental: ["hiphop"],
  folk: ["hiphop", "electronic"],
};

const TEXT_RULES: { style: StyleId; pattern: RegExp }[] = [
  { style: "jazz", pattern: /jazz|bebop|swing\b/i },
  { style: "rock", pattern: /\brock\b|punk|hårdrock|hard rock|\bmetal\b|\bindie\b/i },
  { style: "electronic", pattern: /techno|\bhouse\b|elektronisk|electronic|\bedm\b|trance/i },
  { style: "hiphop", pattern: /\brap\b|hip[\s-]?hop|grime|\btrap\b/i },
  { style: "classical", pattern: /klassisk|classical|orkester|orchestra|symfoni|kammarmusik/i },
  { style: "experimental", pattern: /experimentell|experimental|\bnoise\b|avant-?garde/i },
  { style: "folk", pattern: /\bblues\b|\bfolk\b|\bvisa\b|\bcountry\b|americana/i },
];

const PLACE_WORDS = [
  "london",
  "stockholm",
  "goteborg",
  "malmo",
  "oslo",
  "berlin",
  "brooklyn",
  "england",
  "sverige",
  "kopenhamn",
  "copenhagen",
  "manchester",
  "glasgow",
  "dublin",
  "paris",
];

function uniqueStyles(styles: StyleId[]): StyleId[] {
  const seen = new Set<StyleId>();
  const out: StyleId[] = [];
  for (const style of styles) {
    if (seen.has(style)) continue;
    seen.add(style);
    out.push(style);
  }
  return out;
}

export function stylesInText(text: string): StyleId[] {
  const found: StyleId[] = [];
  for (const rule of TEXT_RULES) {
    if (rule.pattern.test(text)) found.push(rule.style);
  }
  return uniqueStyles(found);
}

export function stylesFromTags(genre: string, tags: string[] = []): StyleId[] {
  const blob = foldName([genre, ...tags].filter(Boolean).join(" "));
  if (!blob) return [];
  const padded = ` ${blob} `;
  const found: StyleId[] = [];
  for (const style of Object.keys(TAG_WORDS) as StyleId[]) {
    for (const word of TAG_WORDS[style]) {
      const term = foldName(word);
      if (term && padded.includes(` ${term} `)) {
        found.push(style);
        break;
      }
    }
  }
  return uniqueStyles(found);
}

export function eventStyles(venueSlug: string, text: string): StyleHint {
  const fromText = stylesInText(text);
  if (fromText.length) return { wanted: fromText, explicit: true };
  return { wanted: VENUE_STYLES[venueSlug] || [], explicit: false };
}

/** Suffix for artist-cache keys. Empty when nothing is known, so old keys still hit. */
export function styleKey(hint: StyleHint): string {
  if (!hint.wanted.length) return "";
  return "\t" + hint.wanted.join(",");
}

/**
 * Positive when the candidate's tags fit the event, negative when they clash.
 * 0 when either side has no style to compare.
 */
export function styleAlignment(genre: string, tags: string[] | undefined, hint: StyleHint): number {
  return alignmentOf(stylesFromTags(genre, tags || []), hint);
}

export function alignmentOf(candidate: StyleId[], hint: StyleHint): number {
  if (!hint.wanted.length || !candidate.length) return 0;
  const fit = hint.wanted.some((wanted) => candidate.includes(wanted));
  const conflict = hint.wanted.some((wanted) =>
    candidate.some((style) => CONFLICTS[wanted].includes(style)),
  );
  if (fit && !conflict) return 40;
  if (fit && conflict) return 10;
  if (conflict) return hint.explicit ? -80 : -40;
  return 0;
}

/** Event text naming a place that also shows up on the candidate (Londonbandet → London). */
export function placeScore(blob: string, context: string): number {
  const hay = foldName(blob);
  const ctx = foldName(context);
  if (!hay || !ctx) return 0;
  let score = 0;
  for (const place of PLACE_WORDS) {
    if (ctx.includes(place) && hay.includes(place)) score += 20;
  }
  return score;
}
