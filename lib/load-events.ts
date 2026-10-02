import { readFile } from "node:fs/promises";
import path from "node:path";
import { isCancelledEvent } from "./events";
import type { ConcertEvent, EventsPayload } from "./types";

export const DATA_PATH = path.join(process.cwd(), "public", "data", "events.json");

export async function loadPayload(): Promise<EventsPayload> {
  try {
    const raw = await readFile(DATA_PATH, "utf8");
    return JSON.parse(raw) as EventsPayload;
  } catch {
    return { events: [], errors: {}, range: null };
  }
}

export async function loadEvents(): Promise<ConcertEvent[]> {
  const payload = await loadPayload();
  return (payload.events || []).filter((event) => !isCancelledEvent(event));
}

export async function findEvent(eventId: string): Promise<ConcertEvent | null> {
  const events = await loadEvents();
  return events.find((event) => event.id === eventId) || null;
}
