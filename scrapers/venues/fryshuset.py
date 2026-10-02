from datetime import datetime

from scrapers.ticketmaster import fetch_ticketmaster_venue

URL = "https://www.ticketmaster.se/venue/fryshuset-klubben-stockholm-biljetter/kfy/583"


def fetch(start: datetime, end: datetime) -> list[dict]:
    return fetch_ticketmaster_venue(
        start,
        end,
        URL,
        "Fryshuset",
        "fryshuset",
        place="Klubben",
    )
