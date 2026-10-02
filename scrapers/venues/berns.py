from __future__ import annotations

import html
import json
import re
from datetime import datetime

from scrapers.core import TZ, http_request, in_range, page_media_fields, strip_tags
from scrapers.helpers import is_concert, jsonld_events, make_event, og_image, parse_dt, parse_en_mdy, pick_image


def _parse_berns_date(text: str) -> datetime | None:
    text = html.unescape(text or "").strip()
    when = parse_dt(text) or parse_en_mdy(text)
    if when:
        return when
    match = re.search(r"(\d{1,2})[./-](\d{1,2})[./-](20\d{2})", text)
    if match:
        return datetime(
            int(match.group(3)),
            int(match.group(2)),
            int(match.group(1)),
            tzinfo=TZ,
        )
    match = re.search(
        r"(\d{1,2})\s+(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+(20\d{2})",
        text,
        re.I,
    )
    if match:
        months = {
            "januari": 1, "februari": 2, "mars": 3, "april": 4, "maj": 5, "juni": 6,
            "juli": 7, "augusti": 8, "september": 9, "oktober": 10, "november": 11, "december": 12,
        }
        return datetime(int(match.group(3)), months[match.group(2).lower()], int(match.group(1)), tzinfo=TZ)
    return None


def fetch(start: datetime, end: datetime) -> list[dict]:
    html_page = http_request("https://berns.se/calendar/")
    events: list[dict] = []
    seen: set[str] = set()
    for node in jsonld_events(html_page):
        title = node.get("name") or ""
        url = node.get("url") or "https://berns.se/calendar/"
        when = parse_dt(node.get("startDate") or "")
        if not title or when is None or not in_range(when, start, end):
            continue
        if not is_concert(title, node.get("description") or "", "musik"):
            continue
        if url in seen:
            continue
        seen.add(url)
        image = pick_image(node.get("image"))
        if not image:
            try:
                image = og_image(http_request(url))
            except Exception:
                image = ""
        events.append(
            make_event(
                "berns",
                "Berns",
                title,
                when,
                url,
                text=node.get("description") or "",
                image=image,
            )
        )

    for match in re.finditer(
        r'(https://berns\.se/calendar/[^"]+/)"[\s\S]{0,800}?<(?:h[1-4]|div)[^>]*>\s*([^<]{3,80})',
        html_page,
        re.I,
    ):
        url = match.group(1)
        title = html.unescape(match.group(2)).strip()
        if re.search(r"afterwork|what.?s on|book|\baw\b|out of office", title, re.I):
            continue
        window = html_page[max(0, match.start() - 400) : match.end() + 200]
        date_text = re.search(
            r"(\d{1,2}[-/.]\d{1,2}[-/.]20\d{2}|[A-Za-z]+ \d{1,2},? 20\d{2}|\d{1,2} \w+ 20\d{2})",
            window,
        )
        when = _parse_berns_date(date_text.group(0) if date_text else "")
        if when is None:
            continue
        when = when.replace(hour=19, minute=0)
        if not in_range(when, start, end):
            continue
        if not is_concert(title, "musik"):
            continue
        if url in seen:
            continue
        seen.add(url)
        image = ""
        try:
            image = og_image(http_request(url))
        except Exception:
            image = ""
        events.append(make_event("berns", "Berns", title, when, url, image=image))

    if events:
        return events

    raw = http_request("https://berns.se/wp-json/wp/v2/event?per_page=50")
    for post in json.loads(raw):
        title = html.unescape((post.get("title") or {}).get("rendered") or "")
        url = post.get("link") or ""
        content = (post.get("content") or {}).get("rendered") or ""
        page = ""
        try:
            page = http_request(url)
        except Exception:
            page = content
        when = None
        heading = re.search(
            r"(\d{1,2}\s+\w+\s+20\d{2}|[A-Za-z]+ \d{1,2},?\s+20\d{2})",
            page,
        )
        if heading:
            when = _parse_berns_date(heading.group(1))
        if when is None:
            iso = re.findall(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}", page)
            if iso:
                when = parse_dt(iso[-1])
        if when is None or not in_range(when, start, end):
            continue
        if not is_concert(title, strip_tags(content), "musik"):
            continue
        image = pick_image(og_image(page), post.get("jetpack_featured_media_url"))
        event = make_event(
            "berns",
            "Berns",
            title,
            when,
            url,
            extra_id=str(post.get("id")),
            image=image,
        )
        event.update(page_media_fields(page, "berns"))
        events.append(event)
    return events
