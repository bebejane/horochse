from __future__ import annotations

import json
import re
from datetime import datetime

from scrapers.core import http_request, in_range
from scrapers.helpers import is_cancelled, is_concert, make_event, page_blurb, parse_dt


def rich_text(node) -> str:
    if isinstance(node, str):
        return node.strip()
    if not isinstance(node, dict):
        return ""
    parts: list[str] = []
    for child in node.get("content") or []:
        if child.get("type") == "text":
            parts.append(child.get("text") or "")
        else:
            parts.append(rich_text(child))
    return re.sub(r"\s+", " ", " ".join(parts)).strip()


def walk(node, found: list):
    if isinstance(node, list):
        for item in node:
            walk(item, found)
        return
    if not isinstance(node, dict):
        return
    if node.get("component") == "artistCard":
        found.append(node)
        return
    for value in node.values():
        walk(value, found)


def fetch(start: datetime, end: datetime) -> list[dict]:
    html = http_request("https://www.nalen.com/sv/konserter-event")
    match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.S)
    if not match:
        return []
    data = json.loads(match.group(1))
    cards: list[dict] = []
    walk(data.get("props", {}).get("pageProps", {}).get("blocks") or [], cards)
    events: list[dict] = []
    seen: set[str] = set()
    for card in cards:
        title = rich_text(card.get("artistName")) or ""
        guest = rich_text(card.get("sideKickName"))
        if guest:
            title = f"{title} + {guest}" if title else guest
        when = parse_dt(str(card.get("startDate") or "").replace(" ", "T"))
        if not title or when is None or not in_range(when, start, end):
            continue
        info = rich_text(card.get("info"))
        blob = f"{info} {title}"
        if re.search(r"afterwork|efter jobbet|brunch|burlesque|utställning|vernissage|restaurangen", blob, re.I):
            continue
        if is_cancelled(title, info) or not is_concert(title, blob):
            continue
        path = card.get("artistPageUrl") or {}
        href = (path.get("cached_url") or path.get("url") or "").strip()
        if href and not href.startswith("http"):
            href = "https://www.nalen.com/" + href.lstrip("/")
        if not href:
            href = "https://www.nalen.com/sv/konserter-event"
        image = ((card.get("image") or {}).get("filename") or "")
        key = title.lower() + when.isoformat()
        if key in seen:
            continue
        seen.add(key)
        text = info
        if href and href.rstrip("/") != "https://www.nalen.com/sv/konserter-event":
            try:
                text = page_blurb(text, page=http_request(href))
            except Exception:
                pass
        events.append(
            make_event(
                "nalen",
                "Nalen",
                title,
                when,
                href,
                image=image,
                text=text,
                extra_id=card.get("_uid") or title,
            )
        )
    return events
