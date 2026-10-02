from datetime import datetime
from scrapers.jsonld_site import fetch_jsonld_site


def fetch(start: datetime, end: datetime) -> list[dict]:
    return fetch_jsonld_site(
        start,
        end,
        ['https://www.ericericsonhallen.se/', 'http://www.skeppsholmsgruppen.se/unika-eventlokaler-i-stockholm/eric-ericsonhallen/'],
        "Eric Ericsonhallen",
        "ericericsonhallen",
        place="Eric Ericsonhallen",
        strict=True,
        category="konsert",
    )
