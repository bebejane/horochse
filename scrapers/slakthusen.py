from __future__ import annotations

import html
import json
import re
import urllib.error
import urllib.parse
from datetime import datetime, timedelta

from scrapers.core import (
    TZ,
    MONTHS_SV,
    event_id,
    extract_slakt_text,
    extract_slakt_time,
    http_request,
    in_range,
    local_datetime,
    page_media_fields,
    parse_slakt_listing_date,
    strip_tags,
)
from scrapers.helpers import is_concert


def fetch_slakthusen_venue(
    start: datetime,
    end: datetime,
    path: str,
    stage: str,
    slug: str = "slakthusen",
    parent: str = "Slakthusen",
) -> list[dict]:
    events: list[dict] = []
    today = start
    for page in range(1, 8):
        url = f"https://slakthusen.se/venue/{path}/"
        if page > 1:
            url = f"https://slakthusen.se/venue/{path}/page/{page}/"
        try:
            listing = http_request(url)
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                break
            raise

        items = re.findall(r'<li id="post-(\d+)"[^>]*>(.*?)</li>', listing, re.S)
        if not items:
            break

        page_beyond = True
        for post_id, block in items:
            venue_match = re.search(r'class="stalle">([^<]+)', block)
            venue_name = html.unescape(venue_match.group(1)).strip() if venue_match else ""
            if venue_name.lower().replace(" ", "") not in {stage.lower().replace(" ", ""), path.replace("-", "")}:
                if path.replace("-", "") not in venue_name.lower().replace(" ", ""):
                    continue

            title_match = re.search(r'class="titel">([^<]+)', block)
            day_match = re.search(r'class="dag[^"]*"><p>([^<]+)', block)
            month_match = re.search(r'class="manad"><p>([^<]+)', block)
            href_match = re.search(r'<a href="([^"]+)"', block)
            img_match = re.search(r'<img[^>]+src="([^"]+)"', block)
            if not (title_match and day_match and month_match and href_match):
                continue

            day = parse_slakt_listing_date(day_match.group(1), month_match.group(1), today)
            if day is None:
                continue
            if day.date() > end.date():
                continue
            page_beyond = False
            if not in_range(day, start, end):
                continue

            href = html.unescape(href_match.group(1))
            detail_slug = urllib.parse.urlparse(href).path.strip("/").split("/")[-1]
            detail_html = ""
            try:
                api = http_request(
                    "https://slakthusen.se/wp-json/wp/v2/posts?"
                    + urllib.parse.urlencode({"slug": detail_slug, "_fields": "content,excerpt,title,link"})
                )
                posts = json.loads(api)
                if posts:
                    detail_html = posts[0].get("content", {}).get("rendered") or posts[0].get(
                        "excerpt", {}
                    ).get("rendered", "")
            except Exception:
                try:
                    detail_html = http_request(href)
                except Exception:
                    detail_html = block

            title = html.unescape(title_match.group(1))
            title = re.sub(r"\s*\|\s*" + re.escape(stage) + r"\s*$", "", title, flags=re.I).strip()
            if not is_concert(title, strip_tags(detail_html)):
                continue
            plain = strip_tags(detail_html)
            time_str = extract_slakt_time(plain)
            date_str = day.strftime("%Y-%m-%d")
            events.append(
                {
                    "id": event_id(slug, post_id, date_str),
                    "venue": parent,
                    "venue_slug": slug,
                    "title": title,
                    "date": date_str,
                    "time": time_str,
                    "datetime": local_datetime(date_str, time_str or "20:00").isoformat(),
                    "image": html.unescape(img_match.group(1)) if img_match else "",
                    "text": extract_slakt_text(detail_html),
                    "url": href,
                    "place": stage,
                    **page_media_fields(detail_html + "\n" + block, slug),
                }
            )

        if page_beyond:
            break

    return events
