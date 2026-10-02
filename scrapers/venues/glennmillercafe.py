from __future__ import annotations

import html
import re
from datetime import datetime

from scrapers.core import http_request, in_range
from scrapers.helpers import is_concert, make_event, parse_dt

URL = "https://www.glennmillercafe.se/konserter"
VENUE_IMAGE = (
    "https://static.wixstatic.com/media/"
    "25e6a5_6968546c58a64d9fa7cd0003aa50d77f~mv2.jpg"
    "/v1/fill/w_980,h_646,al_c,q_85,usm_0.66_1.00_0.01/glenn-miller-cafe.jpg"
)
MONTH_NAME = re.compile(
    r"^(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)$",
    re.I,
)


def fetch(start: datetime, end: datetime) -> list[dict]:
    page = http_request(URL)
    events: list[dict] = []
    seen: set[str] = set()
    for match in re.finditer(r">(20\d{2}-\d{2}-\d{2})<", page):
        date_str = match.group(1)
        when = parse_dt(date_str + "T19:30")
        if when is None or not in_range(when, start, end):
            continue
        after = page[match.end() : match.end() + 5000]
        texts = [
            html.unescape(text).strip()
            for text in re.findall(r"wixui-rich-text__text\">([^<]{2,160})<", after)
        ]
        title = ""
        for text in texts:
            if re.fullmatch(r"20\d{2}-\d{2}-\d{2}", text):
                continue
            if re.search(r"glenn miller|stockholm|meny|boka|kontakt|öppet", text, re.I):
                continue
            if MONTH_NAME.fullmatch(text):
                continue
            if len(text) < 3:
                continue
            title = text
            break
        if not title:
            continue
        if not is_concert(title, "jazz", "jazz"):
            continue
        key = date_str + title.lower()
        if key in seen:
            continue
        seen.add(key)
        events.append(
            make_event(
                "glennmillercafe",
                "Glenn Miller Café",
                title,
                when,
                URL,
                extra_id=date_str + title,
                image=VENUE_IMAGE,
            )
        )
    return events
