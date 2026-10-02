from __future__ import annotations

import html
import json
import re
from datetime import datetime

from scrapers.core import TZ, http_request, in_range, page_media_fields, strip_tags
from scrapers.helpers import is_concert, make_event, og_image, page_blurb, parse_sv_when, pick_image, wp_featured_url

HEAD_WHEN = re.compile(
    r"(?:mån|tis|ons|tors|fre|lör|sön)\s+(\d{1,2})\s+"
    r"(jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec)\.?"
    r"[\s\S]{0,120}?Dörrar\s+(\d{1,2})[.:](\d{2})",
    re.I,
)


def _event_types(page: str) -> dict[str, str]:
    match = re.search(r"var klEventTypes = (\{.*?\});", page)
    if not match:
        return {}
    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError:
        return {}


def _when_from_page(page: str, year: int) -> datetime | None:
    window = page
    h1 = re.search(r"<h1[^>]*>[\s\S]{0,120}</h1>([\s\S]{0,900})", page, re.I)
    if h1:
        window = h1.group(0)
    match = HEAD_WHEN.search(window)
    if not match:
        return parse_sv_when(strip_tags(window), year)
    when = parse_sv_when(f"{match.group(1)} {match.group(2)} {year}", year)
    if when is None:
        return None
    return when.replace(hour=int(match.group(3)), minute=int(match.group(4)), tzinfo=TZ)


def fetch(start: datetime, end: datetime) -> list[dict]:
    raw = http_request("https://kollektivetlivet.se/wp-json/wp/v2/event?per_page=100")
    events: list[dict] = []
    types: dict[str, str] = {}
    for post in json.loads(raw):
        title = html.unescape((post.get("title") or {}).get("rendered") or "")
        url = post.get("link") or ""
        content = (post.get("content") or {}).get("rendered") or ""
        slug = post.get("slug") or ""
        try:
            page = http_request(url)
        except Exception:
            page = content
        if not types:
            types = _event_types(page)
        kind = (types.get(slug) or "").lower()
        if kind == "klubb":
            continue
        when = _when_from_page(page, start.year)
        if when is not None and when.date() < start.date() and when.month <= 6:
            when = when.replace(year=when.year + 1)
        if when is None or not in_range(when, start, end):
            continue
        if not is_concert(title, strip_tags(content), "konsert"):
            continue
        image = wp_featured_url("https://kollektivetlivet.se", post.get("featured_media"))
        if not image:
            image = pick_image(og_image(page))
        place = "Kollektivet Livet"
        scen = re.search(r"Scen\s+(Stora Scen|Lilla Scen|Hallen)", page, re.I)
        if scen:
            place = scen.group(1).title().replace("Scen", "scen")
        event = make_event(
            "kollektivetlivet",
            "Kollektivet Livet",
            title,
            when,
            url,
            place=place,
            image=image,
            text=page_blurb(content, page=page),
            extra_id=str(post.get("id")),
        )
        event.update(page_media_fields(page, "kollektivetlivet"))
        events.append(event)
    return events
