from __future__ import annotations

from datetime import datetime

from scrapers.core import http_request, in_range, page_media_fields
from scrapers.helpers import is_cancelled, is_concert, jsonld_events, make_event, og_image, page_blurb, parse_dt, pick_image


def fetch_jsonld_site(
    start: datetime,
    end: datetime,
    urls: list[str],
    venue: str,
    slug: str,
    *,
    place: str = "",
    strict: bool = True,
    category: str = "",
) -> list[dict]:
    events: list[dict] = []
    seen: set[str] = set()
    for url in urls:
        try:
            html = http_request(url)
        except Exception:
            continue
        for node in jsonld_events(html):
            title = node.get("name") or ""
            href = node.get("url") or url
            when = parse_dt(node.get("startDate") or "")
            if not title or when is None or not in_range(when, start, end):
                continue
            if is_cancelled(title, node.get("description") or "", str(node.get("eventStatus") or "")):
                continue
            if not is_concert(title, node.get("description") or "", category, strict=strict):
                continue
            key = href + when.strftime("%Y-%m-%d")
            if key in seen:
                continue
            seen.add(key)
            image = pick_image(node.get("image"), og_image(html))
            text = node.get("description") or ""
            detail = ""
            if href.startswith("http") and href.rstrip("/") != url.rstrip("/"):
                try:
                    detail = http_request(href)
                except Exception:
                    detail = ""
            if detail:
                image = pick_image(image, og_image(detail))
                text = page_blurb(text, page=detail)
            event = make_event(
                slug,
                venue,
                title,
                when,
                href,
                place=place or venue,
                image=image,
                text=text,
            )
            event.update(page_media_fields(html[:8000], slug))
            events.append(event)
        if events:
            break
    return events
