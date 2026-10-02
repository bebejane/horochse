from __future__ import annotations

import json
import re
from datetime import datetime

from scrapers.core import http_request, in_range
from scrapers.helpers import is_cancelled, is_concert, jsonld_events, make_event, parse_dt, pick_image, walk_jsonld


def _artist_image(event: dict, venue: str) -> str:
    venue_fold = (venue or "").lower()
    for artist in event.get("artists") or []:
        name = (artist.get("name") or "").lower()
        if not name or name == venue_fold:
            continue
        urls = artist.get("imageUrls") or {}
        url = pick_image(
            urls.get("RETINA_PORTRAIT_16_9"),
            urls.get("ARTIST_PAGE_3_2"),
            urls.get("TABLET_LANDSCAPE_16_9"),
        )
        if url:
            return url
    return ""


def _venue_events(html: str) -> list[dict]:
    match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not match:
        return []
    try:
        data = json.loads(match.group(1))
    except json.JSONDecodeError:
        return []
    queries = (
        ((data.get("props") or {}).get("pageProps") or {})
        .get("initialReduxState", {})
        .get("api", {})
        .get("queries", {})
    )
    found: list[dict] = []
    seen: set[str] = set()
    for payload in queries.values():
        if not isinstance(payload, dict) or payload.get("endpointName") != "venueEvents":
            continue
        for event in (payload.get("data") or {}).get("events") or []:
            url = event.get("url") or ""
            if not url or url in seen:
                continue
            seen.add(url)
            found.append(event)
    return found


def fetch_ticketmaster_venue(
    start: datetime,
    end: datetime,
    url: str,
    venue: str,
    slug: str,
    place: str = "",
) -> list[dict]:
    html = http_request(url)
    events: list[dict] = []
    seen: set[str] = set()
    tm_events = _venue_events(html)
    source = tm_events
    if not source:
        source = _nodes_from_next(html) or jsonld_events(html)
    for node in source:
        if "startDate" in (node.get("dates") or {}) or node.get("title"):
            title = node.get("title") or node.get("name") or ""
            href = node.get("url") or url
            when = parse_dt((node.get("dates") or {}).get("startDate") or "")
            image = _artist_image(node, venue)
        else:
            title = node.get("name") or ""
            href = node.get("url") or url
            when = parse_dt(node.get("startDate") or "")
            image = pick_image(node.get("image"))
        if not title or when is None or not in_range(when, start, end):
            continue
        description = node.get("description") or ""
        dates = node.get("dates") if isinstance(node.get("dates"), dict) else {}
        status = dates.get("status") if isinstance(dates, dict) else {}
        status_code = status.get("code") if isinstance(status, dict) else status or ""
        if is_cancelled(title, description, str(node.get("eventStatus") or status_code or "")):
            continue
        if not is_concert(title, description, "musik"):
            continue
        key = href + when.strftime("%Y-%m-%d%H:%M")
        if key in seen:
            continue
        seen.add(key)
        location = node.get("venue") or node.get("location") or {}
        loc_name = location.get("name") if isinstance(location, dict) else ""
        events.append(
            make_event(
                slug,
                venue,
                title,
                when,
                href,
                place=place or loc_name or venue,
                image=image,
                text=description,
            )
        )
    return events


def _nodes_from_next(html: str) -> list[dict]:
    match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not match:
        return []
    try:
        data = json.loads(match.group(1))
    except json.JSONDecodeError:
        return []
    raw = (data.get("props") or {}).get("pageProps") or {}
    nodes = raw.get("eventsJsonLD") or []
    found: list[dict] = []
    for node in walk_jsonld(nodes):
        found.append(node)
    return found
