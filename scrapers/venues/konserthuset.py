from __future__ import annotations

import html
import json
import re
from datetime import datetime
from urllib.parse import urlencode, urljoin

from scrapers.core import http_request, in_range
from scrapers.helpers import is_concert, make_event, parse_dt

URL = "https://www.konserthuset.se/program-och-biljetter/kalender/"
MONTH_URL = "https://www.konserthuset.se/CalendarSlideBlock/LoadArrangeMentsByMonth/"
GUID_RE = re.compile(r'data-contentguid="([0-9a-fA-F-]{36})"')
ITEM_RE = re.compile(
    r'<li id="page-\d+" data-fulldate="([^"]+)" data-fulltime="([^"]+)"[^>]*itemtype="https://schema.org/MusicEvent">([\s\S]*?)</li>',
    re.I,
)


def _html_chunks(start: datetime, end: datetime) -> list[str]:
    page = http_request(URL)
    chunks = [page]
    guid_match = GUID_RE.search(page)
    guid = guid_match.group(1) if guid_match else "7734c4c5-5c58-4872-a98b-6b5501531aca"
    months = {(start.year, start.month), (end.year, end.month)}
    if start.month != end.month:
        months.add((start.year, start.month))
    for year, month in sorted(months):
        body = urlencode(
            {
                "year": year,
                "month": month,
                "amountToLoad": 80,
                "typefilters": "",
                "lang": "sv",
                "contentGuid": guid,
                "viewType": "normal",
            }
        ).encode()
        try:
            raw = http_request(
                MONTH_URL,
                data=body,
                extra_headers={
                    "X-Requested-With": "XMLHttpRequest",
                    "Referer": URL,
                    "Accept": "application/json",
                },
            )
            payload = json.loads(raw)
            chunks.append(payload.get("html") or "")
        except Exception:
            continue
    return chunks


def fetch(start: datetime, end: datetime) -> list[dict]:
    events: list[dict] = []
    seen: set[str] = set()
    for chunk in _html_chunks(start, end):
        for date_str, fulltime, body in ITEM_RE.findall(chunk):
            href_match = re.search(r'itemprop="url" content="([^"]+)"', body)
            href = href_match.group(1) if href_match else ""
            if "/guidad-visning/" in href:
                continue
            title_match = re.search(r'itemprop="name">\s*<a href="[^"]+">([^<]+)', body)
            if not title_match:
                continue
            title = html.unescape(title_match.group(1)).strip()
            if re.search(r"skolkonsert|förskolan|forskola|^mini\b", title, re.I):
                continue
            text = ""
            desc = re.search(r'itemprop="description">\s*([^<]+)', body)
            if desc:
                text = html.unescape(desc.group(1)).strip()
            when = parse_dt(fulltime.replace(" ", "T"))
            if when is None:
                when = parse_dt(date_str + "T19:00")
            if when is None or not in_range(when, start, end):
                continue
            if not is_concert(title, text, "konsert"):
                continue
            if re.search(r"berättar om", text) and not re.search(r"konsert|symphony|filharmon|jazz|kör", title, re.I):
                continue
            if not href:
                path = re.search(r'href="(/program-och-biljetter/kalender/[^"]+)"', body)
                href = urljoin("https://www.konserthuset.se", path.group(1)) if path else URL
            key = href + when.strftime("%Y-%m-%d%H:%M")
            if key in seen:
                continue
            seen.add(key)
            image = ""
            img = re.search(r'<img itemprop="url"[^>]*src="([^"]+)"', body)
            if img:
                image = urljoin("https://www.konserthuset.se", html.unescape(img.group(1)))
            place = "Konserthuset Stockholm"
            events.append(
                make_event(
                    "konserthuset",
                    "Konserthuset Stockholm",
                    title,
                    when,
                    href,
                    place=place,
                    image=image,
                    text=text,
                )
            )
    return events
