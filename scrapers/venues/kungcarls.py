from datetime import datetime
from scrapers.jsonld_site import fetch_jsonld_site


def fetch(start: datetime, end: datetime) -> list[dict]:
    return fetch_jsonld_site(
        start,
        end,
        ['https://kungcarls.se/', 'https://www.kungcarlsjazzklubb.se/'],
        "Kung Carls Jazzklubb",
        "kungcarls",
        place="Kung Carls Jazzklubb",
        strict=False,
        category="jazz",
    )
