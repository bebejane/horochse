from __future__ import annotations

import html
import json
import re
from datetime import datetime
from urllib.parse import urlparse

from scrapers.core import (
    MONTHS_EN,
    MONTHS_SV,
    TZ,
    event_id,
    in_range,
    is_cancelled,
    is_club_night,
    local_datetime,
    strip_tags,
    shorten,
)

MONTHS_SV_SHORT = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "maj": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "okt": 10, "nov": 11, "dec": 12,
}

MONTHS_EN_SHORT = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

NON_CONCERT = re.compile(
    r"\b("
    r"teater|pjäs|pjas|föreställning|forestallning|musikal|standup|stand-up|"
    r"komedi|comedy|humor|föredrag|foredrag|bokrelease|boksamtal|bokcirkel|"
    r"afterwork|after[\s-]?work|efter jobbet|brunch|konferens|hockey|fotboll|innebandy|"
    r"sport\b|match\b|utställning|utstallning|vernissage|burlesque|krogshow|julshow|"
    r"cirkusshow|after[\s-]?party|klubbkväll|klubbkvall|\baw\b|out of office"
    r")\b",
    re.I,
)
YES_CONCERT = re.compile(
    r"\b("
    r"konsert|concert|live|jazz|gig|turné|turne|tour|orkester|filharmon|"
    r"symphony|recital|kör\b|kor\b|opera|choir|band|spelar|releasekonsert"
    r")\b",
    re.I,
)


def fold(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(value or "")).strip()


def pick_image(*values) -> str:
    for value in values:
        if isinstance(value, list):
            url = pick_image(*value)
        elif isinstance(value, dict):
            url = pick_image(value.get("url"), value.get("contentUrl"), value.get("src"))
        else:
            raw = html.unescape(str(value or "")).strip()
            if "," in raw and " " in raw and re.search(r"\s\d+w\b", raw):
                url = pick_srcset(raw)
            else:
                url = raw
        if url.startswith("//"):
            url = "https:" + url
        if (
            url.startswith("http")
            and "{image}" not in url
            and not re.search(r"\.(svg)(?:$|\?)", url, re.I)
            and not re.search(r"facebook\.com/tr\b|google-analytics|doubleclick|/pixel\.", url, re.I)
        ):
            return url.split(" ")[0]
    return ""


def pick_srcset(srcset: str) -> str:
    best = ""
    best_w = -1
    for part in (srcset or "").split(","):
        bits = part.strip().rsplit(" ", 1)
        url = html.unescape((bits[0] if bits else "").strip())
        if url.startswith("//"):
            url = "https:" + url
        if not url.startswith("http") or "{image}" in url:
            continue
        if re.search(r"\.(svg)(?:$|\?)", url, re.I):
            continue
        width = 0
        if len(bits) == 2 and bits[1].endswith("w"):
            try:
                width = int(bits[1][:-1])
            except ValueError:
                width = 0
        score = width or 1
        target = abs(score - 800) if width else 10_000
        current = abs(best_w - 800) if best_w > 0 else 20_000
        if not best or target < current:
            best = url.split(" ")[0]
            best_w = width or 1
    return best


def og_image(page: str) -> str:
    for pattern in (
        r'<meta[^>]+property=["\']og:image(?::url)?["\'][^>]+content=["\']([^"\']+)',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image(?::url)?["\']',
        r'<meta[^>]+name=["\']twitter:image(?::src)?["\'][^>]+content=["\']([^"\']+)',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']twitter:image(?::src)?["\']',
    ):
        match = re.search(pattern, page or "", re.I)
        if match:
            url = pick_image(match.group(1))
            if url:
                return url
    return ""


def wp_featured_url(origin: str, media_id) -> str:
    from scrapers.core import http_request

    try:
        mid = int(media_id or 0)
    except (TypeError, ValueError):
        return ""
    if not mid:
        return ""
    try:
        data = json.loads(http_request(origin.rstrip("/") + f"/wp-json/wp/v2/media/{mid}"))
    except Exception:
        return ""
    return pick_image(data.get("source_url") or "")


def is_concert(title: str, text: str = "", category: str = "", strict: bool = False) -> bool:
    title = fold(title)
    text = fold(text)
    category = fold(category)
    if not title:
        return False
    if is_club_night(title, text):
        return False
    if is_cancelled(title, text):
        return False
    blob = f"{title} {text} {category}"
    cat = category.lower()
    if "sport" in cat:
        return False
    if re.search(r"humor|samtal", cat) and "musik" not in cat:
        return False
    if NON_CONCERT.search(title) and not YES_CONCERT.search(title):
        return False
    if strict and not YES_CONCERT.search(blob) and "musik" not in cat:
        return False
    return True


def og_description(page: str) -> str:
    for pattern in (
        r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']+)',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:description["\']',
        r'<meta[^>]+name=["\']twitter:description["\'][^>]+content=["\']([^"\']+)',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']twitter:description["\']',
        r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']description["\']',
    ):
        match = re.search(pattern, page or "", re.I)
        if match:
            text = fold(html.unescape(match.group(1)))
            if len(text) >= 24:
                return text
    return ""


def page_blurb(*values, page: str = "") -> str:
    extras: list[str] = []
    if page:
        extras.append(og_description(page))
        for node in jsonld_events(page):
            extras.append(str(node.get("description") or ""))
    for value in (*values, *extras):
        text = shorten(strip_tags(str(value or "")))
        if len(text) >= 24:
            return text
    return ""


def parse_sv_when(text: str, year: int | None = None) -> datetime | None:
    text = fold(text)
    months = "|".join(MONTHS_SV)
    match = re.search(
        rf"(\d{{1,2}})\s+({months})(?:\s+(20\d{{2}}))?(?:.*?(\d{{1,2}})[:.](\d{{2}}))?",
        text,
        re.I,
    )
    hour, minute = 19, 0
    if match:
        month = MONTHS_SV[match.group(2).lower()]
        yr = int(match.group(3) or 0) or year or datetime.now(TZ).year
        if match.group(4):
            hour, minute = int(match.group(4)), int(match.group(5))
        return datetime(yr, month, int(match.group(1)), hour, minute, tzinfo=TZ)
    match = re.search(
        r"(\d{1,2})\s+(jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec)\.?"
        r"(?:\s+(20\d{2}))?(?:.*?(\d{1,2})[.:](\d{2}))?",
        text,
        re.I,
    )
    if not match:
        return None
    month = MONTHS_SV_SHORT[match.group(2).lower()[:3]]
    yr = int(match.group(3) or 0) or year or datetime.now(TZ).year
    if match.group(4):
        hour, minute = int(match.group(4)), int(match.group(5))
    return datetime(yr, month, int(match.group(1)), hour, minute, tzinfo=TZ)


def parse_dt(raw: str) -> datetime | None:
    raw = (raw or "").strip()
    if not raw:
        return None
    raw = raw.replace("Z", "+00:00")
    if re.match(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}", raw):
        raw = raw.replace(" ", "T", 1)
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        match = re.match(r"(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})", raw)
        if not match:
            return None
        dt = datetime.fromisoformat(match.group(1) + "T" + match.group(2))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=TZ)
    return dt.astimezone(TZ)


def parse_en_mdy(text: str) -> datetime | None:
    match = re.search(r"\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(20\d{2})", text)
    if not match:
        return None
    month_raw = match.group(1).lower()
    month = MONTHS_EN.get(month_raw) or MONTHS_EN_SHORT.get(month_raw[:3])
    if not month:
        return None
    return datetime(int(match.group(3)), month, int(match.group(2)), tzinfo=TZ)


def make_event(
    slug: str,
    venue: str,
    title: str,
    when: datetime,
    url: str,
    *,
    place: str = "",
    image: str = "",
    text: str = "",
    extra_id: str = "",
) -> dict:
    date_str = when.strftime("%Y-%m-%d")
    time_str = when.strftime("%H:%M")
    ident = extra_id or urlparse(url).path.strip("/") or title
    return {
        "id": event_id(slug, ident, date_str),
        "venue": venue,
        "venue_slug": slug,
        "title": fold(title),
        "date": date_str,
        "time": time_str,
        "datetime": when.isoformat(),
        "image": image or "",
        "text": shorten(strip_tags(text)) if text else "",
        "url": url,
        "place": place or venue,
    }


def walk_jsonld(node):
    if isinstance(node, list):
        for item in node:
            yield from walk_jsonld(item)
        return
    if not isinstance(node, dict):
        return
    types = node.get("@type")
    if isinstance(types, list):
        types = " ".join(str(t) for t in types)
    types = str(types or "")
    if types.endswith("Event") or types == "Event":
        yield node
    for key in ("@graph", "itemListElement", "item", "subEvent"):
        if key in node:
            yield from walk_jsonld(node[key])


def jsonld_events(html: str) -> list[dict]:
    found: list[dict] = []
    for match in re.finditer(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html,
        re.S | re.I,
    ):
        try:
            payload = json.loads(match.group(1))
        except json.JSONDecodeError:
            continue
        found.extend(
            node
            for node in walk_jsonld(payload)
            if not is_cancelled(
                node.get("name") or node.get("title") or "",
                node.get("description") or "",
                str(node.get("eventStatus") or ""),
            )
        )
    return found
