import { MONTHS, WEEKDAYS } from "./types";

export function pad(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

export function parseDay(isoDate: string): Date {
  const parts = isoDate.split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

export function toIso(date: Date): string {
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function todayDate(): Date {
  return startOfDay(new Date());
}

export function thisWeekMonday(): Date {
  const day = todayDate();
  const weekday = day.getDay();
  day.setDate(day.getDate() + (weekday === 0 ? -6 : 1 - weekday));
  return day;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function weekMondayIso(isoDate: string): string {
  const day = parseDay(isoDate);
  const weekday = day.getDay();
  day.setDate(day.getDate() + (weekday === 0 ? -6 : 1 - weekday));
  return toIso(day);
}

export function weekDaysFromMonday(mondayIso: string): string[] {
  const days: string[] = [];
  const cursor = parseDay(mondayIso);
  for (let i = 0; i < 7; i++) {
    days.push(toIso(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function formatWeekSpan(fromIso: string, toIso: string): string {
  const from = parseDay(fromIso);
  const to = parseDay(toIso);
  if (from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()) {
    return from.getDate() + "–" + to.getDate() + " " + MONTHS[to.getMonth()];
  }
  return from.getDate() + " " + MONTHS[from.getMonth()] + " – " + to.getDate() + " " + MONTHS[to.getMonth()];
}

export function weekTitle(mondayIso: string, weekDays: string[]): string {
  const thisMon = toIso(thisWeekMonday());
  const nextMon = toIso(addDays(thisWeekMonday(), 7));
  if (mondayIso === thisMon) return "Denna veckans konserter";
  if (mondayIso === nextMon) return "Nästa vecka";
  return formatWeekSpan(weekDays[0], weekDays[weekDays.length - 1]);
}

export function formatDay(isoDate: string): { kicker: string; rest: string } {
  const d = parseDay(isoDate);
  const today = todayDate();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  let label = WEEKDAYS[d.getDay()];
  if (d.getTime() === today.getTime()) label = "idag";
  if (d.getTime() === tomorrow.getTime()) label = "imorgon";
  return {
    kicker: label.charAt(0).toUpperCase() + label.slice(1),
    rest: d.getDate() + " " + MONTHS[d.getMonth()],
  };
}

export function formatUpdated(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return "Uppdaterad " + d.getDate() + " " + MONTHS[d.getMonth()] + " kl " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

export function calendarEndDate(rangeTo?: string | null): Date {
  const fiveWeeks = addDays(thisWeekMonday(), 5 * 7 - 1);
  let end = rangeTo ? parseDay(rangeTo) : new Date(fiveWeeks);
  if (end.getTime() < fiveWeeks.getTime()) end = new Date(fiveWeeks);
  const weekday = end.getDay();
  if (weekday !== 0) end.setDate(end.getDate() + (7 - weekday));
  return end;
}

export function calendarDays(rangeTo?: string | null): string[] {
  const days: string[] = [];
  const cursor = thisWeekMonday();
  const end = calendarEndDate(rangeTo);
  while (cursor.getTime() <= end.getTime()) {
    days.push(toIso(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  while (days.length % 7 !== 0) {
    days.push(toIso(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function formatClock(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
}
