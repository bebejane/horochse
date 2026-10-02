from datetime import datetime
from scrapers.core import fetch_kulturhuset as _fetch
from scrapers.helpers import is_concert


def fetch(start: datetime, end: datetime) -> list[dict]:
    events = []
    for event in _fetch(start, end):
        event["venue"] = "Kulturhuset Stadsteatern"
        if is_concert(event.get("title") or "", event.get("text") or "", "musik"):
            events.append(event)
    return events
