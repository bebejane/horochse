from __future__ import annotations

import html
import re
from datetime import datetime
from urllib.parse import urljoin

from scrapers.core import http_request, in_range
from scrapers.helpers import is_concert, make_event, og_image, page_blurb, parse_dt

URL = "https://www.kmh.se/kalender"
SKIP = re.compile(
    r"fika|symposium|vägledning|vagledning|disputation|rektorskollegium|"
    r"studieverkstad|information om|study abroad",
    re.I,
)
KEEP = re.compile(
    r"konsert|concert|folkmusik|dirigent|recital|jazz|kör|kor\b|opera|"
    r"ensemble|orkester|gig|live|spelar",
    re.I,
)
BLOCK_RE = re.compile(r'<div class="lp-event-info">([\s\S]*?)</div>\s*<div class="sv-clear-both">', re.I)


def fetch(start: datetime, end: datetime) -> list[dict]:
    page = http_request(URL)
    events: list[dict] = []
    seen: set[str] = set()
    for block in BLOCK_RE.findall(page):
        title_match = re.search(
            r'<h2 class="subheading"><a href="([^"]+)">\s*<span>([^<]+)</span>',
            block,
            re.I,
        )
        if not title_match:
            continue
        href = html.unescape(title_match.group(1))
        title = html.unescape(title_match.group(2)).strip()
        if SKIP.search(title) and not KEEP.search(title):
            continue
        if not KEEP.search(title):
            continue
        dt_match = re.search(r'<time class="litenxtext" datetime="([^"]+)"', block, re.I)
        when = parse_dt(dt_match.group(1)) if dt_match else None
        if when is None:
            url_date = re.search(r"/(\d{4}-\d{2}-\d{2})-", href)
            if url_date:
                when = parse_dt(url_date.group(1) + "T18:00")
        if not title or when is None or not in_range(when, start, end):
            continue
        if not is_concert(title, category="konsert"):
            continue
        url = urljoin("https://www.kmh.se", href)
        if url in seen:
            continue
        seen.add(url)
        image = ""
        text = ""
        try:
            detail = http_request(url)
            image = og_image(detail)
            text = page_blurb(page=detail)
        except Exception:
            image = ""
        events.append(
            make_event(
                "kmh",
                "Kungl. Musikhögskolan",
                title,
                when,
                url,
                place="KMH",
                image=image,
                text=text,
            )
        )
    return events
