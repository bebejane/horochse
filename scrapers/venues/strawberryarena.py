from datetime import datetime
from scrapers.live import fetch_by_host


def fetch(start: datetime, end: datetime) -> list[dict]:
    return fetch_by_host(start, end, "strawberryarena.se", "Strawberry Arena", "strawberryarena", "Strawberry Arena")
