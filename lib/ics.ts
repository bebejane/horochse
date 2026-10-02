import type { ConcertEvent, Track } from "./types";

const VENUE_ADDRESSES: Record<string, string> = {
  debaser: "Hornstulls Strand 4, 117 39 Stockholm",
  nalen: "Regeringsgatan 74, 111 39 Stockholm",
  fallan: "Hallgränd 19, 121 62 Johanneshov",
  slakthusen: "Slakthusområdet, Johanneshov",
  kollektivetlivet: "Stadsgårdsterminalen, 116 45 Stockholm",
  sodrateatern: "Mosebacke torg 1, 116 46 Stockholm",
  berns: "Berzelii Park, 111 47 Stockholm",
  cirkus: "Djurgårdsslätten 43-45, 115 21 Stockholm",
  fryshuset: "Mårtensdal 2, 120 79 Stockholm",
  kulturhuset: "Sergels torg, 111 57 Stockholm",
  hartwig: "Sankt Paulsgatan 39, 118 48 Stockholm",
  annexet: "Globentorget, 121 77 Johanneshov",
  hovet: "Globentorget 2, 121 77 Johanneshov",
  aviciiarena: "Globentorget 2, 121 77 Johanneshov",
  trearena: "Arenaslingan 14, 121 77 Johanneshov",
  strawberryarena: "Råsta strandväg 1, 169 79 Solna",
  konserthuset: "Hötorget 8, 111 57 Stockholm",
  berwaldhallen: "Dag Hammarskjölds väg 3, 105 10 Stockholm",
  fasching: "Kungsgatan 63, 111 22 Stockholm",
  stampen: "Stora Nygatan 5, 111 27 Stockholm",
  glennmillercafe: "Brunnsgatan 21A, 111 38 Stockholm",
  kungcarls: "Stockholm",
  engelen: "Kornhamnstorg 59B, 111 27 Stockholm",
  petsoundsbar: "Skånegatan 59, 116 37 Stockholm",
  reimersholme: "Reimersholmsgatan 5, 117 40 Stockholm",
  riche: "Birger Jarlsgatan 4, 114 34 Stockholm",
  landet: "LM Ericssons väg 27, 126 25 Hägersten",
  encore: "Landsvägen 49, 172 65 Sundbyberg",
  bioaspen: "Hantverkargatan 2, 112 21 Stockholm",
  scalateatern: "Makalösavägen 4, 111 47 Stockholm",
  gotalejon: "Götgatan 55, 118 26 Stockholm",
  bagarmossen: "Lillåvägen 45, 128 45 Bagarmossen",
  kmh: "Valhallavägen 105, 115 51 Stockholm",
  ericericsonhallen: "Skeppsholmen, 111 49 Stockholm",
  gronalund: "Lilla Allmänna gränd 9, 115 21 Stockholm",
  fylkingen: "Torkel Knutssonsgatan 2, 118 25 Stockholm",
  ronnells: "Birger Jarlsgatan 32, 114 29 Stockholm",
  larryscorner: "Grindsgatan 35, 118 57 Stockholm",
};

function icsEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n/g, "\\n")
    .replace(/\n/g, "\\n");
}

function icsFold(line: string): string {
  const encoder = new TextEncoder();
  let data = encoder.encode(line);
  if (data.length <= 75) return line;
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let limit = 75;
  while (data.length) {
    let chunk = data.slice(0, limit);
    while (chunk.length && (chunk[chunk.length - 1] & 0xc0) === 0x80) {
      chunk = chunk.slice(0, -1);
    }
    if (!chunk.length) chunk = data.slice(0, limit);
    parts.push(decoder.decode(chunk));
    data = data.slice(chunk.length);
    limit = 74;
  }
  return parts.join("\r\n ");
}

function eventStart(event: ConcertEvent): Date {
  const raw = event.datetime;
  if (raw) {
    const dt = new Date(raw);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  const dateStr = event.date || "";
  const timeStr = event.time || "19:00";
  const [hour, minute] = (timeStr + ":00").split(":");
  return new Date(
    Number(dateStr.slice(0, 4)),
    Number(dateStr.slice(5, 7)) - 1,
    Number(dateStr.slice(8, 10)),
    Number(hour),
    Number(minute),
    0,
  );
}

function icsUtc(dt: Date): string {
  return dt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function eventLocation(event: ConcertEvent): string {
  const parts: string[] = [];
  const place = (event.place || "").trim();
  const venue = (event.venue || "").trim();
  if (place) parts.push(place);
  if (venue && venue !== place) parts.push(venue);
  const address = VENUE_ADDRESSES[event.venue_slug || ""];
  if (address) parts.push(address);
  return parts.join(", ");
}

function eventDescription(event: ConcertEvent): string {
  const lines: string[] = [];
  const text = (event.text || "").trim();
  if (text) {
    lines.push(text);
    lines.push("");
  }
  const venue = (event.venue || "").trim();
  const place = (event.place || "").trim();
  if (venue && place && place !== venue) lines.push(`${venue} · ${place}`);
  else if (venue) lines.push(venue);
  if (event.time) lines.push("Kl. " + event.time);
  const url = (event.url || "").trim();
  if (url) {
    if (lines.length) lines.push("");
    lines.push("Till eventet:");
    lines.push(url);
  }
  let tracks: Track[] = event.tracks || [];
  if (!tracks.length) {
    if (event.bandcamp) tracks = [{ ...event.bandcamp, source: "bandcamp" }];
    else if (event.soundcloud) tracks = [{ ...event.soundcloud, source: "soundcloud" }];
  }
  for (const item of tracks) {
    const source = item.source === "bandcamp" ? "Bandcamp" : "SoundCloud";
    const extra = [item.artist, item.album || item.track].filter(Boolean).join(" — ");
    const itemUrl = (item.url || "").trim();
    if (!itemUrl && !extra) continue;
    lines.push("");
    lines.push(source + (extra ? ": " + extra : ""));
    if (itemUrl) lines.push(itemUrl);
  }
  return lines.join("\n").trim();
}

export function eventIcs(event: ConcertEvent): string {
  const start = eventStart(event);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const now = new Date();
  const uid = `${event.id}@konserter`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Konserter Stockholm//SV",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${icsUtc(now)}`,
    `DTSTART:${icsUtc(start)}`,
    `DTEND:${icsUtc(end)}`,
    "STATUS:CONFIRMED",
    `SUMMARY:${icsEscape(event.title || "Konsert")}`,
  ];
  const location = eventLocation(event);
  if (location) lines.push("LOCATION:" + icsEscape(location));
  const description = eventDescription(event);
  if (description) lines.push("DESCRIPTION:" + icsEscape(description));
  const url = (event.url || "").trim();
  if (url) lines.push("URL:" + icsEscape(url));
  const image = (event.image || "").trim();
  if (image) lines.push("ATTACH:" + icsEscape(image));
  const cats = ["Konsert"];
  if (event.venue) cats.push(event.venue);
  lines.push("CATEGORIES:" + cats.map(icsEscape).join(","));
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}
