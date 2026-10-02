from datetime import datetime
from scrapers.jsonld_site import fetch_jsonld_site


def fetch(start: datetime, end: datetime) -> list[dict]:
    return fetch_jsonld_site(
        start,
        end,
        ['https://www.engelen.se/'],
        "Engelen",
        "engelen",
        place="Engelen",
        strict=False,
        category="live",
    )
