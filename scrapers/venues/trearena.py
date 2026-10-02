from datetime import datetime
from scrapers.live import fetch_by_host


def fetch(start: datetime, end: datetime) -> list[dict]:
    return fetch_by_host(start, end, "3arena.se", "3Arena", "trearena", "3Arena")
