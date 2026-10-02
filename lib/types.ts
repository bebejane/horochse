export type VenueSlug =
  | "debaser"
  | "nalen"
  | "fallan"
  | "slakthusen"
  | "kollektivetlivet"
  | "sodrateatern"
  | "berns"
  | "cirkus"
  | "fryshuset"
  | "kulturhuset"
  | "hartwig"
  | "annexet"
  | "hovet"
  | "aviciiarena"
  | "trearena"
  | "strawberryarena"
  | "konserthuset"
  | "berwaldhallen"
  | "fasching"
  | "stampen"
  | "glennmillercafe"
  | "kungcarls"
  | "engelen"
  | "petsoundsbar"
  | "reimersholme"
  | "riche"
  | "landet"
  | "encore"
  | "bioaspen"
  | "scalateatern"
  | "gotalejon"
  | "bagarmossen"
  | "kmh"
  | "ericericsonhallen"
  | "gronalund"
  | "fylkingen"
  | "ronnells"
  | "larryscorner";

export type TrackSource = "bandcamp" | "soundcloud" | "youtube" | "deezer";

export type Track = {
  source?: TrackSource | string;
  artist?: string;
  album?: string;
  track?: string;
  url?: string;
  image?: string;
  band_id?: number;
  album_id?: number;
  track_id?: number;
  /** YouTube video id (embedded player). */
  video_id?: string;
  /** Deezer tracks are 30 s previews, never full tracks. */
  preview?: boolean;
  type?: string;
};

export type ConcertEvent = {
  id: string;
  venue: string;
  venue_slug: VenueSlug | string;
  title: string;
  date: string;
  time: string;
  datetime?: string;
  image?: string;
  text?: string;
  url: string;
  place?: string;
  tracks?: Track[];
  bandcamp?: Track;
  soundcloud?: Track;
  youtube?: Track;
  deezer?: Track;
  /** Spotify link (artist/album). Shown as a "listen" link — not streamable. */
  spotify?: string;
  times?: string[];
};

export type EventsPayload = {
  updated?: string;
  range?: { from?: string; to?: string } | null;
  errors?: Record<string, string>;
  events?: ConcertEvent[];
};

export type ViewMode = "list" | "calendar";
export type CalStyle = "full" | "simple";
export type ThemeMode = "dark" | "light";
export type ListDensity = "more" | "less";
export type FilterMode = "all" | "mine";

export type PlaylistItem = {
  event: ConcertEvent;
  track: Track;
  i: number;
  key: string;
};

export type StreamPayload = {
  artist?: string;
  album?: string;
  track?: string;
  url?: string;
  image?: string;
  stream?: string;
  widget?: boolean;
  /** Deezer-only: this stream is a 30 s preview, not the full track. */
  preview?: boolean;
  error?: string;
};

export const VENUES: { slug: VenueSlug; name: string }[] = [
  { slug: "debaser", name: "Debaser" },
  { slug: "nalen", name: "Nalen" },
  { slug: "fallan", name: "Fållan" },
  { slug: "slakthusen", name: "Slakthusen" },
  { slug: "kollektivetlivet", name: "Kollektivet Livet" },
  { slug: "sodrateatern", name: "Södra Teatern" },
  { slug: "berns", name: "Berns" },
  { slug: "cirkus", name: "Cirkus" },
  { slug: "fryshuset", name: "Fryshuset" },
  { slug: "kulturhuset", name: "Kulturhuset" },
  { slug: "hartwig", name: "Hartwig" },
  { slug: "annexet", name: "Annexet" },
  { slug: "hovet", name: "Hovet" },
  { slug: "aviciiarena", name: "Avicii Arena" },
  { slug: "trearena", name: "3Arena" },
  { slug: "strawberryarena", name: "Strawberry Arena" },
  { slug: "konserthuset", name: "Konserthuset" },
  { slug: "berwaldhallen", name: "Berwaldhallen" },
  { slug: "fasching", name: "Fasching" },
  { slug: "stampen", name: "Stampen" },
  { slug: "glennmillercafe", name: "Glenn Miller Café" },
  { slug: "kungcarls", name: "Kung Carls" },
  { slug: "engelen", name: "Engelen" },
  { slug: "petsoundsbar", name: "Pet Sounds Bar" },
  { slug: "reimersholme", name: "Reimersholme Hotel" },
  { slug: "riche", name: "Riche" },
  { slug: "landet", name: "Landet" },
  { slug: "encore", name: "Encore" },
  { slug: "bioaspen", name: "Bio Aspen" },
  { slug: "scalateatern", name: "Scalateatern" },
  { slug: "gotalejon", name: "Göta Lejon" },
  { slug: "bagarmossen", name: "Bagarmossens FH" },
  { slug: "kmh", name: "KMH" },
  { slug: "ericericsonhallen", name: "Eric Ericsonhallen" },
  { slug: "gronalund", name: "Gröna Lund" },
  { slug: "fylkingen", name: "Fylkingen" },
  { slug: "ronnells", name: "Rönnells" },
  { slug: "larryscorner", name: "Larry's Corner" },
];

export const WEEKDAYS = ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"];
export const MONTHS = [
  "januari", "februari", "mars", "april", "maj", "juni",
  "juli", "augusti", "september", "oktober", "november", "december",
];
