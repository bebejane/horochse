import type { DateTime } from "luxon";

import { fetchJsonldSite } from "../sources/jsonld-site";
import type { ScrapedEvent } from "../types";

export function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  return fetchJsonldSite(start, end, ["https://www.engelen.se/"], "Engelen", "engelen", {
    place: "Engelen",
    strict: false,
    category: "live",
  });
}
