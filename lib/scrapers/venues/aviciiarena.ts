import type { DateTime } from "luxon";

import { fetchByHost, fillSingleText } from "../sources/live";
import type { ScrapedEvent } from "../types";

export function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  return fetchByHost(start, end, "aviciiarena.se", "Avicii Arena", "aviciiarena", "Avicii Arena").then(
    fillSingleText,
  );
}
