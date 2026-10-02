from __future__ import annotations

from datetime import datetime
from urllib.parse import urlparse
import re

from scrapers.core import http_request, in_range
from scrapers.helpers import is_concert, jsonld_events, make_event, page_blurb, parse_dt, pick_image

LIVE_URL = "https://stockholmlive.com/evenemang/musik-show/"
_CACHE: tuple[str, list[dict]] | None = None


def _norm(url: str) -> str:
    parsed = urlparse(url or "")
    host = parsed.netloc.lower().lstrip("www.")
    path = parsed.path.rstrip("/")
    return host + path


def _cards(html: str) -> dict[str, dict[str, str]]:
    out: dict[str, dict[str, str]] = {}
    for part in re.split(r'class="card-event"', html)[1:]:
        href = re.search(r'<a[^>]+href="([^"]+)"', part, re.I)
        if not href:
            continue
        src = re.search(r'<img[^>]+src="([^"]+)"', part, re.I)
        srcset = re.search(r'srcset="([^"]+)"', part, re.I)
        tagline = re.search(r'class="tagline">\s*([^<]+)', part, re.I)
        out[_norm(href.group(1))] = {
            "image": pick_image(src.group(1) if src else "", srcset.group(1) if srcset else ""),
            "text": (tagline.group(1).strip() if tagline else ""),
        }
    return out


def live_events(start: datetime, end: datetime) -> list[dict]:
    global _CACHE
    key = start.strftime("%Y-%m-%d") + end.strftime("%Y-%m-%d")
    if _CACHE and _CACHE[0] == key:
        return _CACHE[1]
    html = http_request(LIVE_URL)
    cards = _cards(html)
    out: list[dict] = []
    seen: set[str] = set()
    for node in jsonld_events(html):
        title = node.get("name") or ""
        url = node.get("url") or ""
        when = parse_dt(node.get("startDate") or "")
        if not title or not url or when is None:
            continue
        if not in_range(when, start, end):
            continue
        if not is_concert(title, category="musik"):
            continue
        ident = urlparse(url).path.rstrip("/")
        if ident in seen:
            continue
        seen.add(ident)
        card = cards.get(_norm(url), {})
        image = pick_image(node.get("image"), card.get("image"))
        location = node.get("location") or {}
        place = ""
        if isinstance(location, dict):
            place = location.get("name") or ""
        out.append(
            {
                "title": title,
                "url": url,
                "when": when,
                "host": urlparse(url).netloc.lower().lstrip("www."),
                "image": image,
                "place": place,
                "text": node.get("description") or card.get("text") or "",
            }
        )
    _CACHE = (key, out)
    return out


def event_text(html: str) -> str:
    match = re.search(r'class="[^"]*single-text-content[^"]*"[^>]*>([\s\S]*?)</div>', html, re.I)
    if not match:
        return ""
    para = re.search(r"<p\b[^>]*>([\s\S]*?)</p>", match.group(1), re.I)
    if not para:
        return ""
    return page_blurb(para.group(1))


def fill_single_text(events: list[dict]) -> list[dict]:
    for event in events:
        url = event.get("url") or ""
        if not url:
            continue
        try:
            page = http_request(url)
        except Exception:
            page = ""
        if not page:
            continue
        blurb = event_text(page)
        if blurb:
            event["text"] = blurb
    return events


def fetch_by_host(
    start: datetime,
    end: datetime,
    host: str,
    venue: str,
    slug: str,
    place: str = "",
) -> list[dict]:
    host = host.lower().lstrip("www.")
    events: list[dict] = []
    for item in live_events(start, end):
        if item["host"] != host:
            continue
        events.append(
            make_event(
                slug,
                venue,
                item["title"],
                item["when"],
                item["url"],
                place=place or item["place"] or venue,
                image=item["image"],
                text=item.get("text") or "",
            )
        )
    return events
