from datetime import datetime
from scrapers.jsonld_site import fetch_jsonld_site


def fetch(start: datetime, end: datetime) -> list[dict]:
    return fetch_jsonld_site(
        start,
        end,
        ['https://www.bagarmossensfolketshus.se/', 'https://bagis.se/'],
        "Bagarmossens Folkets Hus",
        "bagarmossen",
        place="Bagarmossens Folkets Hus",
        strict=True,
        category="konsert",
    )
