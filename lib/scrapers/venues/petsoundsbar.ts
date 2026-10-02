import type { DateTime } from "luxon";

import { fetchJsonldSite } from "../sources/jsonld-site";
import type { ScrapedEvent } from "../types";

export function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  return fetchJsonldSite(
    start,
    end,
    ["https://petsounds.se/", "https://www.petsoundsbar.se/"],
    "Pet Sounds Bar",
    "petsoundsbar",
    { place: "Pet Sounds Bar", strict: false, category: "live" },
  );
}
