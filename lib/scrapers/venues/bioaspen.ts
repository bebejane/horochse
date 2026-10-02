import type { DateTime } from "luxon";

import { fetchJsonldSite } from "../sources/jsonld-site";
import type { ScrapedEvent } from "../types";

export function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  return fetchJsonldSite(start, end, ["https://www.bioaspen.se/"], "Bio Aspen", "bioaspen", {
    place: "Bio Aspen",
    strict: true,
    category: "konsert",
  });
}
