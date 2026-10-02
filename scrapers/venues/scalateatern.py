from __future__ import annotations

import html
import re
from datetime import datetime

from scrapers.core import http_request, in_range
from scrapers.helpers import is_concert, jsonld_events, make_event, og_image, parse_dt, pick_image

URL = "https://www.scalateatern.se/forestallningar/"


def fetch(start: datetime, end: datetime) -> list[dict]:
    page = http_request(URL)
    events: list[dict] = []
    seen: set[str] = set()
    for node in jsonld_events(page):
        title = node.get("name") or ""
        href = node.get("url") or URL
        when = parse_dt(node.get("startDate") or "")
        if not title or when is None or not in_range(when, start, end):
            continue
        if not is_concert(title, node.get("description") or "", "musik"):
            continue
        if href in seen:
            continue
        seen.add(href)
        events.append(
            make_event(
                "scalateatern",
                "Scalateatern",
                title,
                when,
                href,
                place="Scalateatern",
                image=pick_image(node.get("image")),
            )
        )
    for href, body in re.findall(
        r'href="(https://www\.scalateatern\.se/forestallning/[^"]+/)"([^>]*>[\s\S]{0,900})</a>',
        page,
        re.I,
    ):
        blob = html.unescape(body)
        if not re.search(r"konsert|concert|jazz|live\s*musik|kör", blob, re.I):
            continue
        title_match = re.search(r"<h[1-4][^>]*>([^<]+)", blob)
        if not title_match:
            continue
        title = html.unescape(title_match.group(1)).strip()
        iso = re.search(r"(20\d{2}-\d{2}-\d{2})", blob)
        if not iso:
            continue
        when = parse_dt(iso.group(1) + "T19:00")
        if when is None or not in_range(when, start, end):
            continue
        if not is_concert(title, blob, "musik"):
            continue
        if href in seen:
            continue
        seen.add(href)
        img_match = re.search(r'<img[^>]+src="([^"]+)"', blob, re.I)
        image = pick_image(img_match.group(1) if img_match else "")
        if not image:
            try:
                image = og_image(http_request(href))
            except Exception:
                image = ""
        events.append(
            make_event(
                "scalateatern",
                "Scalateatern",
                title,
                when,
                href,
                place="Scalateatern",
                image=image,
            )
        )
    return events
