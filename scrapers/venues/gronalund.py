from __future__ import annotations

import html
import re
from datetime import datetime
from urllib.parse import urljoin

from scrapers.core import http_request, in_range
from scrapers.helpers import is_concert, jsonld_events, make_event, parse_dt

URLS = [
    "https://www.gronalund.com/konserter",
    "https://www.gronalund.com/sv/gronan-live",
]


def fetch(start: datetime, end: datetime) -> list[dict]:
    events: list[dict] = []
    seen: set[str] = set()
    for url in URLS:
        try:
            page = http_request(url)
        except Exception:
            continue
        for node in jsonld_events(page):
            title = node.get("name") or ""
            href = node.get("url") or url
            when = parse_dt(node.get("startDate") or "")
            if not title or when is None or not in_range(when, start, end):
                continue
            if not is_concert(title, node.get("description") or "", "konsert"):
                continue
            if href in seen:
                continue
            seen.add(href)
            events.append(
                make_event(
                    "gronalund",
                    "Gröna Lund",
                    title,
                    when,
                    href,
                    place="Gröna Lund",
                )
            )
        for href, title, date_text, place in re.findall(
            r'href="([^"]+)"[\s\S]{0,400}?(?:<(?:h2|h3)[^>]*>)([^<]{3,80})[\s\S]{0,200}?(20\d{2}-\d{2}-\d{2}|[A-Za-zåäöÅÄÖ]{3,9}\s+\d{1,2})[\s\S]{0,120}?(Stora Scen|Lilla Scen)',
            page,
            re.I,
        ):
            title = html.unescape(title).strip()
            when = parse_dt(date_text if "20" in date_text else "")
            if when is None:
                continue
            when = when.replace(hour=19, minute=30)
            if not in_range(when, start, end):
                continue
            if not is_concert(title, "konsert", "konsert"):
                continue
            full = href if href.startswith("http") else urljoin("https://www.gronalund.com", href)
            if full in seen:
                continue
            seen.add(full)
            events.append(
                make_event(
                    "gronalund",
                    "Gröna Lund",
                    title,
                    when,
                    full,
                    place=html.unescape(place).strip(),
                )
            )
        if events:
            break
    return events
