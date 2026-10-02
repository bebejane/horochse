from datetime import datetime
from scrapers.core import fetch_larrys_corner as _fetch
from scrapers.helpers import is_concert


def fetch(start: datetime, end: datetime) -> list[dict]:
    return [event for event in _fetch(start, end) if is_concert(event.get("title") or "", event.get("text") or "")]
