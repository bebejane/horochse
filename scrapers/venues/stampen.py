from __future__ import annotations

import html
import json
import re
from datetime import datetime

from scrapers.core import MONTHS_EN, MONTHS_SV, TZ, http_request, in_range, page_media_fields
from scrapers.helpers import is_concert, make_event, page_blurb, parse_dt, wp_featured_url


def fetch(start: datetime, end: datetime) -> list[dict]:
    raw = http_request("https://stampen.se/wp-json/wp/v2/mec-events?per_page=50")
    posts = json.loads(raw)
    events: list[dict] = []
    for post in posts:
        title = html.unescape((post.get("title") or {}).get("rendered") or "")
        title = re.sub(r"\s*[•·].*$", "", title).strip()
        title = re.sub(r"(?i)\s*live at stampen.*$", "", title).strip()
        url = post.get("link") or "https://stampen.se/"
        when = None
        blob = title + " " + html.unescape((post.get("title") or {}).get("rendered") or "")
        match = re.search(
            r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}).{0,12}(\d{1,2})[:.](\d{2})",
            blob,
            re.I,
        )
        if match:
            month = MONTHS_EN[match.group(1).lower()]
            year = start.year
            when = datetime(year, month, int(match.group(2)), int(match.group(3)), int(match.group(4)), tzinfo=TZ)
            if when.date() < start.date() - __import__("datetime").timedelta(days=20):
                when = when.replace(year=year + 1)
        content = (post.get("content") or {}).get("rendered") or ""
        if when is None:
            when = parse_dt(post.get("date") or "")
        if when is None or not in_range(when, start, end):
            continue
        if not is_concert(title, content):
            continue
        image = wp_featured_url("https://stampen.se", post.get("featured_media"))
        event = make_event(
            "stampen",
            "Stampen",
            title,
            when,
            url,
            image=image,
            text=page_blurb(content),
            extra_id=str(post.get("id") or title),
        )
        event.update(page_media_fields(content, "stampen"))
        events.append(event)
    return events
