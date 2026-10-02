import type { DateTime } from "luxon";

import { fetchJsonldSite } from "../sources/jsonld-site";
import type { ScrapedEvent } from "../types";

export function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  return fetchJsonldSite(
    start,
    end,
    [
      "https://www.ericericsonhallen.se/",
      "http://www.skeppsholmsgruppen.se/unika-eventlokaler-i-stockholm/eric-ericsonhallen/",
    ],
    "Eric Ericsonhallen",
    "ericericsonhallen",
    { place: "Eric Ericsonhallen", strict: true, category: "konsert" },
  );
}
