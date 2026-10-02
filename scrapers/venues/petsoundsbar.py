from datetime import datetime
from scrapers.jsonld_site import fetch_jsonld_site


def fetch(start: datetime, end: datetime) -> list[dict]:
    return fetch_jsonld_site(
        start,
        end,
        ['https://petsounds.se/', 'https://www.petsoundsbar.se/'],
        "Pet Sounds Bar",
        "petsoundsbar",
        place="Pet Sounds Bar",
        strict=False,
        category="live",
    )
