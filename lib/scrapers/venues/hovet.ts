import type { DateTime } from "luxon";

import { fetchByHost } from "../sources/live";
import type { ScrapedEvent } from "../types";

export function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  return fetchByHost(start, end, "hovetarena.se", "Hovet", "hovet", "Hovet");
}
