from datetime import datetime
import re

from scrapers.core import http_request, shorten, strip_tags
from scrapers.live import fetch_by_host

BOILERPLATE = re.compile(
    r"markis|värmelampor|välkommen att beställa|så länge vädret|ons[–-]fre från|dörrar:|konsertstart",
    re.I,
)


def re_search_kagel(value: str) -> bool:
    return bool(re.search(r"k[äa]gelbanan", value, re.I))


def event_text(html: str) -> str:
    match = re.search(r'class="single-text-content"[^>]*>([\s\S]*?)</div>', html, re.I)
    if not match:
        return ""
    text = shorten(strip_tags(match.group(1)))
    if len(text) < 24 or BOILERPLATE.search(text):
        return ""
    return text


def event_place(html: str) -> str:
    match = re.search(r"<strong>\s*Scen\s*</strong>\s*([^<]+)", html, re.I)
    if match:
        return match.group(1).strip()
    return ""


def fetch(start: datetime, end: datetime) -> list[dict]:
    events = fetch_by_host(start, end, "sodrateatern.com", "Södra Teatern", "sodrateatern")
    for event in events:
        url = event.get("url") or ""
        text = (event.get("text") or "").strip()
        if url and len(text) < 40:
            try:
                page = http_request(url)
            except Exception:
                page = ""
            if page:
                blurb = event_text(page)
                if blurb:
                    event["text"] = blurb
                place = event_place(page)
                if place:
                    event["place"] = place
        if re_search_kagel(url) or re_search_kagel(event.get("title") or "") or re_search_kagel(event.get("place") or ""):
            event["place"] = "Kägelbanan"
        elif not event.get("place"):
            event["place"] = "Södra Teatern"
    return events
