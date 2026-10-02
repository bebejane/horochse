import type { DateTime } from "luxon";

import { fetchJsonldSite } from "../sources/jsonld-site";
import type { ScrapedEvent } from "../types";

export function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  return fetchJsonldSite(
    start,
    end,
    ["https://www.bagarmossensfolketshus.se/", "https://bagis.se/"],
    "Bagarmossens Folkets Hus",
    "bagarmossen",
    { place: "Bagarmossens Folkets Hus", strict: true, category: "konsert" },
  );
}
