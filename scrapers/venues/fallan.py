from __future__ import annotations

import html
import re
from datetime import datetime

from scrapers.core import http_request, in_range, strip_tags
from scrapers.helpers import is_concert, make_event, parse_en_mdy, page_blurb, pick_image

URL = "https://www.fallan.nu/whats-on"
CARD_RE = re.compile(
    r'href="(/whats-on/[^"]+)" class="link-block-4[^"]*"[\s\S]*?'
    r'h2small-lable">([^<]+)</h2>[\s\S]*?'
    r'dateinfo">([^<]+)</h2>[\s\S]*?'
    r'<img loading="lazy" alt="([^"]*)"[^>]*src="([^"]+)"(?:[^>]*srcset="([^"]+)")?',
    re.I,
)
RICHTEXT_RE = re.compile(r'<div[^>]*class="[^"]*w-richtext[^"]*"[^>]*>([\s\S]*?)</div>', re.I)
NOISE_RE = re.compile(
    r"thank you!? your submission|oops! something went wrong|your submission has been received",
    re.I,
)
BAGS_RE = re.compile(r"(?is)^small bags allowed.{0,120}?(?:\n+| {2,})")


def _title_from_alt(alt: str, href: str) -> str:
    alt = html.unescape(alt or "").strip()
    title = re.sub(r"(?i)^konsert med\s+", "", alt)
    title = re.sub(r"(?i)\s+på fållan.*$", "", title).strip()
    if title and title.lower() not in {"concert", "festival", "club"}:
        return title
    slug = href.rstrip("/").rsplit("/", 1)[-1]
    slug = re.sub(r"-{2,}", " - ", slug)
    return slug.replace("-", " ").strip().title()


def event_text(page: str) -> str:
    for block in RICHTEXT_RE.findall(page or ""):
        raw = strip_tags(block)
        raw = re.sub(r"[\u200b\u200c\u200d\ufeff]", "", raw)
        raw = BAGS_RE.sub("", raw).strip()
        if not raw or NOISE_RE.search(raw):
            continue
        text = page_blurb(raw)
        if text:
            return text
    return page_blurb(page=page)


def fetch(start: datetime, end: datetime) -> list[dict]:
    page = http_request(URL)
    events: list[dict] = []
    seen: set[str] = set()
    for href, kind, date_text, alt, src, srcset in CARD_RE.findall(page):
        if "concert" not in html.unescape(kind).lower():
            continue
        title = _title_from_alt(alt, href)
        when = parse_en_mdy(html.unescape(date_text))
        if when is None:
            continue
        when = when.replace(hour=20, minute=0)
        if not in_range(when, start, end):
            continue
        if not is_concert(title, kind, "konsert"):
            continue
        url = "https://www.fallan.nu" + href
        if url in seen:
            continue
        seen.add(url)
        image = pick_image(srcset, src)
        text = ""
        try:
            detail = http_request(url)
            text = event_text(detail)
            doors = re.search(r"DOORS:\s*(\d{1,2})[.:](\d{2})", detail, re.I)
            if doors:
                time_str = f"{int(doors.group(1)):02d}:{doors.group(2)}"
                when = when.replace(hour=int(time_str[:2]), minute=int(time_str[3:]))
        except Exception:
            pass
        events.append(
            make_event(
                "fallan",
                "Fållan",
                title,
                when,
                url,
                place="Fållan",
                image=image,
                text=text,
            )
        )
    return events
