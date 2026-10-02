from __future__ import annotations

import json
import re
from datetime import datetime
from urllib.parse import urljoin

from scrapers.core import http_request, in_range
from scrapers.helpers import is_concert, make_event, parse_dt, pick_image, page_blurb

URL = "https://www.berwaldhallen.se/program-och-biljetter"
SKIP = re.compile(r"streetstar|dance school|danceschool|samtal", re.I)
PUSH_RE = re.compile(r'self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)')


def _flight_blob(page: str) -> str:
    chunks: list[str] = []
    for raw in PUSH_RE.findall(page or ""):
        try:
            chunks.append(json.loads('"' + raw.replace("\n", "\\n") + '"'))
        except json.JSONDecodeError:
            continue
    return "\n".join(chunks)


def _json_object(blob: str, start: int) -> dict | None:
    depth = 0
    in_str = False
    esc = False
    for index, char in enumerate(blob[start:], start):
        if in_str:
            if esc:
                esc = False
            elif char == "\\":
                esc = True
            elif char == '"':
                in_str = False
            continue
        if char == '"':
            in_str = True
            continue
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                try:
                    node = json.loads(blob[start : index + 1])
                except json.JSONDecodeError:
                    return None
                return node if isinstance(node, dict) else None
    return None


def _productions(blob: str) -> list[dict]:
    found: list[dict] = []
    seen: set[int] = set()
    for match in re.finditer(r'\{"post_id":', blob):
        node = _json_object(blob, match.start())
        if not node or node.get("post_type") != "production":
            continue
        post_id = node.get("post_id")
        if post_id in seen:
            continue
        seen.add(post_id)
        found.append(node)
    return found


def fetch(start: datetime, end: datetime) -> list[dict]:
    page = http_request(URL)
    events: list[dict] = []
    seen: set[str] = set()
    for production in _productions(_flight_blob(page)):
        href = urljoin(URL, str(production.get("url") or ""))
        title = str(production.get("post_title") or production.get("list_subtitle") or "").strip()
        image = pick_image((production.get("featured_image") or {}).get("src"))
        text = page_blurb(
            production.get("description") or "",
            production.get("preamble") or "",
        )
        venue_name = ((production.get("venue_info") or {}).get("name") or "Berwaldhallen").strip()
        shows = production.get("events") or []
        if not shows and production.get("next_event_date"):
            shows = [{"date": production.get("next_event_date"), "name": title}]
        for show in shows:
            if not isinstance(show, dict):
                continue
            name = str(show.get("name") or title).strip() or title
            if SKIP.search(name) or SKIP.search(title):
                continue
            when = parse_dt(str(show.get("date") or ""))
            if when is None or not in_range(when, start, end):
                continue
            if not is_concert(name, text, "konsert"):
                continue
            key = href + when.strftime("%Y-%m-%d%H:%M")
            if key in seen:
                continue
            seen.add(key)
            events.append(
                make_event(
                    "berwaldhallen",
                    "Berwaldhallen",
                    name,
                    when,
                    href,
                    place=venue_name,
                    image=image,
                    text=text,
                    extra_id=href.rstrip("/").rsplit("/", 1)[-1] + "-" + when.strftime("%H%M"),
                )
            )
    return events
