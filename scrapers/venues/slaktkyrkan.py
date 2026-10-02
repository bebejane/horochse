from datetime import datetime
from scrapers.slakthusen import fetch_slakthusen_venue


def fetch(start: datetime, end: datetime) -> list[dict]:
    return fetch_slakthusen_venue(start, end, "slaktkyrkan", "Slaktkyrkan")
