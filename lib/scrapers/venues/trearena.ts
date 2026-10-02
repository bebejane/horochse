import type { DateTime } from "luxon";

import { fetchByHost } from "../sources/live";
import type { ScrapedEvent } from "../types";

export function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  return fetchByHost(start, end, "3arena.se", "3Arena", "trearena", "3Arena");
}
