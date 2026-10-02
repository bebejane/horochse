from __future__ import annotations

import html
import re
from datetime import datetime

from urllib.parse import parse_qs, unquote, urlparse

from scrapers.core import http_request, in_range
from scrapers.helpers import is_concert, make_event, parse_sv_when, pick_image

URL = "https://kulturhusethartwig.se/biljetter"
CARD_RE = re.compile(
    r'(<img[^>]+src="[^"]+"[\s\S]{0,1200}?)?'
    r'<p class="text-sm font-bold[^"]*">([^<]+)</p>\s*'
    r"<h2[^>]*>\s*<a[^>]+href=\"([^\"]+)\"[^>]*>([^<]+)</a>\s*</h2>\s*"
    r'<p class="mt-3[^"]*">([^<]*)</p>',
    re.I,
)


def fetch(start: datetime, end: datetime) -> list[dict]:
    page = http_request(URL)
    events: list[dict] = []
    seen: set[str] = set()
    for img_html, date_text, href, title, blurb in CARD_RE.findall(page):
        title = html.unescape(title).strip()
        blurb = html.unescape(blurb).strip()
        if re.search(r"festivalbiljett|hyra lokal|vernissage", title + " " + blurb, re.I):
            continue
        when = parse_sv_when(html.unescape(date_text), start.year)
        if when is None or not in_range(when, start, end):
            continue
        if not is_concert(title, blurb, "live"):
            continue
        url = html.unescape(href)
        if url in seen:
            continue
        seen.add(url)
        src = re.search(r'src="([^"]+)"', img_html or "")
        raw = html.unescape(src.group(1) if src else "")
        if raw.startswith("/"):
            raw = "https://kulturhusethartwig.se" + raw
        if "/_next/image" in raw:
            inner = parse_qs(urlparse(raw).query).get("url", [""])[0]
            raw = unquote(inner) or raw
        image = pick_image(raw)
        events.append(
            make_event(
                "hartwig",
                "Kulturhuset Hartwig",
                title,
                when,
                url,
                place="Kulturhuset Hartwig",
                image=image,
                text=blurb,
            )
        )
    return events
