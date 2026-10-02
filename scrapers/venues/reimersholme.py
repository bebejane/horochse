from __future__ import annotations

import html
import json
import re
from datetime import datetime

from scrapers.core import http_request, in_range, page_media_fields
from scrapers.helpers import is_concert, make_event, page_blurb, parse_sv_when, pick_image, wp_featured_url

LIST_URL = "https://reimersholmehotel.se/evenemang/"
API_URL = "https://reimersholmehotel.se/wp-json/wp/v2/event?per_page=100"
CARD_RE = re.compile(
    r'href="(https://reimersholmehotel\.se/event/[^"]+)" class="wp-block-getwid-template-post-title__link" title="([^"]+)"[\s\S]*?'
    r'class="doorsopen">([^<]+)</p>',
    re.I,
)


def fetch(start: datetime, end: datetime) -> list[dict]:
    listing = http_request(LIST_URL)
    posts = {post.get("link", "").rstrip("/"): post for post in json.loads(http_request(API_URL))}
    events: list[dict] = []
    seen: set[str] = set()
    for href, title, doors in CARD_RE.findall(listing):
        title = html.unescape(title).strip()
        when = parse_sv_when(html.unescape(doors), start.year)
        if when is None or not in_range(when, start, end):
            continue
        if not is_concert(title, "live", "live"):
            continue
        url = href.rstrip("/")
        if url in seen:
            continue
        seen.add(url)
        post = posts.get(url) or posts.get(url + "/") or {}
        content = (post.get("content") or {}).get("rendered") or ""
        image = wp_featured_url("https://reimersholmehotel.se", post.get("featured_media"))
        listing_img = re.search(
            rf'href="{re.escape(href)}"[\s\S]{{0,200}}?<img[^>]+src="([^"]+)"',
            listing,
        )
        image = pick_image(image, listing_img.group(1) if listing_img else "")
        event = make_event(
            "reimersholme",
            "Reimersholme Hotel",
            title,
            when,
            href,
            place="Reimersholme Hotel",
            image=image,
            text=page_blurb(content),
            extra_id=str(post.get("id") or title),
        )
        event.update(page_media_fields(content, "reimersholme"))
        events.append(event)
    return events
