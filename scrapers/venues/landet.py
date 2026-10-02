from __future__ import annotations

import html
import re
from datetime import datetime

from scrapers.core import http_request, in_range
from scrapers.helpers import is_concert, make_event, page_blurb, parse_dt

URL = "https://landet.nu/"
ITEM_RE = re.compile(
    r'<a href="(/overvaningen/[^"]+)">\s*<time>([^<]+)</time>[\s\S]*?<h3>([^<]+)</h3>',
    re.I,
)


def fetch(start: datetime, end: datetime) -> list[dict]:
    page = http_request(URL)
    events: list[dict] = []
    seen: set[str] = set()
    for href, date_str, title in ITEM_RE.findall(page):
        title = html.unescape(title).strip()
        when = parse_dt(date_str.strip() + "T21:00")
        if not title or when is None or not in_range(when, start, end):
            continue
        if not is_concert(title, "live"):
            continue
        url = "https://landet.nu" + href
        if url in seen:
            continue
        seen.add(url)
        img = ""
        text = ""
        img_match = re.search(
            rf'href="{re.escape(href)}"[\s\S]{{0,400}}?<img src="([^"]+)"',
            page,
        )
        if img_match:
            img = "https://landet.nu" + html.unescape(img_match.group(1))
        try:
            text = page_blurb(page=http_request(url))
        except Exception:
            text = ""
        events.append(
            make_event(
                "landet",
                "Restaurang Landet",
                title,
                when,
                url,
                place="Övervåningen",
                image=img,
                text=text,
            )
        )
    return events
