from __future__ import annotations

import re
import time
import unicodedata
import urllib.error
from datetime import datetime

from scrapers.core import http_request, shorten, strip_tags
from scrapers.helpers import page_blurb
from scrapers.ticketmaster import fetch_ticketmaster_venue

URL = "https://www.ticketmaster.se/venue/cirkus-stockholm-biljetter/cir/580"
LIST_URL = "https://cirkus.se/sv/evenemang/konsert/"
SHOW_URL = "https://cirkus.se/sv/evenemang/{slug}/"
SHOW_EN_URL = "https://cirkus.se/en/shows/{slug}/"
NOISE_RE = re.compile(
    r"^(med reservation|rullstolsplats|wheelchair|subject to|denna dag öppnar|"
    r"arrangor|arrangör|organizer|age limit|åldersgräns|duration|längd)",
    re.I,
)


def slugify(title: str) -> str:
    text = unicodedata.normalize("NFKD", title or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower()
    text = re.sub(r"[&+/]+", " ", text)
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text


def fetch_html(url: str) -> str:
    for attempt in range(4):
        try:
            return http_request(
                url,
                extra_headers={
                    "Accept": "text/html,application/xhtml+xml",
                    "Referer": "https://cirkus.se/sv/evenemang/",
                },
            )
        except urllib.error.HTTPError as exc:
            if exc.code == 429 and attempt < 3:
                time.sleep(6 * (attempt + 1))
                continue
            return ""
        except Exception:
            return ""
    return ""


def headingish(text: str) -> bool:
    letters = [ch for ch in text if ch.isalpha()]
    if len(letters) < 8:
        return False
    upper = sum(1 for ch in letters if ch.isupper())
    return upper / len(letters) > 0.82 and len(text) < 140


def event_text(html: str) -> str:
    match = re.search(
        r"(?:Om showen|About the show)([\s\S]{0,8000}?)(?:<h2\b|DATUM|DATES)",
        html,
        re.I,
    )
    chunk = match.group(1) if match else html
    paras: list[str] = []
    for para in re.findall(r"<p\b[^>]*>([\s\S]*?)</p>", chunk, re.I):
        text = shorten(strip_tags(para), limit=10_000)
        if len(text) < 40 or NOISE_RE.search(text) or headingish(text):
            continue
        paras.append(text)
        if sum(len(item) for item in paras) >= 220:
            break
    return page_blurb("\n".join(paras), page=html)


def listing_urls(html: str) -> dict[str, str]:
    found: dict[str, str] = {}
    for href in re.findall(r'href="((?:https://cirkus\.se)?/sv/evenemang/[^"#?]+/)"', html, re.I):
        if "/page/" in href or href.rstrip("/").endswith("/evenemang") or href.rstrip("/").endswith("/konsert"):
            continue
        url = href if href.startswith("http") else "https://cirkus.se" + href
        slug = url.rstrip("/").rsplit("/", 1)[-1]
        if slug:
            found[slug] = url
    return found


def show_page(slug: str, pages: dict[str, str]) -> str:
    for url in (pages.get(slug), SHOW_URL.format(slug=slug), SHOW_EN_URL.format(slug=slug)):
        if not url:
            continue
        page = fetch_html(url)
        time.sleep(1.2)
        if page:
            return page
    return ""


def fetch(start: datetime, end: datetime) -> list[dict]:
    events = fetch_ticketmaster_venue(
        start,
        end,
        URL,
        "Cirkus",
        "cirkus",
        place="Cirkus",
    )
    pages = listing_urls(fetch_html(LIST_URL))
    time.sleep(1.2)
    for event in events:
        slug = slugify(event.get("title") or "")
        if not slug:
            continue
        page = show_page(slug, pages)
        if not page:
            continue
        blurb = event_text(page)
        if blurb:
            event["text"] = blurb
    return events
