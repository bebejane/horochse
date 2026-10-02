from __future__ import annotations

import html
import json
import re
from datetime import datetime

from scrapers.core import TZ, http_request, in_range, page_media_fields
from scrapers.helpers import is_concert, make_event, page_blurb, parse_dt, wp_featured_url

API = "https://www.encoresundbyberg.se/wp-json/wp/v2/events?per_page=100"


def _when(acf: dict, year: int) -> datetime | None:
    start = str(acf.get("event_start") or "").strip()
    show = str(acf.get("show_start") or acf.get("doors_open") or "20:00")
    time_part = re.search(r"(\d{1,2})[:.](\d{2})", show)
    hour, minute = (int(time_part.group(1)), int(time_part.group(2))) if time_part else (20, 0)
    if re.fullmatch(r"20\d{6}", start):
        when = datetime.strptime(start, "%Y%m%d").replace(hour=hour, minute=minute, tzinfo=TZ)
        return when
    return parse_dt(f"{year}-{start}") if re.fullmatch(r"\d{2}-\d{2}", start) else None


def fetch(start: datetime, end: datetime) -> list[dict]:
    posts = json.loads(http_request(API))
    events: list[dict] = []
    for post in posts:
        acf = post.get("acf") or {}
        title = html.unescape((post.get("title") or {}).get("rendered") or "")
        support = html.unescape(str(acf.get("support_act") or "")).strip()
        if support:
            title = f"{title} + {support}"
        when = _when(acf, start.year)
        if when is None or not in_range(when, start, end):
            continue
        content = (post.get("content") or {}).get("rendered") or ""
        intro = html.unescape(str(acf.get("intro_text") or ""))
        if not is_concert(title, intro + " " + content, "konsert"):
            continue
        url = post.get("link") or "https://www.encoresundbyberg.se/"
        image = wp_featured_url("https://www.encoresundbyberg.se", post.get("featured_media"))
        event = make_event(
            "encore",
            "Encore",
            title,
            when,
            url,
            place="Encore",
            image=image,
            text=page_blurb(intro, content),
            extra_id=str(post.get("id") or title),
        )
        event.update(page_media_fields(content, "encore"))
        events.append(event)
    return events
