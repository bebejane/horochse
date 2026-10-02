import type { DateTime } from "luxon";

import { fetchJsonldSite } from "../sources/jsonld-site";
import type { ScrapedEvent } from "../types";

export function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  return fetchJsonldSite(
    start,
    end,
    ["https://kungcarls.se/", "https://www.kungcarlsjazzklubb.se/"],
    "Kung Carls Jazzklubb",
    "kungcarls",
    { place: "Kung Carls Jazzklubb", strict: false, category: "jazz" },
  );
}
