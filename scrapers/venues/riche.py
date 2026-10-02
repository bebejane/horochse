from __future__ import annotations

import html
import json
import re
from datetime import datetime, timedelta

from scrapers.core import TZ, http_request, in_range, page_media_fields
from scrapers.helpers import is_concert, make_event, og_image, page_blurb, wp_featured_url

API = "https://riche.se/wp-json/wp/v2/events?per_page=100&page={page}"
ORIGIN = "https://riche.se"

ROOM_SLUGS = (
    ("lilla-baren", "Lilla Baren"),
    ("stora-baren", "Stora Baren"),
    ("sotra-baren", "Stora Baren"),
    ("sommarbaren", "Sommarbaren"),
    ("teatergrillen", "Teatergrillen"),
    ("restaurangen", "Restaurangen"),
    ("hela-riche", "Hela Riche"),
    ("riche", "Riche"),
)
DAY_RE = re.compile(
    r"(?:måndag|tisdag|onsdag|torsdag|fredag|lördag|söndag)?\s*(\d{1,2})/(\d{1,2})",
    re.I,
)
LIVE_TIME_RE = re.compile(r"LIVE[:\s]*(\d{1,2})(?:[.:](\d{2}))?", re.I)
SIDEBAR_RE = re.compile(
    r'single-event-sidebar__list-item (date|type|location)">\s*([^<]+)',
    re.I,
)


def _classes(post: dict) -> list[str]:
    return [str(item) for item in (post.get("class_list") or [])]


def _is_live(classes: list[str], title: str) -> bool:
    if "event_types-live" in classes:
        return True
    return bool(re.search(r"\blive\b", title, re.I)) and not any(
        tag in classes for tag in ("event_types-dj", "event_types-konst", "event_types-brunch")
    )


def _room_from_classes(classes: list[str]) -> str:
    for slug, name in ROOM_SLUGS:
        if f"event_locations-{slug}" in classes:
            return name
    return "Riche"


def _room_from_sidebar(text: str, fallback: str) -> str:
    raw = html.unescape(text or "").strip()
    if not raw:
        return fallback
    first = raw.split(",")[0].strip()
    folded = first.casefold()
    if "ostron" in folded and "bar" not in folded:
        return fallback
    if "lilla" in folded:
        return "Lilla Baren"
    if "stora" in folded or "sotra" in folded:
        return "Stora Baren"
    if "sommar" in folded:
        return "Sommarbaren"
    if "teatergrill" in folded:
        return "Teatergrillen"
    if "hela" in folded:
        return "Hela Riche"
    return first or fallback


def _posts() -> list[dict]:
    posts: list[dict] = []
    for page in range(1, 6):
        try:
            batch = json.loads(http_request(API.format(page=page)))
        except Exception:
            break
        if not isinstance(batch, list) or not batch:
            break
        posts.extend(batch)
        if len(batch) < 100:
            break
    return posts


def _sidebar(page: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for kind, value in SIDEBAR_RE.findall(page or ""):
        fields[kind.lower()] = html.unescape(value).strip()
    return fields


def _when(date_text: str, blob: str, start: datetime) -> datetime | None:
    match = DAY_RE.search(date_text or "")
    if not match:
        return None
    day, month = int(match.group(1)), int(match.group(2))
    year = start.year
    try:
        when = datetime(year, month, day, tzinfo=TZ)
    except ValueError:
        return None
    if when.date() < start.date() - timedelta(days=14):
        try:
            when = when.replace(year=year + 1)
        except ValueError:
            return None
    hour, minute = 21, 0
    time_match = LIVE_TIME_RE.search(blob or "")
    if time_match:
        hour = int(time_match.group(1))
        minute = int(time_match.group(2) or 0)
        if hour < 8:
            hour += 12
    return when.replace(hour=hour, minute=minute)


def fetch(start: datetime, end: datetime) -> list[dict]:
    events: list[dict] = []
    seen: set[str] = set()
    for post in _posts():
        title = html.unescape((post.get("title") or {}).get("rendered") or "").strip()
        classes = _classes(post)
        if not title or not _is_live(classes, title):
            continue
        url = post.get("link") or ""
        if not url or url in seen:
            continue
        try:
            page = http_request(url)
        except Exception:
            continue
        side = _sidebar(page)
        kind = side.get("type") or ""
        if kind and not re.search(r"live", kind, re.I):
            continue
        content = (post.get("content") or {}).get("rendered") or ""
        blob = f"{title} {content} {page}"
        if not is_concert(title, blob, kind or "live"):
            continue
        when = _when(side.get("date") or "", blob, start)
        if when is None or not in_range(when, start, end):
            continue
        seen.add(url)
        place = _room_from_sidebar(side.get("location") or "", _room_from_classes(classes))
        image = og_image(page) or wp_featured_url(ORIGIN, post.get("featured_media"))
        event = make_event(
            "riche",
            "Riche",
            title,
            when,
            url,
            place=place,
            image=image,
            text=page_blurb(content, page=page),
            extra_id=str(post.get("id") or title),
        )
        event.update(page_media_fields(content + "\n" + page, "riche"))
        events.append(event)
    return events
