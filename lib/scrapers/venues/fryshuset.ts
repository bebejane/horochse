import type { DateTime } from "luxon";

import { fetchTicketmasterVenue } from "../sources/ticketmaster";
import type { ScrapedEvent } from "../types";

const URL =
  "https://www.ticketmaster.se/venue/fryshuset-klubben-stockholm-biljetter/kfy/583";

export function fetch(start: DateTime, end: DateTime): Promise<ScrapedEvent[]> {
  return fetchTicketmasterVenue(start, end, URL, "Fryshuset", "fryshuset", "Klubben");
}
