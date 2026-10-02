from datetime import datetime
from scrapers.live import fetch_by_host, fill_single_text


def fetch(start: datetime, end: datetime) -> list[dict]:
    return fill_single_text(
        fetch_by_host(start, end, "aviciiarena.se", "Avicii Arena", "aviciiarena", "Avicii Arena")
    )
