from __future__ import annotations

import html
import re
from datetime import datetime
from urllib.parse import urljoin

from scrapers.core import http_request, in_range
from scrapers.helpers import is_concert, jsonld_events, make_event, og_image, page_blurb, parse_dt, pick_image

HOME = "https://www.gotalejon.se/"
SKIP_SLUG = re.compile(
    r"musical|musikal|torka-aldrig|djungelboken|dylan-moran|arsenal|"
    r"piaf-the-show|standup|stand-up|comedy",
    re.I,
)


def fetch(start: datetime, end: datetime) -> list[dict]:
    home = http_request(HOME)
    slugs = []
    seen_paths: set[str] = set()
    for path in re.findall(r'href="(/all-events/[^"]+)"', home):
        if path in seen_paths:
            continue
        seen_paths.add(path)
        if SKIP_SLUG.search(path):
            continue
        slugs.append(path)

    events: list[dict] = []
    seen: set[str] = set()
    for path in slugs:
        url = urljoin(HOME, path)
        try:
            page = http_request(url)
        except Exception:
            continue
        title = ""
        when = None
        image = ""
        text = ""
        for node in jsonld_events(page):
            title = node.get("name") or title
            when = parse_dt(node.get("startDate") or "") or when
            text = node.get("description") or text
            image = pick_image(image, node.get("image"))
        if not title:
            og = re.search(r'<meta property="og:title" content="([^"]+)"', page)
            title = html.unescape(og.group(1)).strip() if og else ""
        image = pick_image(image, og_image(page))
        if not image:
            home_hit = re.search(
                rf'href="{re.escape(path)}"[\s\S]{{0,2000}}?(https://dynamicmedia\.livenationinternational\.com/[^"?\s]+)',
                home,
            )
            if home_hit:
                image = pick_image(home_hit.group(1))
        title = re.sub(r"\s+Tickets,.*$", "", title, flags=re.I).strip()
        title = re.sub(r"\s*[|\-–].*(göta lejon|biljett|www\.).*$", "", title, flags=re.I).strip()
        title = re.sub(r"\s+Tickets$", "", title, flags=re.I).strip()
        if when is None:
            iso = re.search(r"(20\d{2}-\d{2}-\d{2}T\d{2}:\d{2})", page)
            if iso:
                when = parse_dt(iso.group(1))
        if when is not None and when.hour == 0 and when.minute == 0:
            when = when.replace(hour=19, minute=0)
        if not title or when is None or not in_range(when, start, end):
            continue
        if not is_concert(title, text, "musik"):
            continue
        key = url + when.strftime("%Y-%m-%d")
        if key in seen:
            continue
        seen.add(key)
        events.append(
            make_event(
                "gotalejon",
                "Göta Lejon",
                title,
                when,
                url,
                place="Göta Lejon",
                image=str(image or ""),
                text=page_blurb(text, page=page),
            )
        )
    return events
