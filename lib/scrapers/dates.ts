import { DateTime } from "luxon";

import { fold } from "./html";

export const TZ = "Europe/Stockholm";
export const WEEKS = 5;
export const WEEK_DAYS = WEEKS * 7;

export const MONTHS_SV: Record<string, number> = {
  januari: 1,
  februari: 2,
  mars: 3,
  april: 4,
  maj: 5,
  juni: 6,
  juli: 7,
  augusti: 8,
  september: 9,
  oktober: 10,
  november: 11,
  december: 12,
};

export const MONTHS_EN: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

export const MONTHS_SV_SHORT: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, maj: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dec: 12,
};

export const MONTHS_EN_SHORT: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export function nowSthlm(): DateTime {
  return DateTime.now().setZone(TZ);
}

export function weekMonday(day: DateTime): DateTime {
  const d = day.setZone(TZ).startOf("day");
  return d.minus({ days: d.weekday - 1 });
}

export function weekSunday(day: DateTime): DateTime {
  return weekMonday(day).plus({ days: 6 }).endOf("day");
}

export function weekBounds(today?: DateTime): [DateTime, DateTime] {
  const base = (today ?? nowSthlm()).setZone(TZ).startOf("day");
  const start = weekMonday(base);
  const end = weekSunday(start.plus({ weeks: WEEKS - 1 }));
  return [start, end];
}

export function iso(dt: DateTime): string {
  return dt.toISO({ suppressMilliseconds: true }) ?? "";
}

export function isoDate(dt: DateTime): string {
  return dt.toFormat("yyyy-MM-dd");
}

export function isoTime(dt: DateTime): string {
  return dt.toFormat("HH:mm");
}

/** Python `core.in_range`: compares calendar dates only. */
export function inRange(day: DateTime, start: DateTime, end: DateTime): boolean {
  const d = day.toISODate() ?? "";
  const s = start.toISODate() ?? "";
  const e = end.toISODate() ?? "";
  return s <= d && d <= e;
}

export function localDatetime(dateStr: string, timeStr: string): DateTime {
  const [hour, minute] = (timeStr || "20:00").split(":").slice(0, 2);
  return DateTime.fromObject(
    {
      year: Number(dateStr.slice(0, 4)),
      month: Number(dateStr.slice(5, 7)),
      day: Number(dateStr.slice(8, 10)),
      hour: Number(hour),
      minute: Number(minute),
    },
    { zone: TZ },
  );
}

/** Python `helpers.parse_dt`. */
export function parseDt(raw: string): DateTime | null {
  let value = String(raw || "").trim();
  if (!value) return null;
  value = value.replace("Z", "+00:00");
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value)) value = value.replace(" ", "T");
  const hasZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value);
  let dt = DateTime.fromISO(value, hasZone ? { setZone: true } : { zone: TZ });
  if (!dt.isValid) {
    const match = /(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(value);
    if (!match) return null;
    dt = DateTime.fromISO(match[1] + "T" + match[2], { zone: TZ });
  }
  if (!dt.isValid) return null;
  return dt.setZone(TZ);
}

export function parseEnDate(text: string): DateTime | null {
  const match = /(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})/.exec(text);
  if (!match) return null;
  const month = MONTHS_EN[match[2].toLowerCase()];
  if (!month) return null;
  return DateTime.fromObject(
    { year: Number(match[3]), month, day: Number(match[1]) },
    { zone: TZ },
  );
}

export function parseSvFullDate(text: string): DateTime | null {
  const match = /(\d{1,2})\s+([a-zåäö]+)\s+(20\d{2})/.exec(text.toLowerCase());
  if (!match) return null;
  const month = MONTHS_SV[match[2]];
  if (!month) return null;
  return DateTime.fromObject(
    { year: Number(match[3]), month, day: Number(match[1]) },
    { zone: TZ },
  );
}

/** Python `helpers.parse_sv_when`. */
export function parseSvWhen(text: string, year?: number): DateTime | null {
  const t = fold(text);
  const months = Object.keys(MONTHS_SV).join("|");
  let match = new RegExp(
    `(\\d{1,2})\\s+(${months})(?:\\s+(20\\d{2}))?(?:.*?(\\d{1,2})[:.](\\d{2}))?`,
    "i",
  ).exec(t);
  let hour = 19;
  let minute = 0;
  if (match) {
    const month = MONTHS_SV[match[2].toLowerCase()];
    const yr = Number(match[3] || 0) || year || nowSthlm().year;
    if (match[4]) {
      hour = Number(match[4]);
      minute = Number(match[5]);
    }
    return DateTime.fromObject({ year: yr, month, day: Number(match[1]), hour, minute }, { zone: TZ });
  }
  match = new RegExp(
    `(\\d{1,2})\\s+(jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec)\\.?` +
      `(?:\\s+(20\\d{2}))?(?:.*?(\\d{1,2})[.:](\\d{2}))?`,
    "i",
  ).exec(t);
  if (!match) return null;
  const month = MONTHS_SV_SHORT[match[2].toLowerCase().slice(0, 3)];
  const yr = Number(match[3] || 0) || year || nowSthlm().year;
  if (match[4]) {
    hour = Number(match[4]);
    minute = Number(match[5]);
  }
  return DateTime.fromObject({ year: yr, month, day: Number(match[1]), hour, minute }, { zone: TZ });
}

/** Python `helpers.parse_en_mdy`. */
export function parseEnMdy(text: string): DateTime | null {
  const match = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(20\d{2})/.exec(text);
  if (!match) return null;
  const monthRaw = match[1].toLowerCase();
  const month = MONTHS_EN[monthRaw] || MONTHS_EN_SHORT[monthRaw.slice(0, 3)];
  if (!month) return null;
  return DateTime.fromObject(
    { year: Number(match[3]), month, day: Number(match[2]) },
    { zone: TZ },
  );
}

/** Python `core.parse_bc_date`. */
export function parseBcDate(value: string): DateTime {
  const dt = DateTime.fromFormat(String(value || "").replace(" GMT", ""), "dd LLL yyyy HH:mm:ss", {
    locale: "en",
    zone: "utc",
  });
  return dt.isValid ? dt : DateTime.fromMillis(0, { zone: "utc" });
}

/** Python `core.parse_slakt_listing_date`. */
export function parseSlaktListingDate(
  dayText: string,
  monthText: string,
  today: DateTime,
): DateTime | null {
  const dayN = Number.parseInt(dayText, 10);
  const monthN = MONTHS_SV[monthText.trim().toLowerCase()];
  if (!dayN || !monthN) return null;
  let year = today.setZone(TZ).year;
  let candidate = DateTime.fromObject({ year, month: monthN, day: dayN }, { zone: TZ });
  if (candidate < today.setZone(TZ).minus({ days: 2 })) {
    year += 1;
    candidate = DateTime.fromObject({ year, month: monthN, day: dayN }, { zone: TZ });
  }
  return candidate;
}

/** Python `core.parse_larrys_time`. */
export function parseLarrysTime(blob: string): string {
  const match = /(\d{1,2})[.:](\d{2})\s*(am|pm)/i.exec(blob);
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = match[2];
  const ap = match[3].toLowerCase();
  if (ap === "pm" && hour < 12) hour += 12;
  else if (ap === "am" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

/** Python `core.parse_ronnells_time`. */
export function parseRonnellsTime(text: string): string {
  let match = /(\d{1,2})(?::(\d{2}))?\s*[-–]/.exec(text);
  if (!match) match = /(?:kl\.?\s*)?(\d{1,2})(?::(\d{2}))?/i.exec(text);
  if (!match) return "";
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2] || "00"}`;
}
