import type { DateTime } from "luxon";

import { fetchSlakthusenVenue } from "../sources/slakthusen";
import type { ScrapedEvent } from "../types";

export function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  return fetchSlakthusenVenue(start, end, "slaktkyrkan", "Slaktkyrkan");
}
