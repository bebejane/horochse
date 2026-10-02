#!/usr/bin/env python3
"""Hämta konserter för de kommande fem veckorna från Fasching, Slaktkyrkan, Kulturhuset, Fylkingen, Rönnells och Larry's Corner.

Kör: python3 fetch.py
"""

from __future__ import annotations

import html
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "public" / "data" / "events.json"
TZ = ZoneInfo("Europe/Stockholm")
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
)
WEEKS = 5
WEEK_DAYS = WEEKS * 7
MONTHS_SV = {
    "januari": 1,
    "februari": 2,
    "mars": 3,
    "april": 4,
    "maj": 5,
    "juni": 6,
    "juli": 7,
    "augusti": 8,
    "september": 9,
    "oktober": 10,
    "november": 11,
    "december": 12,
}
MONTHS_EN = {
    "january": 1,
    "february": 2,
    "march": 3,
    "april": 4,
    "may": 5,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
}


def now_sthlm() -> datetime:
    return datetime.now(TZ)


def week_monday(day: datetime) -> datetime:
    start = day.replace(hour=0, minute=0, second=0, microsecond=0)
    return start - timedelta(days=start.weekday())


def week_sunday(day: datetime) -> datetime:
    monday = week_monday(day)
    return monday + timedelta(days=6, hours=23, minutes=59, seconds=59)


def week_bounds(today: datetime | None = None) -> tuple[datetime, datetime]:
    today = (today or now_sthlm()).replace(hour=0, minute=0, second=0, microsecond=0)
    start = week_monday(today)
    end = week_sunday(start + timedelta(weeks=WEEKS - 1))
    return start, end


def http_request(
    url: str,
    data: bytes | None = None,
    content_type: str | None = None,
    extra_headers: dict | None = None,
) -> str:
    headers = {"User-Agent": UA, "Accept": "*/*"}
    if extra_headers:
        headers.update(extra_headers)
    if data is not None:
        headers["Content-Type"] = content_type or "application/x-www-form-urlencoded"
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.read().decode("utf-8", errors="replace")


def http_json(url: str, payload: dict) -> dict:
    body = json.dumps(payload).encode()
    headers = {
        "User-Agent": UA,
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Referer": "https://bandcamp.com/",
    }
    last_error: Exception | None = None
    for attempt in range(4):
        req = urllib.request.Request(url, data=body, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                return json.loads(res.read().decode("utf-8", errors="replace"))
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code != 429 or attempt == 3:
                raise
            time.sleep(8 * (attempt + 1))
    raise last_error or RuntimeError("http_json failed")


def strip_tags(raw: str) -> str:
    text = re.sub(r"(?i)<br\s*/?>", "\n", raw)
    text = re.sub(r"(?i)</p>", "\n", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    text = re.sub(r"\u00a0", " ", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n+", "\n", text)
    return text.strip()


def shorten(text: str, limit: int = 220) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    cut = text[: limit + 1]
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0]
    return cut.rstrip(".,;: ") + "…"


def in_range(day: datetime, start: datetime, end: datetime) -> bool:
    return start.date() <= day.date() <= end.date()


def event_id(*parts: object) -> str:
    raw = "-".join(str(p) for p in parts)
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", raw).strip("-").lower()
    return slug[:80]


def local_datetime(date_str: str, time_str: str) -> datetime:
    hour, minute = (time_str or "20:00").split(":")[:2]
    return datetime(
        int(date_str[0:4]),
        int(date_str[5:7]),
        int(date_str[8:10]),
        int(hour),
        int(minute),
        tzinfo=TZ,
    )


def parse_fasching_language_id(page_html: str) -> str:
    match = re.search(r"window\.currentLanguage\s*=\s*'(\d+)'", page_html)
    return match.group(1) if match else "96"


def fetch_fasching(start: datetime, end: datetime) -> list[dict]:
    kal = http_request("https://www.fasching.se/kalendarium/")
    lang = parse_fasching_language_id(kal)
    events: list[dict] = []
    offset = 0
    limit = 24
    seen: set[tuple[str, str, str]] = set()

    while True:
        payload = urllib.parse.urlencode(
            [
                ("action", "fm_ajax_query"),
                ("orderby", "calendar"),
                ("curdate", start.strftime("%Y-%m-%d")),
                ("limit", str(limit)),
                ("offset", str(offset)),
                ("year", "0"),
                ("month", "0"),
                ("day", "0"),
                ("search", ""),
                ("view", "default"),
                ("terms[]", lang),
            ]
        ).encode()
        chunk = http_request("https://www.fasching.se/wp-admin/admin-ajax.php", data=payload)
        cards = list(
            re.finditer(
                r'<li id="(?P<id>[^"]+)" class="card[^"]*"\s+'
                r'data-date="(?P<date>[^"]+)" data-date-end="(?P<end>[^"]+)"\s+'
                r'data-time="(?P<time>[^"]+)"[^>]*>(?P<body>.*?)</li>',
                chunk,
                re.S,
            )
        )
        if not cards:
            break

        reached_past_week = False
        for card in cards:
            day = datetime.strptime(card.group("date"), "%Y-%m-%d").replace(tzinfo=TZ)
            if day.date() > end.date():
                reached_past_week = True
                continue
            if not in_range(day, start, end):
                continue

            body = card.group("body")
            href_match = re.search(r'<a href="(https://www\.fasching\.se/[^"]+)"', body)
            title_match = re.search(r'<h2 class="card__title h3">([^<]+)</h2>', body)
            img_match = re.search(r'<img[^>]+src="([^"]+)"', body)
            desc_match = re.search(r'<h2 class="card__title h3">[^<]+</h2>\s*<p>(.*?)</p>', body, re.S)
            if not href_match or not title_match:
                continue
            url = html.unescape(href_match.group(1))
            if "/en/" in url:
                continue

            title = html.unescape(title_match.group(1)).strip()
            time_str = card.group("time").strip()
            key = (card.group("date"), time_str, title.lower())
            if key in seen:
                continue
            seen.add(key)

            events.append(
                {
                    "id": event_id("fasching", card.group("id")),
                    "venue": "Fasching",
                    "venue_slug": "fasching",
                    "title": title,
                    "date": card.group("date"),
                    "time": time_str,
                    "datetime": local_datetime(card.group("date"), time_str).isoformat(),
                    "image": html.unescape(img_match.group(1)) if img_match else "",
                    "text": shorten(strip_tags(desc_match.group(1))) if desc_match else "",
                    "url": url,
                    "place": "Fasching",
                }
            )

        if len(cards) < limit or reached_past_week:
            break
        offset += limit
        if offset > 240:
            break

    return events


def parse_slakt_listing_date(day_text: str, month_text: str, today: datetime) -> datetime | None:
    try:
        day_n = int(day_text)
        month_n = MONTHS_SV[month_text.strip().lower()]
    except (ValueError, KeyError):
        return None
    year = today.year
    candidate = datetime(year, month_n, day_n, tzinfo=TZ)
    if candidate.date() < (today.date() - timedelta(days=2)):
        candidate = datetime(year + 1, month_n, day_n, tzinfo=TZ)
    return candidate


def extract_slakt_time(text: str) -> str:
    patterns = [
        r"Live från:\s*(?:ca\s*)?(?:kl\.?\s*)?(\d{1,2})[.:](\d{2})",
        r"Insläpp:\s*(?:ca\s*)?(?:kl\.?\s*)?(\d{1,2})[.:](\d{2})",
        r"Dörr(?:arna|ar)?\s*(?:öppnar)?\s*(?:kl\.?\s*)?(\d{1,2})[.:](\d{2})",
        r"öppnar\s+kl\.?\s*(\d{1,2})[.:](\d{2})",
        r"kl\.?\s*(\d{1,2})[.:](\d{2})",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.I)
        if match:
            return f"{int(match.group(1)):02d}:{match.group(2)}"
    return ""


def extract_slakt_text(raw_html: str) -> str:
    text = strip_tags(raw_html)
    skip = re.compile(
        r"^(band|datum|insläpp|live från|lokal|åldersgräns|dörrar|doors)\b",
        re.I,
    )
    parts = [p.strip() for p in re.split(r"\n+", text) if p.strip()]
    kept: list[str] = []
    for part in parts:
        chunk = part
        chunk = re.sub(
            r"(Band|Datum|Insläpp|Live från|Lokal|Åldersgräns)\s*:\s*[^\n]+",
            " ",
            chunk,
            flags=re.I,
        )
        chunk = re.sub(r"\s+", " ", chunk).strip(" -–—")
        if not chunk or skip.match(chunk) or len(chunk) < 40:
            continue
        kept.append(chunk)
        if sum(len(x) for x in kept) > 80:
            break
    return shorten(" ".join(kept) if kept else text)


def fetch_slaktkyrkan(start: datetime, end: datetime) -> list[dict]:
    events: list[dict] = []
    today = start
    for page in range(1, 8):
        url = "https://slakthusen.se/venue/slaktkyrkan/"
        if page > 1:
            url = f"https://slakthusen.se/venue/slaktkyrkan/page/{page}/"
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
            if venue_name.lower() != "slaktkyrkan":
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
            slug = urllib.parse.urlparse(href).path.strip("/").split("/")[-1]
            detail_html = ""
            try:
                api = http_request(
                    "https://slakthusen.se/wp-json/wp/v2/posts?"
                    + urllib.parse.urlencode({"slug": slug, "_fields": "content,excerpt,title,link"})
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

            plain = strip_tags(detail_html)
            time_str = extract_slakt_time(plain)
            title = html.unescape(title_match.group(1)).replace(" | Slaktkyrkan", "").strip()
            date_str = day.strftime("%Y-%m-%d")
            events.append(
                {
                    "id": event_id("slaktkyrkan", post_id, date_str),
                    "venue": "Slaktkyrkan",
                    "venue_slug": "slaktkyrkan",
                    "title": title,
                    "date": date_str,
                    "time": time_str,
                    "datetime": local_datetime(date_str, time_str or "20:00").isoformat(),
                    "image": html.unescape(img_match.group(1)) if img_match else "",
                    "text": extract_slakt_text(detail_html),
                    "url": href,
                    "place": "Slaktkyrkan",
                    **page_media_fields(detail_html + "\n" + block, "slaktkyrkan"),
                }
            )

        if page_beyond:
            break

    return events


def fetch_kulturhuset(start: datetime, end: datetime) -> list[dict]:
    query = {
        "size": 80,
        "sort": [{"tixStartDate": "asc"}],
        "query": {
            "bool": {
                "must": [
                    {
                        "range": {
                            "tixStartDate": {
                                "gte": start.isoformat(),
                                "lte": end.isoformat(),
                            }
                        }
                    },
                    {
                        "nested": {
                            "path": "drupalCategory",
                            "query": {"term": {"drupalCategory.label.keyword": "Konserter"}},
                        }
                    },
                ]
            }
        },
    }
    raw = http_request(
        "https://elastic.kulturhusetstadsteatern.se/khst-events/_search",
        data=json.dumps(query).encode(),
        content_type="application/json",
    )
    payload = json.loads(raw)
    events: list[dict] = []
    seen: set[str] = set()

    for hit in payload.get("hits", {}).get("hits", []):
        source = hit.get("_source") or {}
        locations = [item.get("label") for item in source.get("drupalLocation") or []]
        if "Sergels torg" not in locations:
            continue

        start_raw = source.get("tixStartDate") or ""
        try:
            when = datetime.fromisoformat(start_raw)
        except ValueError:
            continue
        if when.tzinfo is None:
            when = when.replace(tzinfo=TZ)
        when = when.astimezone(TZ)
        if not in_range(when, start, end):
            continue

        title = (source.get("drupalTitle") or source.get("tixName") or "").strip()
        url = source.get("drupalLink") or ""
        images = source.get("drupalHeroImage") or []
        leads = source.get("drupalLeadText") or []
        rooms = [label for label in locations if label and label != "Sergels torg"]
        key = f"{when.isoformat()}|{title}|{url}"
        if key in seen:
            continue
        seen.add(key)

        events.append(
            {
                "id": event_id("kulturhuset", source.get("tixEventId") or hit.get("_id"), when.strftime("%Y%m%d%H%M")),
                "venue": "Kulturhuset",
                "venue_slug": "kulturhuset",
                "title": title,
                "date": when.strftime("%Y-%m-%d"),
                "time": when.strftime("%H:%M"),
                "datetime": when.isoformat(),
                "image": images[0].get("src") if images else "",
                "text": shorten(strip_tags(leads[0].get("value") if leads else "")),
                "url": url,
                "place": rooms[0] if rooms else "Kulturhuset",
            }
        )

    return events


def parse_en_date(text: str) -> datetime | None:
    match = re.search(r"(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})", text)
    if not match:
        return None
    month = MONTHS_EN.get(match.group(2).lower())
    if not month:
        return None
    return datetime(int(match.group(3)), month, int(match.group(1)), tzinfo=TZ)


def extract_fylkingen_text(page_html: str, title: str) -> str:
    match = re.search(r'<meta name="description" content="([^"]*)"', page_html)
    if not match:
        match = re.search(r'<meta property="og:description" content="([^"]*)"', page_html)
    if not match:
        return ""
    raw = html.unescape(match.group(1)).replace("\\n", "\n")
    paras = [re.sub(r"\s+", " ", part).strip() for part in re.split(r"\n+", raw) if part.strip()]
    title_cmp = re.sub(r"\s+", " ", title).strip(" .").lower()
    for para in paras:
        compact = para.strip(" .").lower()
        if len(para) < 55 and (compact in title_cmp or title_cmp in compact):
            continue
        if len(para) < 40:
            continue
        return shorten(para)
    return shorten(paras[0]) if paras else ""


def fetch_fylkingen(start: datetime, end: datetime) -> list[dict]:
    listing = http_request("https://www.fylkingen.se/sv/events")
    events: list[dict] = []
    seen: set[str] = set()

    for part in listing.split('href="/sv/events/')[1:]:
        slug = part.split("#")[0].split('"')[0].strip("/")
        if not slug or slug in seen:
            continue
        seen.add(slug)

        title_match = re.search(r"<h2[^>]*>(.*?)</h2>", part, re.S)
        if not title_match:
            continue
        title = html.unescape(re.sub(r"<[^>]+>", "", title_match.group(1))).strip()
        spans = re.findall(r"<span>([^<]+)</span>", part[:2500])
        date_span = next((span for span in spans if parse_en_date(span)), "")
        time_span = next((span for span in spans if re.fullmatch(r"\d{1,2}:\d{2}", span.strip())), "")
        day = parse_en_date(date_span)
        if day is None or not in_range(day, start, end):
            continue

        url = "https://www.fylkingen.se/sv/events/" + slug
        image = ""
        text = ""
        try:
            page = http_request(url)
        except Exception:
            page = ""
        if page:
            img_match = re.search(r'<meta property="og:image" content="([^"]+)"', page)
            if img_match:
                image = html.unescape(img_match.group(1))
            text = extract_fylkingen_text(page, title)

        date_str = day.strftime("%Y-%m-%d")
        time_str = time_span.strip()
        events.append(
            {
                "id": event_id("fylkingen", slug, date_str),
                "venue": "Fylkingen",
                "venue_slug": "fylkingen",
                "title": title,
                "date": date_str,
                "time": time_str,
                "datetime": local_datetime(date_str, time_str or "19:00").isoformat(),
                "image": image,
                "text": text,
                "url": url,
                "place": "Fylkingen",
                **page_media_fields(page, "fylkingen"),
            }
        )

    return events


def parse_sv_full_date(text: str) -> datetime | None:
    match = re.search(r"(\d{1,2})\s+([a-zåäö]+)\s+(20\d{2})", text.lower())
    if not match:
        return None
    month = MONTHS_SV.get(match.group(2))
    if not month:
        return None
    return datetime(int(match.group(3)), month, int(match.group(1)), tzinfo=TZ)


def parse_ronnells_time(text: str) -> str:
    match = re.search(r"(\d{1,2})(?::(\d{2}))?\s*[-–]", text)
    if not match:
        match = re.search(r"(?:kl\.?\s*)?(\d{1,2})(?::(\d{2}))?", text, re.I)
    if not match:
        return ""
    return f"{int(match.group(1)):02d}:{match.group(2) or '00'}"


def larger_image(url: str) -> str:
    return re.sub(r"-\d+x\d+(?=\.(?:jpe?g|png|webp|gif))", "", url, flags=re.I)


def is_ronnells_music(title: str, time_raw: str) -> bool:
    skip = re.search(
        r"bokrelease|föredrag|nya bok|en ny bok|gästar med en ny bok",
        title,
        re.I,
    )
    music = re.search(
        r"konsert|jazz|band|live|kvartett|kvintett|trio|duo|festival|"
        r"organ|orgel|musik|vinyl|skiv|improvis|frim|piano|gitarr|"
        r"saxofon|kör|choir|sång|selam|orkester|ensemble",
        title,
        re.I,
    )
    if skip and not music:
        return False
    if "insläpp" in time_raw.lower():
        return True
    return bool(music)


def listing_image(block: str) -> str:
    srcset = re.search(r'srcset="([^"]+)"', block)
    if srcset:
        parts = [part.strip().split()[0] for part in srcset.group(1).split(",") if part.strip()]
        if parts:
            return larger_image(html.unescape(parts[-1]))
    img = re.search(r'<img[^>]+src="([^"]+)"', block)
    return larger_image(html.unescape(img.group(1))) if img else ""


def extract_ronnells_text(page_html: str) -> str:
    match = re.search(r'<div class="event-single-about">(.*?)</div>', page_html, re.S)
    if not match:
        return ""
    skip = re.compile(
        r"^(insläpp|entré|förköp|begränsat|i samarbete|välkommen|welcome|"
        r"live kl|fri entré|läs svarsmailet)",
        re.I,
    )
    paras: list[str] = []
    for chunk in re.split(r"</p>|<br\s*/?>", match.group(1)):
        text = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", chunk))).strip(" -–—")
        if not text or len(text) < 50 or skip.match(text) or text.startswith("http"):
            continue
        paras.append(text)
        if len(text) >= 80:
            break
    return shorten(paras[0] if paras else strip_tags(match.group(1)))


def fetch_ronnells(start: datetime, end: datetime) -> list[dict]:
    listing = http_request("https://ronnells.se/?page_id=21")
    events: list[dict] = []
    seen: set[str] = set()

    for block in re.findall(r'<div class="items-wrap">(.*?)</div>\s*</div>', listing, re.S):
        date_match = re.search(r'class="date-event"><b>([^<]+)</b>', block)
        title_match = re.search(r"<h3>(.*?)</h3>", block, re.S)
        href_match = re.search(r'<a href="(https://ronnells\.se/\?events=[^"]+)"', block)
        if not (date_match and title_match and href_match):
            continue

        day = parse_sv_full_date(html.unescape(date_match.group(1)))
        if day is None or not in_range(day, start, end):
            continue

        title = html.unescape(re.sub(r"<[^>]+>", "", title_match.group(1))).strip()
        time_raw = ""
        time_match = re.search(r'class="time-event">([^<]+)', block)
        if time_match:
            time_raw = html.unescape(time_match.group(1)).strip()
        if not is_ronnells_music(title, time_raw):
            continue

        url = html.unescape(href_match.group(1))
        slug = urllib.parse.parse_qs(urllib.parse.urlparse(url).query).get("events", [""])[0]
        if not slug or slug in seen:
            continue
        seen.add(slug)

        image = listing_image(block)
        text = ""
        try:
            page = http_request(url)
        except Exception:
            page = ""
        if page:
            img_match = re.search(
                r'<div class="event-single-wrap[^"]*">\s*<img[^>]+src="([^"]+)"',
                page,
                re.S,
            )
            if img_match:
                image = larger_image(html.unescape(img_match.group(1)))
            text = extract_ronnells_text(page)

        date_str = day.strftime("%Y-%m-%d")
        time_str = parse_ronnells_time(time_raw)
        events.append(
            {
                "id": event_id("ronnells", slug, date_str),
                "venue": "Rönnells",
                "venue_slug": "ronnells",
                "title": title,
                "date": date_str,
                "time": time_str,
                "datetime": local_datetime(date_str, time_str or "19:00").isoformat(),
                "image": image,
                "text": text,
                "url": url,
                "place": "Rönnells",
                **page_media_fields(page, "ronnells"),
            }
        )

    return events


LARRYS_CARD_RE = re.compile(
    r'href="(/sv/events/([^"]+))"\s*>((?:(?!</a>).)*20\d{2}(?:(?!</a>).)*)</a></div>\s*'
    r'<div class="text-balance[^"]*"[^>]*>\s*<a href="/sv/events/\2">([^<]+)</a>',
    re.S,
)


def parse_larrys_cards(listing: str) -> list[tuple[str, str, str, str]]:
    cards = LARRYS_CARD_RE.findall(listing)
    if cards:
        return cards
    dates: dict[str, tuple[str, str]] = {}
    titles: dict[str, str] = {}
    for href, slug, text in re.findall(
        r'href="(/sv/events/([^"]+))"\s*>([^<]+)</a>',
        listing,
    ):
        text = html.unescape(text).strip()
        if re.search(r"20\d{2}", text):
            dates.setdefault(slug, (href, text))
        elif text:
            titles.setdefault(slug, text)
    return [
        (href, slug, when, titles[slug])
        for slug, (href, when) in dates.items()
        if slug in titles
    ]


def parse_larrys_time(blob: str) -> str:
    match = re.search(r"(\d{1,2})[.:](\d{2})\s*(am|pm)", blob, re.I)
    if not match:
        return ""
    hour = int(match.group(1))
    minute = int(match.group(2))
    ap = match.group(3).lower()
    if ap == "pm" and hour < 12:
        hour += 12
    elif ap == "am" and hour == 12:
        hour = 0
    return f"{hour:02d}:{minute:02d}"


def is_larrys_music(title: str) -> bool:
    t = title.lower()
    return not re.search(
        r"\bweek of art\b|\bart show\b|\bart by\b|\butst[aä]llning\b|\bexhibition\b",
        t,
    )


def extract_larrys_text(page_html: str) -> str:
    match = re.search(r'<meta name="description" content="([^"]*)"', page_html)
    if not match:
        match = re.search(r'<meta property="og:description" content="([^"]*)"', page_html)
    if not match:
        return ""
    raw = html.unescape(match.group(1)).replace("\xa0", " ")
    raw = raw.replace("\\n", "\n").replace("\\r", "\n")
    raw = re.sub(r"\\+", "\n", raw)
    paras = [re.sub(r"\s+", " ", part).strip() for part in re.split(r"\n+", raw) if part.strip()]
    skip_head = re.compile(
        r"^(more info coming|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b",
        re.I,
    )
    kept = []
    for para in paras:
        if para.lower() in {"more info coming", "tba"}:
            continue
        if skip_head.match(para) and len(para) < 50:
            continue
        kept.append(para)
    if not kept:
        return ""
    return shorten(" ".join(kept))


def larrys_image_url(raw: str) -> str:
    image = html.unescape(raw or "").strip()
    if not image or image.lower().endswith(".svg"):
        return ""
    if image.startswith("/"):
        return "https://larryscorner.nu" + image
    parsed = urllib.parse.urlparse(image)
    host = (parsed.netloc or "").lower()
    if host in {"alexzethson.com", "www.alexzethson.com", "larryscorner.nu", "www.larryscorner.nu"}:
        path = parsed.path or ""
        if path.startswith("/media/") or path.startswith("/_next/"):
            return "https://larryscorner.nu" + path
    return image


def extract_larrys_image(page_html: str) -> str:
    from scrapers.helpers import og_image

    return larrys_image_url(og_image(page_html))


def fetch_larrys_corner(start: datetime, end: datetime) -> list[dict]:
    listing = http_request("https://larryscorner.nu/sv/events")
    cards = parse_larrys_cards(listing)
    if not cards:
        print(
            f"larryscorner: inga kort i listningen ({len(listing)} tecken)",
            file=sys.stderr,
            flush=True,
        )
    events: list[dict] = []
    seen: set[str] = set()

    for href, slug, when, title_raw in cards:
        if not slug or slug in seen:
            continue
        seen.add(slug)

        title = html.unescape(title_raw).strip()
        if not title or not is_larrys_music(title):
            continue

        when = html.unescape(when)
        day = parse_en_date(when)
        if day is None or not in_range(day, start, end):
            continue

        url = "https://larryscorner.nu" + html.unescape(href)
        time_str = parse_larrys_time(when)
        image = ""
        text = ""
        page = ""
        try:
            page = http_request(url)
        except Exception:
            page = ""
        if page:
            image = extract_larrys_image(page)
            text = extract_larrys_text(page)

        date_str = day.strftime("%Y-%m-%d")
        events.append(
            {
                "id": event_id("larryscorner", slug, date_str),
                "venue": "Larry's Corner",
                "venue_slug": "larryscorner",
                "title": title,
                "date": date_str,
                "time": time_str,
                "datetime": local_datetime(date_str, time_str or "19:00").isoformat(),
                "image": image,
                "text": text,
                "url": url,
                "place": "Larry's Corner",
                **page_media_fields(page, "larryscorner"),
            }
        )

    return events


BANDCAMP_URL_RE = re.compile(
    r"https?://(?:www\.)?(?:[a-z0-9-]+\.)?bandcamp\.com(?:/[^\s\"'<>\\]*)?",
    re.I,
)
BANDCAMP_SKIP_HOSTS = {
    "daily.bandcamp.com",
    "help.bandcamp.com",
    "blog.bandcamp.com",
}


def clean_bandcamp_url(raw: str) -> str:
    url = html.unescape(raw or "").strip()
    url = url.replace("\\/", "/")
    url = url.split("&quot;")[0].split("\\u0022")[0].split("\\n")[0]
    url = url.rstrip(").,;:]\"'")
    if url.endswith("\\"):
        url = url[:-1]
    return url


def is_venue_bandcamp(host: str, venue_slug: str) -> bool:
    host = (host or "").lower()
    if host in BANDCAMP_SKIP_HOSTS:
        return True
    name = host.split(".bandcamp.com")[0]
    if name.startswith("www."):
        name = name[4:]
    slug = re.sub(r"[^a-z0-9]+", "", (venue_slug or "").lower())
    own = re.sub(r"[^a-z0-9]+", "", name)
    if slug and own == slug:
        return True
    if slug == "ronnells" and own.startswith("ronnell"):
        return True
    if slug == "larryscorner" and own.startswith("larry"):
        return True
    return False


def extract_bandcamp_links(raw: str, venue_slug: str = "") -> list[str]:
    text = html.unescape(raw or "").replace("\\/", "/")
    found: list[str] = []
    seen: set[str] = set()
    for match in BANDCAMP_URL_RE.finditer(text):
        url = clean_bandcamp_url(match.group(0))
        if not url:
            continue
        parsed = urllib.parse.urlparse(url)
        host = parsed.netloc.lower()
        path = parsed.path or "/"
        if is_venue_bandcamp(host, venue_slug):
            continue
        if host in {"bandcamp.com", "www.bandcamp.com"}:
            if not re.search(r"/(album|track|EmbeddedPlayer)/", path, re.I):
                continue
        key = host + path.rstrip("/").lower()
        if not key or key in seen:
            continue
        seen.add(key)
        found.append(url)
    return found


def parse_bandcamp_ids(page: str) -> tuple[int | None, int | None, str]:
    band_id = None
    item_id = None
    item_type = ""
    band_match = re.search(r"band_id=(\d+)", page)
    if band_match:
        band_id = int(band_match.group(1))
    item_match = re.search(r"item_id=(\d+)", page)
    if item_match:
        item_id = int(item_match.group(1))
    type_match = re.search(r"item_type=([atb])", page)
    if type_match and type_match.group(1) in "at":
        item_type = type_match.group(1)
    if not item_id:
        embed = re.search(r"(?:EmbeddedPlayer/)?(?:album|track)=(\d+)", page, re.I)
        if embed:
            item_id = int(embed.group(1))
            if not item_type:
                item_type = "t" if re.search(r"(?:^|/)track=", page, re.I) else "a"
    return band_id, item_id, item_type or "a"


SOUNDCLOUD_URL_RE = re.compile(
    r"https?://(?:www\.)?soundcloud\.com/[^\s\"'<>\\]+",
    re.I,
)
SOUNDCLOUD_SKIP = {
    "you", "discover", "search", "pages", "signin", "settings", "upload",
    "charts", "stream", "terms-of-use", "imprint", "messages", "notifications",
    "popular", "feed", "about", "jobs",
}
_sc_client_id = ""


def extract_soundcloud_links(raw: str) -> list[str]:
    text = html.unescape(raw or "").replace("\\/", "/")
    found: list[tuple[int, str]] = []
    seen: set[str] = set()
    for match in SOUNDCLOUD_URL_RE.finditer(text):
        url = html.unescape(match.group(0)).split("?")[0].rstrip("/).,;\"'")
        parsed = urllib.parse.urlparse(url)
        parts = [p for p in parsed.path.split("/") if p]
        if not parts or parts[0].lower() in SOUNDCLOUD_SKIP:
            continue
        if len(parts) >= 2 and parts[1].lower() == "sets":
            kind = 1
        elif len(parts) == 1:
            kind = 2
        else:
            kind = 0
        key = parsed.netloc.lower() + parsed.path.rstrip("/").lower()
        if key in seen:
            continue
        seen.add(key)
        found.append((kind, url))
    found.sort()
    return [url for _, url in found]


def page_media_fields(raw: str, venue_slug: str) -> dict:
    return {
        "_bandcamp_links": extract_bandcamp_links(raw, venue_slug),
        "_soundcloud_links": extract_soundcloud_links(raw),
    }


def take_page_links(event: dict) -> tuple[list[str], list[str]]:
    bc = event.pop("_bandcamp_links", None)
    sc = event.pop("_soundcloud_links", None)
    if bc is not None or sc is not None:
        return list(bc or []), list(sc or [])
    chunks = [event.get("text") or "", event.get("title") or ""]
    url = event.get("url") or ""
    if url:
        try:
            chunks.append(http_request(url))
        except Exception as exc:
            print(f"evenemangssida ({url}): {exc}", file=sys.stderr, flush=True)
        time.sleep(0.08)
    blob = "\n".join(chunks)
    slug = event.get("venue_slug") or ""
    return extract_bandcamp_links(blob, slug), extract_soundcloud_links(blob)


def fold_name(value: str) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def fold_name_letters(value: str) -> str:
    text = unicodedata.normalize("NFC", value or "").casefold()
    text = re.sub(r"[^\w]+", " ", text, flags=re.UNICODE)
    return re.sub(r"\s+", " ", text).strip()


def name_words(value: str, *, marks: bool = False) -> list[str]:
    words = (fold_name_letters(value) if marks else fold_name(value)).split()
    if words[:1] == ["the"]:
        words = words[1:]
    return words


GENERIC_NAME_SUFFIX = {
    "band", "trio", "quartet", "quintet", "ensemble", "orchestra",
    "group", "duo", "sextet", "septet", "octet", "project", "music",
}


def names_match(query: str, name: str, *, allow_folded: bool = False) -> bool:
    qw, nw = name_words(query), name_words(name)
    if not qw or not nw:
        return False
    folded_eq = qw == nw
    prefix_q = len(qw) >= 2 and qw == nw[:len(qw)] and (len(nw) == len(qw) or nw[-1] in GENERIC_NAME_SUFFIX)
    prefix_n = len(nw) >= 2 and nw == qw[:len(nw)]
    if not (folded_eq or prefix_q or prefix_n):
        return False
    qwd, nwd = name_words(query, marks=True), name_words(name, marks=True)
    if not qwd or not nwd:
        return False
    if qwd == nwd:
        return True
    if prefix_q and qwd == nwd[:len(qwd)] and (len(nwd) == len(qwd) or nw[-1] in GENERIC_NAME_SUFFIX):
        return True
    if prefix_n and nwd == qwd[:len(nwd)]:
        return True
    return bool(allow_folded)


def is_generic_event(title: str) -> bool:
    t = fold_name(title)
    if is_club_night(title):
        return True
    if re.search(r"\bhyllnings", t):
        return True
    return False


def is_club_night(title: str, text: str = "") -> bool:
    t = fold_name(title)
    blob = t + " " + fold_name(text)
    if t in {"club soul", "klubbn"}:
        return True
    if re.search(r"\bafter party\b|\befterfest\b", blob):
        return True
    if re.search(r"\bkind people club\b", t):
        return True
    if re.search(r"(?:^|\s)klubb(?:en|n)?(?:\s|$)", t) and "konsert" not in t:
        return True
    if re.match(r"^club\b", t) and "killers" not in t:
        return True
    return False


CANCELLED_RE = re.compile(
    r"\b("
    r"installd[ae]?|installt|"
    r"canceled|cancelled|cancellation|"
    r"avlyst[ae]?|avlysning|aflyst[ae]?"
    r")\b"
)


def is_cancelled(title: str, text: str = "", status: str = "") -> bool:
    blob = fold_name(title) + " " + fold_name(text)
    if CANCELLED_RE.search(blob):
        return True
    st = fold_name(status)
    return bool(st) and ("cancel" in st or "avlyst" in st or "installd" in st or "installt" in st)


def artist_candidates(title: str) -> list[str]:
    t = html.unescape(title or "").replace("\xa0", " ")
    t = re.sub(r"\s+", " ", t).strip(" !")
    t = re.split(r"\s*\|\s*", t)[0]
    t = re.sub(r"\([^)]*\)", " ", t)
    t = re.sub(r"(?i)^(releasekonsert|release party|album release party|konsert)\s*[-–—:]\s*", "", t)
    t = re.sub(r"(?i)\s+((album\s+)?release party|en hyllningskonsert|hyllningskonsert)$", "", t)
    t = re.sub(r"\s*[\"'“”‘’][^\"'“”‘’]+[\"'“”‘’]", " ", t)
    t = re.sub(r"\s+", " ", t).strip(" -–—:")
    if not t:
        return []
    if ":" in t:
        left, right = t.split(":", 1)
        if 0 < len(left.split()) <= 4:
            t = right.strip()
    candidates: list[str] = []
    if re.search(r"\s[-–—]\s", t):
        left, right = re.split(r"\s[-–—]\s", t, maxsplit=1)
        right = right.strip()
        left = left.strip()
        left_is_bill = bool(re.search(r"[&+]| and | och ", left))
        if (
            not left_is_bill
            and re.match(r"^[A-ZÅÄÖ]", right)
            and 1 <= len(right.split()) <= 3
            and "party" not in right.lower()
        ):
            candidates.append(right)
        candidates.extend(re.split(r"\s*(?:&|\+| and | och )\s*", left))
        if left not in candidates:
            candidates.append(left)
    else:
        candidates.extend(re.split(r"\s*(?:&|\+| and | och )\s*", t))
        if t not in candidates:
            candidates.append(t)
    seen: set[str] = set()
    out: list[str] = []
    for raw in candidates:
        name = re.sub(r"\s+", " ", raw).strip(" -–—:,.")
        key = fold_name(name)
        if not name or key in seen or len(key) < 4:
            continue
        if re.fullmatch(r"(club|live|night|party|konsert|festival|the)", key):
            continue
        words = [w for w in key.split() if w not in {"the", "a", "an", "di"}]
        if len(words) < 2 and len(fold_name(title)) > len(key) + 3:
            continue
        seen.add(key)
        out.append(name)
    return out[:4]


def soundcloud_queries(title: str) -> list[str]:
    names = artist_candidates(title)
    if not names:
        return []
    full = names[-1]
    queries = [full]
    folded_full = fold_name(full)
    for name in names[:-1]:
        key = fold_name(name)
        if not key or key == folded_full:
            continue
        words = key.split()
        if len(words) < 2:
            continue
        if folded_full.startswith(key) or words[-1] in GENERIC_NAME_SUFFIX:
            queries.append(name)
    return queries


BILL_SPLIT_RE = re.compile(
    r"\s*(?:&amp;|&|\+|//|,|;|\band\b|\boch\b|\bfeat\.?\b|\bft\.?\b|\bx\b)\s*",
    re.I,
)
BILL_SKIP = {
    "friends",
    "friend",
    "company",
    "guest",
    "guests",
    "special guests",
    "maybe more",
    "more",
    "support",
    "band",
    "live",
    "night",
    "party",
    "konsert",
    "festival",
    "the",
    "plus",
    "magic",
    "surprise",
    "piano",
    "pianist",
    "gitarr",
    "guitar",
    "guitarist",
    "bass",
    "bas",
    "drums",
    "drum",
    "trummor",
    "saxofon",
    "sax",
    "saxophone",
    "elektronik",
    "electronics",
    "percussion",
    "sang",
    "vocals",
    "voice",
    "cello",
    "violin",
    "viola",
    "flojt",
    "flute",
    "trumpet",
    "trombone",
    "keyboard",
    "synth",
    "host",
    "hosts",
}
PERSON_NAME_PUNCT = " -–—:,.!?;)(\"'\\/"
PERSON_NAME_FILLERS = {
    "pretty",
    "gonna",
    "currently",
    "coming",
    "welcome",
    "australian",
    "experimental",
    "divides",
    "korsat",
    "varandras",
    "vagar",
    "festivaler",
}


def clean_person_name(name: str) -> str:
    text = html.unescape(name or "").replace("\xa0", " ")
    text = re.sub(r"\\+", " ", text)
    text = re.sub(r"\s+", " ", text).strip(PERSON_NAME_PUNCT)
    return text


def is_person_name(name: str, allow_single: bool = True) -> bool:
    cleaned = clean_person_name(name)
    key = fold_name(cleaned)
    words = key.split()
    if not cleaned or not words:
        return False
    if len(words) > 6 or (not allow_single and len(words) < 2):
        return False
    if key in BILL_SKIP or words[0] in BILL_SKIP:
        return False
    if re.search(r"[?]|https?://|\d{4,}", cleaned):
        return False
    if any(word in PERSON_NAME_FILLERS for word in words):
        return False
    return True


def same_artist(query: str, artist: str) -> bool:
    if names_match(query, artist) or names_match(artist, query):
        return True
    q, a = fold_name(query), fold_name(artist)
    if not q or not a:
        return False
    if not (q == a or a.startswith(q + " ") or q.startswith(a + " ")):
        return False
    qd, ad = name_words(query, marks=True), name_words(artist, marks=True)
    if not qd or not ad:
        return False
    qs, a_s = " ".join(qd), " ".join(ad)
    return qs == a_s or a_s.startswith(qs + " ") or qs.startswith(a_s + " ")


def split_title_people(title: str) -> list[str]:
    t = html.unescape(title or "").replace("\xa0", " ")
    t = re.sub(r"\s+", " ", t).strip(" !.?)")
    t = re.split(r"\s*\|\s*", t)[0]
    t = re.sub(r"\([^)]*\)", " ", t)
    t = re.sub(
        r"(?i)^(releasekonsert|release party|album release party|konsert|yeah\.+we got the)\s*[-–—:]?\s*",
        "",
        t,
    )
    t = re.sub(r"\s*[\"'“”‘’][^\"'“”‘’]+[\"'“”‘’]", " ", t)
    t = re.sub(r"(?i)\s*[:]\s*support\b.*$", "", t)
    t = re.sub(r"(?i)^support:\s*", "", t)
    t = re.sub(r"\s+", " ", t).strip(" -–—:")
    if ":" in t:
        left, right = t.split(":", 1)
        if BILL_SPLIT_RE.search(right) and not BILL_SPLIT_RE.search(left):
            t = right.strip()
    if re.search(r"\s[-–—]\s", t):
        left, right = re.split(r"\s[-–—]\s", t, maxsplit=1)
        if BILL_SPLIT_RE.search(left) or re.search(r"[&+]|\band\b|\boch\b", left, re.I):
            t = left.strip()
    if not BILL_SPLIT_RE.search(t):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for raw in BILL_SPLIT_RE.split(t):
        name = re.sub(r"(?i)^(the\s+)?(and\s+)?", "", raw)
        name = re.sub(r"(?i)^support:\s*", "", name)
        if re.search(r"(?i)\bwith\b", name) and len(name.split()) > 3:
            name = re.split(r"(?i)\bwith\b", name)[-1].strip()
        name = clean_person_name(name)
        key = fold_name(name)
        if not name or key in seen or len(key) < 3 or not is_person_name(name):
            continue
        if re.search(r"\b(friends|company|guest|guests|maybe more|coming back|make magic)\b", key):
            continue
        seen.add(key)
        out.append(name)
    return out if len(out) >= 2 else []


def enrich_people(people: list[str], text: str) -> list[str]:
    extras: list[str] = []
    seen_extra: set[str] = set()
    for name in artist_candidates(text) + split_title_people(text):
        name = clean_person_name(name)
        key = fold_name(name)
        if not key or key in seen_extra or not is_person_name(name, allow_single=False):
            continue
        seen_extra.add(key)
        extras.append(name)
    used: set[str] = set()
    out: list[str] = []
    for name in people:
        picked = clean_person_name(name) or name
        for extra in extras:
            ek = fold_name(extra)
            if ek in used:
                continue
            if same_artist(picked, extra):
                if len(ek) > len(fold_name(picked)):
                    picked = extra
                used.add(ek)
                break
        out.append(picked)
    return out


def bill_artists(title: str, text: str = "") -> list[str]:
    people = split_title_people(title)
    if len(people) >= 2:
        return enrich_people(people, text)
    return []


TITLE_NAME_SKIP = {
    "and",
    "och",
    "the",
    "to",
    "for",
    "of",
    "a",
    "an",
    "at",
    "in",
    "on",
    "with",
    "from",
    "maybe",
    "more",
    "coming",
    "you",
    "all",
    "out",
    "there",
    "people",
    "welcome",
    "lets",
    "give",
    "big",
    "warm",
    "plus",
    "live",
    "night",
    "party",
    "band",
    "trio",
    "duo",
    "dj",
    "support",
    "album",
    "release",
    "concert",
    "konsert",
}
LARRY_CORNER_RE = re.compile(r"larrys?\s*corner", re.I)


def title_letter_mode(title: str) -> str:
    letters = [ch for ch in title if ch.isalpha()]
    if not letters:
        return "none"
    if all(ch.isupper() for ch in letters):
        return "upper"
    if all(ch.islower() for ch in letters):
        return "lower"
    return "mixed"


def to_title_case(title: str) -> str:
    out: list[str] = []
    i = 0
    while i < len(title):
        ch = title[i]
        if ch.isalpha():
            j = i + 1
            while j < len(title) and title[j].isalpha():
                j += 1
            word = title[i:j]
            out.append(word[0].upper() + word[1:].lower())
            i = j
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def capitalize_first_letter(title: str) -> str:
    for i, ch in enumerate(title):
        if ch.isalpha():
            return title[:i] + ch.upper() + title[i + 1 :]
    return title


def proper_person_name(name: str) -> str:
    text = (name or "").strip()
    if not text:
        return ""
    return to_title_case(text) if title_letter_mode(text) == "lower" else text


def apply_title_names(title: str, event: dict, with_words: bool) -> str:
    venue = event.get("venue") or ""
    if venue and re.search(r"larry", venue, re.I):
        title = LARRY_CORNER_RE.sub(venue, title)
    if venue:
        title = re.compile(re.escape(venue), re.I).sub(venue, title)
    if not with_words:
        return title
    parts: list[str] = []
    for track in event.get("tracks") or []:
        name = proper_person_name(track.get("artist") or "")
        if not name:
            continue
        parts.append(name)
        parts.extend(name.split())
    parts.sort(key=len, reverse=True)
    seen: set[str] = set()
    for part in parts:
        clean = re.sub(r"^[,.!:;]+|[,.!:;]+$", "", part)
        key = fold_name(clean)
        if len(clean) < 3 or key in TITLE_NAME_SKIP or key in seen:
            continue
        seen.add(key)
        title = re.compile(re.escape(clean), re.I).sub(clean, title)
    return title


def display_title(event: dict) -> str:
    title = re.sub(r"\s+", " ", str(event.get("title") or "")).strip()
    if not title:
        return ""
    mode = title_letter_mode(title)
    if mode == "upper":
        title = to_title_case(title)
    elif mode == "lower":
        title = apply_title_names(title, event, True)
    else:
        title = apply_title_names(title, event, False)
    return capitalize_first_letter(title)


def normalize_event_titles(events: list[dict]) -> None:
    for event in events:
        event["title"] = display_title(event)


def parse_bc_date(value: str) -> datetime:
    try:
        return datetime.strptime(value.replace(" GMT", ""), "%d %b %Y %H:%M:%S").replace(tzinfo=timezone.utc)
    except Exception:
        return datetime(1970, 1, 1, tzinfo=timezone.utc)


def unique_folded(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        key = fold_name(item)
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def event_lookup_clues(text: str, person: str = "") -> dict:
    raw = html.unescape(text or "").replace("\xa0", " ")
    person_fold = fold_name(person)
    albums = []
    for quote in re.findall(r"[\"“”«»‘’]([^\"“”«»‘’]{2,80})[\"“”«»‘’]", raw):
        quote = re.sub(r"\s+", " ", quote).strip()
        if fold_name(quote) and fold_name(quote) != person_fold:
            albums.append(quote)
    labels = []
    for lab in re.findall(
        r"(?i)\b(?:skivbolaget|skivbolag|record label|label(?:et)?)\s+([A-ZÅÄÖ][\wÅÄÖåäö&/'’-]+)",
        raw,
    ):
        lab = lab.strip(".,;:)")
        if fold_name(lab) and fold_name(lab) != person_fold:
            labels.append(lab)
    phrases = []
    for phrase in re.findall(
        r"\b([A-ZÅÄÖ][\wÅÄÖåäö’'-]+(?:\s+[A-ZÅÄÖ][\wÅÄÖåäö’'-]+)+)\b",
        raw,
    ):
        folded = fold_name(phrase)
        if not folded or folded == person_fold:
            continue
        phrases.append(phrase)
    return {
        "albums": unique_folded(albums),
        "labels": unique_folded(labels),
        "phrases": unique_folded(phrases),
    }


def clues_cache_key(clues: dict) -> str:
    parts = list(clues.get("albums") or []) + list(clues.get("labels") or [])
    return "\t".join(fold_name(part) for part in parts)


def album_title_score(hint: str, name: str) -> int:
    h, n = fold_name(hint), fold_name(name)
    if not h or not n or len(h) < 4:
        return 0
    if h == n:
        return 3
    if n.startswith(h + " ") or h.startswith(n + " "):
        return 2
    if h in n or n in h:
        return 1
    return 0


def search_bandcamp_rows(query: str, search_filter: str) -> list[dict]:
    data = http_json(
        "https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_elastic",
        {"search_text": query, "search_filter": search_filter, "full_page": False, "fan_id": None},
    )
    return ((data.get("auto") or {}).get("results") or [])


def search_bandcamp_artists(query: str, *, allow_folded: bool = False) -> list[dict]:
    hits = []
    for row in search_bandcamp_rows(query, "artist"):
        if row.get("type") != "b" or row.get("is_label"):
            continue
        name = row.get("name") or ""
        if not names_match(query, name, allow_folded=allow_folded):
            continue
        hits.append(
            {
                "name": name,
                "band_id": row.get("id"),
                "url": row.get("item_url_root") or "",
                "location": row.get("location") or "",
            }
        )
    return hits


def bandcamp_row_matches_artist(query: str, row: dict) -> bool:
    if row.get("is_label"):
        return False
    band_name = row.get("band_name") or ""
    name = row.get("name") or ""
    if row.get("type") == "b":
        return bool(name) and (names_match(query, name) or same_artist(query, name))
    return bool(band_name) and (names_match(query, band_name) or same_artist(query, band_name))


def search_bandcamp_releases_for_artist(query: str) -> list[dict]:
    seen: set[str] = set()
    hits: list[dict] = []
    for search_filter in ("album", ""):
        for row in search_bandcamp_rows(query, search_filter):
            if row.get("type") not in {"a", "t"}:
                continue
            if not bandcamp_row_matches_artist(query, row):
                continue
            row_key = ":".join(
                [
                    str(row.get("band_id") or ""),
                    str(row.get("album_id") or row.get("id") or ""),
                    str(row.get("type") or ""),
                ]
            )
            if row_key in seen:
                continue
            seen.add(row_key)
            hits.append(row)
        if hits:
            break
    hits.sort(key=lambda row: 0 if row.get("type") == "a" else 1)
    return hits


def release_from_bandcamp_search_row(row: dict, cache: dict) -> dict | None:
    band_id = row.get("band_id")
    if row.get("type") == "a":
        item_id, item_type = row.get("id"), "a"
    elif row.get("album_id"):
        item_id, item_type = row.get("album_id"), "a"
    else:
        item_id, item_type = row.get("id"), "t"
    release = release_from_bandcamp_ids(band_id, item_id, item_type, cache, row.get("item_url_path") or "")
    if release:
        return release
    url = (row.get("item_url_path") or "").strip()
    if url and ("/album/" in url or "/track/" in url):
        return lookup_bandcamp_url(url, cache)
    return None


def location_context_score(location: str, context: str) -> int:
    ctx = set(fold_name(context).split())
    score = 0
    for word in fold_name(location).split():
        if len(word) >= 5 and word in ctx:
            score += 12
    return score


def score_text_against_clues(blob: str, clues: dict, context: str = "") -> int:
    folded = fold_name(blob)
    if not folded:
        return 0
    score = 0
    for hint in clues.get("albums") or []:
        if album_title_score(hint, blob) or fold_name(hint) in folded:
            score += 24
    for hint in clues.get("labels") or []:
        hf = fold_name(hint)
        if hf and hf in folded:
            score += 16
    for hint in clues.get("phrases") or []:
        hf = fold_name(hint)
        if hf and len(hf) >= 8 and hf in folded:
            score += 6
    if clues.get("albums") or clues.get("labels"):
        if "sweden" in folded or "sverige" in folded or "stockholm" in folded:
            score += 3
    score += location_context_score(blob, context)
    return score


def release_from_bandcamp_ids(band_id, item_id, item_type: str, cache: dict, url: str = "") -> dict | None:
    if not band_id or not item_id:
        return None
    key = "bcids:" + str(band_id) + ":" + str(item_id) + ":" + (item_type or "a")
    if key in cache:
        return cache[key]
    try:
        album = bandcamp_tralbum(int(band_id), int(item_id), item_type or "a")
        picked = pick_stream_track(album)
        if not picked:
            cache[key] = None
            return None
        release = {
            "artist": album.get("tralbum_artist")
            or (album.get("band") or {}).get("name")
            or "",
            "album": album.get("title") or "",
            "album_id": album.get("id") or item_id,
            "band_id": int(band_id),
            "type": item_type or "a",
            "url": album.get("bandcamp_url") or picked["url"] or url,
            "released": "",
            "track": picked["track"],
            "track_id": picked["track_id"],
        }
        cache[key] = release
        return release
    except Exception as exc:
        print(f"bandcamp-id ({band_id}/{item_id}): {exc}", file=sys.stderr, flush=True)
        cache[key] = None
        return None


def find_bandcamp_album_for_artist(artist: str, hints: list[str], cache: dict) -> dict | None:
    queries: list[str] = []
    for hint in hints:
        queries.append(artist + " " + hint)
        queries.append(hint)
    seen_q: set[str] = set()
    seen_row: set[str] = set()
    ranked: list[tuple[int, dict]] = []
    for query in queries:
        key = fold_name(query)
        if not key or key in seen_q:
            continue
        seen_q.add(key)
        for row in search_bandcamp_rows(query, "album"):
            if row.get("type") not in {"a", "t"}:
                continue
            band_name = row.get("band_name") or ""
            if not (names_match(artist, band_name) or same_artist(artist, band_name)):
                continue
            album_name = row.get("album_name") or row.get("name") or ""
            track_name = row.get("name") or "" if row.get("type") == "t" else ""
            score = 0
            for hint in hints:
                score = max(
                    score,
                    album_title_score(hint, album_name) * 10,
                    album_title_score(hint, track_name) * 4,
                )
            if score == 0:
                score = 1
            if row.get("type") == "a":
                score += 5
            row_key = str(row.get("band_id")) + ":" + str(row.get("album_id") or row.get("id"))
            if row_key in seen_row:
                continue
            seen_row.add(row_key)
            ranked.append((score, row))
        time.sleep(0.12)
        if any(score >= 35 for score, _row in ranked):
            break
    ranked.sort(key=lambda item: item[0], reverse=True)
    for _score, row in ranked:
        release = release_from_bandcamp_search_row(row, cache)
        if release:
            return release
        time.sleep(0.12)
    return None


def bandcamp_details(band_id: int) -> dict:
    return http_json("https://bandcamp.com/api/mobile/24/band_details", {"band_id": int(band_id)})


def bandcamp_tralbum(band_id: int, tralbum_id: int, tralbum_type: str = "a") -> dict:
    return http_json(
        "https://bandcamp.com/api/mobile/24/tralbum_details",
        {"band_id": int(band_id), "tralbum_id": int(tralbum_id), "tralbum_type": tralbum_type},
    )


def bandcamp_art_url(art_id) -> str:
    if not art_id:
        return ""
    return "https://f4.bcbits.com/img/a" + str(art_id) + "_5.jpg"


def pick_stream_track(album: dict) -> dict | None:
    featured = album.get("featured_track_id")
    tracks = album.get("tracks") or []
    ordered = []
    if featured:
        ordered.extend(t for t in tracks if t.get("track_id") == featured)
    ordered.extend(t for t in tracks if t not in ordered)
    for track in ordered:
        stream = ((track.get("streaming_url") or {}).get("mp3-128") or "").strip()
        if track.get("is_streamable") and stream:
            return {
                "track": track.get("title") or "",
                "track_id": track.get("track_id"),
                "stream": stream,
                "url": track.get("track_url") or album.get("bandcamp_url") or "",
            }
    return None


def latest_from_band(band: dict, details: dict | None = None) -> dict | None:
    details = details if details is not None else bandcamp_details(band["band_id"])
    discog = details.get("discography") or []
    for item in discog[:4]:
        item_type = "t" if item.get("item_type") == "track" else "a"
        album = bandcamp_tralbum(band["band_id"], item.get("item_id"), item_type)
        picked = pick_stream_track(album)
        if not picked:
            continue
        return {
            "artist": details.get("name") or band.get("name") or "",
            "album": album.get("title") or item.get("title") or "",
            "album_id": album.get("id") or item.get("item_id"),
            "band_id": band["band_id"],
            "type": item_type,
            "url": album.get("bandcamp_url") or picked["url"],
            "released": item.get("release_date") or "",
            "track": picked["track"],
            "track_id": picked["track_id"],
        }
    return None


def lookup_bandcamp_url(url: str, cache: dict) -> dict | None:
    key = "url:" + (url or "").split("?")[0].rstrip("/").lower()
    if key in cache:
        return cache[key]
    try:
        page = http_request(url)
        band_id, item_id, item_type = parse_bandcamp_ids(page)
        if not band_id:
            cache[key] = None
            return None
        if item_id and item_type in {"a", "t"}:
            album = bandcamp_tralbum(band_id, item_id, item_type)
            picked = pick_stream_track(album)
            if picked:
                release = {
                    "artist": album.get("tralbum_artist")
                    or (album.get("band") or {}).get("name")
                    or "",
                    "album": album.get("title") or "",
                    "album_id": album.get("id") or item_id,
                    "band_id": band_id,
                    "type": item_type,
                    "url": album.get("bandcamp_url") or picked["url"] or url,
                    "released": "",
                    "track": picked["track"],
                    "track_id": picked["track_id"],
                }
                cache[key] = release
                return release
        release = latest_from_band({"band_id": band_id, "name": ""})
        cache[key] = release
        return release
    except Exception as exc:
        print(f"bandcamp-url ({url}): {exc}", file=sys.stderr, flush=True)
        cache[key] = None
        return None


def lookup_bandcamp(query: str, cache: dict, context: str = "") -> dict | None:
    query = clean_person_name(query) or query
    clues = event_lookup_clues(context, query)
    key = fold_name(query) + "\t" + clues_cache_key(clues)
    if key in cache:
        return cache[key]
    try:
        hints = list(clues.get("albums") or []) + list(clues.get("labels") or [])
        if hints:
            release = find_bandcamp_album_for_artist(query, hints, cache)
            if release:
                print(
                    f"bandcamp ({query}): {release.get('album') or release.get('track')} via evenemangstext",
                    flush=True,
                )
                cache[key] = release
                return release
        hits = search_bandcamp_artists(query)
        if not hits:
            hits = search_bandcamp_artists(query, allow_folded=True)
        limit = 8 if len(fold_name(query).split()) < 2 else 4
        best = None
        best_tuple = None
        for band in hits[:limit]:
            time.sleep(0.15)
            details = bandcamp_details(band["band_id"])
            release = latest_from_band(band, details)
            if not release:
                continue
            clue_score = score_text_against_clues(
                " ".join(
                    [
                        details.get("name") or band.get("name") or "",
                        details.get("location") or band.get("location") or "",
                        details.get("bio") or "",
                        " ".join(item.get("title") or "" for item in (details.get("discography") or [])[:8]),
                    ]
                ),
                clues,
                context,
            )
            when = parse_bc_date(release.get("released") or "")
            rank = (clue_score, when)
            if best is None or rank > best_tuple:
                best = release
                best_tuple = rank
        if best:
            cache[key] = best
            return best
        for row in search_bandcamp_releases_for_artist(query)[:8]:
            release = release_from_bandcamp_search_row(row, cache)
            artist = (release or {}).get("artist") or ""
            if release and (same_artist(query, artist) or names_match(query, artist)):
                print(
                    f"bandcamp ({query}): {release.get('album') or release.get('track')} via album-sökning",
                    flush=True,
                )
                cache[key] = release
                return release
            time.sleep(0.12)
        cache[key] = None
        return None
    except Exception as exc:
        print(f"bandcamp ({query}): {exc}", file=sys.stderr, flush=True)
        if "429" not in str(exc):
            cache[key] = None
        return None


def bc_track(release: dict) -> dict:
    return {
        "source": "bandcamp",
        "artist": release.get("artist") or "",
        "album": release.get("album") or "",
        "track": release.get("track") or "",
        "url": release.get("url") or "",
        "band_id": release.get("band_id"),
        "album_id": release.get("album_id"),
        "track_id": release.get("track_id"),
        "type": release.get("type") or "a",
    }


def sc_track(release: dict) -> dict:
    return {
        "source": "soundcloud",
        "artist": release.get("artist") or "",
        "track": release.get("track") or "",
        "track_id": release.get("track_id"),
        "url": release.get("url") or "",
        "image": release.get("image") or "",
    }


def track_artist_seen(tracks: list[dict], artist: str) -> bool:
    return any(same_artist(artist, item.get("artist") or "") for item in tracks)


def event_artists(title: str, text: str = "") -> list[str]:
    people = bill_artists(title, text)
    if people:
        return people
    return artist_candidates(title)


def track_fits_event(track: dict, artists: list[str], title: str) -> bool:
    name = track.get("artist") or ""
    if not name:
        return False
    if artists and any(same_artist(person, name) for person in artists):
        return True
    folded_artist = fold_name(name)
    folded_title = fold_name(title)
    if not folded_artist or not folded_title:
        return False
    if len(folded_artist) >= 5 and folded_artist in folded_title:
        return True
    words = [w for w in folded_artist.split() if w not in {"the", "a", "an", "and", "och"}]
    title_words = set(folded_title.split())
    return len(words) >= 2 and all(word in title_words for word in words)


def apply_primary_media(event: dict, tracks: list[dict]) -> None:
    event.pop("bandcamp", None)
    event.pop("soundcloud", None)
    if not tracks:
        event.pop("tracks", None)
        return
    event["tracks"] = tracks
    first = tracks[0]
    if first.get("source") == "bandcamp":
        event["bandcamp"] = {
            "artist": first.get("artist") or "",
            "album": first.get("album") or "",
            "track": first.get("track") or "",
            "url": first.get("url") or "",
            "band_id": first.get("band_id"),
            "album_id": first.get("album_id"),
            "track_id": first.get("track_id"),
            "type": first.get("type") or "a",
        }
    else:
        event["soundcloud"] = {
            "artist": first.get("artist") or "",
            "track": first.get("track") or "",
            "track_id": first.get("track_id"),
            "url": first.get("url") or "",
            "image": first.get("image") or "",
        }


def first_matching_page_track(
    page_tracks: list[dict],
    used_page: set[int],
    person: str,
    source: str,
) -> dict | None:
    for i, item in enumerate(page_tracks):
        if i in used_page or item.get("source") != source:
            continue
        if same_artist(person, item.get("artist") or ""):
            used_page.add(i)
            return item
    return None


def lookup_track_for_person(
    person: str,
    page_tracks: list[dict],
    used_page: set[int],
    bc_cache: dict,
    sc_cache: dict,
    sources: tuple[str, ...] = ("bandcamp", "soundcloud"),
    context: str = "",
) -> dict | None:
    for source in sources:
        if source == "bandcamp":
            item = first_matching_page_track(page_tracks, used_page, person, "bandcamp")
            if item:
                return item
            release = lookup_bandcamp(person, bc_cache, context)
            if release:
                return bc_track(release)
            time.sleep(0.12)
        elif source == "soundcloud":
            item = first_matching_page_track(page_tracks, used_page, person, "soundcloud")
            if item:
                return item
            release = lookup_soundcloud_artist(person, sc_cache, context)
            if release:
                return sc_track(release)
            time.sleep(0.12)
    return None


def attach_tracks(events: list[dict]) -> None:
    bc_cache: dict = {}
    sc_cache: dict = {}
    found = 0
    from_page = 0
    extra = 0
    for event in events:
        title = event.get("title") or ""
        text = re.sub(r"\\+", " ", event.get("text") or "")
        text = re.sub(r"\s+", " ", text).strip()
        if text != (event.get("text") or ""):
            event["text"] = text
        artists = event_artists(title, text)
        people = artists if artists and not is_generic_event(title) else []
        existing = list(event.get("tracks") or [])
        if existing and (
            not people
            or all(any(same_artist(person, item.get("artist") or "") for item in existing) for person in people)
        ):
            apply_primary_media(event, existing)
            found += 1
            extra += max(0, len(existing) - 1)
            continue
        bc_links, sc_links = take_page_links(event)
        page_tracks: list[dict] = []
        for url in bc_links:
            release = lookup_bandcamp_url(url, bc_cache)
            if release:
                page_tracks.append(bc_track(release))
                from_page += 1
            time.sleep(0.12)
        for url in sc_links:
            release = lookup_soundcloud_url(url, sc_cache)
            if release:
                page_tracks.append(sc_track(release))
                from_page += 1
            time.sleep(0.12)

        artists = event_artists(title, text)
        context = " ".join(part for part in (title, text) if part)
        tracks: list[dict] = []
        used_page: set[int] = set()
        people = artists if artists and not is_generic_event(title) else []

        def take_unused_page(source: str) -> dict | None:
            for i, item in enumerate(page_tracks):
                if i in used_page or item.get("source") != source:
                    continue
                used_page.add(i)
                return item
            return None

        def add_track(item: dict | None) -> None:
            if not item:
                return
            artist = item.get("artist") or ""
            if artist and track_artist_seen(tracks, artist):
                return
            tracks.append(item)

        for item in event.get("tracks") or []:
            add_track(item)
        for person in people:
            if any(same_artist(person, item.get("artist") or "") for item in tracks):
                continue
            add_track(lookup_track_for_person(person, page_tracks, used_page, bc_cache, sc_cache, ("bandcamp",), context))
        if not tracks:
            add_track(take_unused_page("bandcamp"))
        if people:
            for person in people:
                if any(same_artist(person, item.get("artist") or "") for item in tracks):
                    continue
                if tracks and len(people) < 2:
                    continue
                add_track(lookup_track_for_person(person, page_tracks, used_page, bc_cache, sc_cache, ("soundcloud",), context))
        if not tracks:
            add_track(take_unused_page("soundcloud"))

        apply_primary_media(event, tracks)
        if tracks:
            found += 1
            extra += max(0, len(tracks) - 1)
    print(
        f"låtar: {found}/{len(events)} poster med spelbar låt "
        f"({from_page} från evenemangssida, {extra} extra artistspår)",
        flush=True,
    )


def soundcloud_client_id() -> str:
    global _sc_client_id
    if _sc_client_id:
        return _sc_client_id
    page = http_request("https://soundcloud.com/")
    scripts = re.findall(r"https://a-v2\.sndcdn\.com/assets/[^\"']+\.js", page)
    for script in scripts:
        js = http_request(script)
        match = re.search(r"client_id=([A-Za-z0-9]{16,})", js) or re.search(
            r'client_id["\']?\s*[:=]\s*["\']([A-Za-z0-9]{16,})["\']',
            js,
        )
        if match:
            _sc_client_id = match.group(1)
            return _sc_client_id
    raise RuntimeError("hittade ingen SoundCloud-nyckel")


def soundcloud_get(path: str, params: dict | None = None, retry: bool = True) -> dict:
    params = dict(params or {})
    params["client_id"] = soundcloud_client_id()
    if path.startswith("http"):
        url = path
        joiner = "&" if "?" in url else "?"
        url = url + joiner + urllib.parse.urlencode(params)
    else:
        url = "https://api-v2.soundcloud.com" + path + "?" + urllib.parse.urlencode(params)
    try:
        return json.loads(http_request(url, extra_headers={
            "Accept": "application/json",
            "Origin": "https://soundcloud.com",
            "Referer": "https://soundcloud.com/",
        }))
    except urllib.error.HTTPError as exc:
        if retry and exc.code in {401, 403}:
            global _sc_client_id
            _sc_client_id = ""
            return soundcloud_get(path, {k: v for k, v in params.items() if k != "client_id"}, retry=False)
        raise


def sc_art(url: str) -> str:
    if not url:
        return ""
    return re.sub(r"-large\.(jpg|png|webp)$", r"-t500x500.\1", url, flags=re.I)


def has_progressive(track: dict) -> bool:
    for item in ((track.get("media") or {}).get("transcodings") or []):
        if (item.get("format") or {}).get("protocol") == "progressive":
            return True
    return False


def release_from_sc_track(track: dict, artist_hint: str = "") -> dict | None:
    if not track or not track.get("id") or not track.get("streamable") or not has_progressive(track):
        return None
    user = track.get("user") or {}
    return {
        "artist": artist_hint or user.get("username") or user.get("full_name") or "",
        "track": track.get("title") or "",
        "track_id": track.get("id"),
        "url": track.get("permalink_url") or "",
        "image": sc_art(track.get("artwork_url") or user.get("avatar_url") or ""),
    }


def latest_from_sc_user(user: dict) -> dict | None:
    data = soundcloud_get("/users/" + str(user["id"]) + "/tracks", {"limit": 8})
    artist = user.get("username") or user.get("full_name") or ""
    for track in data.get("collection") or []:
        release = release_from_sc_track(track, artist)
        if release:
            return release
    return None


def lookup_soundcloud_url(url: str, cache: dict) -> dict | None:
    key = "scurl:" + (url or "").split("?")[0].rstrip("/").lower()
    if key in cache:
        return cache[key]
    try:
        resolved = soundcloud_get("/resolve", {"url": url.split("?")[0]})
        kind = resolved.get("kind")
        release = None
        if kind == "track":
            release = release_from_sc_track(resolved)
        elif kind == "playlist":
            tracks = resolved.get("tracks") or []
            for track in tracks[:6]:
                if track.get("id") and not track.get("streamable"):
                    track = soundcloud_get("/tracks/" + str(track["id"]))
                release = release_from_sc_track(track)
                if release:
                    break
        elif kind == "user":
            release = latest_from_sc_user(resolved)
        cache[key] = release
        return release
    except Exception as exc:
        print(f"soundcloud-url ({url}): {exc}", file=sys.stderr, flush=True)
        cache[key] = None
        return None


def lookup_soundcloud_artist(query: str, cache: dict, context: str = "") -> dict | None:
    clues = event_lookup_clues(context, query)
    key = "sc:" + fold_name(query) + "\t" + clues_cache_key(clues)
    if key in cache:
        return cache[key]
    try:
        for hint in (clues.get("albums") or [])[:2]:
            data = soundcloud_get("/search/tracks", {"q": query + " " + hint, "limit": 8})
            best = None
            best_score = 0
            for track in data.get("collection") or []:
                user = track.get("user") or {}
                names = [user.get("username") or "", user.get("full_name") or ""]
                if not any(names_match(query, name) or same_artist(query, name) for name in names if name):
                    continue
                score = max(
                    album_title_score(hint, track.get("title") or ""),
                    album_title_score(hint, track.get("description") or ""),
                )
                if score < 1:
                    continue
                release = release_from_sc_track(track, names[0] or names[1])
                if release and score > best_score:
                    best = release
                    best_score = score
            if best:
                cache[key] = best
                return best
            time.sleep(0.12)
        data = soundcloud_get("/search/users", {"q": query, "limit": 8})
        ranked = []
        for user in data.get("collection") or []:
            names = [user.get("username") or "", user.get("full_name") or ""]
            if not any(names_match(query, name) for name in names if name):
                continue
            blob = " ".join(
                [
                    user.get("username") or "",
                    user.get("full_name") or "",
                    user.get("description") or "",
                    user.get("city") or "",
                    user.get("country") or "",
                ]
            )
            ranked.append((score_text_against_clues(blob, clues), user))
        ranked.sort(key=lambda item: item[0], reverse=True)
        for _score, user in ranked:
            release = latest_from_sc_user(user)
            if release:
                cache[key] = release
                return release
            time.sleep(0.12)
        cache[key] = None
        return None
    except Exception as exc:
        print(f"soundcloud ({query}): {exc}", file=sys.stderr, flush=True)
        cache[key] = None
        return None


def stream_works(url: str) -> bool:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Range": "bytes=0-1",
            "Referer": "https://soundcloud.com/",
            "Origin": "https://soundcloud.com",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as res:
            return res.status in {200, 206}
    except Exception:
        return False


def soundcloud_meta(track: dict) -> dict:
    user = track.get("user") or {}
    return {
        "artist": user.get("username") or user.get("full_name") or "",
        "track": track.get("title") or "",
        "url": track.get("permalink_url") or "",
        "image": sc_art(track.get("artwork_url") or user.get("avatar_url") or ""),
    }


def soundcloud_stream_from_track(track: dict, allow_widget: bool = True) -> dict | None:
    transcodings = ((track.get("media") or {}).get("transcodings") or [])
    ordered = [item for item in transcodings if (item.get("format") or {}).get("protocol") == "progressive"]
    auth = track.get("track_authorization") or ""
    meta = soundcloud_meta(track)
    for item in ordered:
        href = item.get("url") or ""
        if not href:
            continue
        params = {}
        if auth:
            params["track_authorization"] = auth
        try:
            info = soundcloud_get(href, params)
        except Exception:
            continue
        stream = (info.get("url") or "").strip()
        if not stream or not stream_works(stream):
            continue
        meta["stream"] = stream
        return meta
    if allow_widget and track.get("streamable") and meta.get("url"):
        meta["widget"] = True
        return meta
    return None


def soundcloud_stream_url(track_id: int) -> dict | None:
    track = soundcloud_get("/tracks/" + str(int(track_id)))
    payload = soundcloud_stream_from_track(track)
    if payload:
        return payload
    user_id = (track.get("user") or {}).get("id")
    if not user_id:
        return None
    data = soundcloud_get("/users/" + str(user_id) + "/tracks", {"limit": 8})
    for other in data.get("collection") or []:
        if other.get("id") == track.get("id"):
            continue
        payload = soundcloud_stream_from_track(other)
        if payload:
            return payload
    return None


def bandcamp_stream_url(band_id: int, tralbum_id: int, tralbum_type: str = "a") -> dict | None:
    album = bandcamp_tralbum(band_id, tralbum_id, tralbum_type or "a")
    picked = pick_stream_track(album)
    if not picked:
        return None
    return {
        "artist": album.get("tralbum_artist") or (album.get("band") or {}).get("name") or "",
        "album": album.get("title") or "",
        "track": picked["track"],
        "url": picked.get("url") or album.get("bandcamp_url") or "",
        "image": bandcamp_art_url(album.get("art_id")),
        "stream": picked["stream"],
    }


def collect() -> dict:
    from scrapers.registry import SOURCES

    start, end = week_bounds()
    errors: dict[str, str] = {}
    events: list[dict] = []

    for name, fn in SOURCES:
        try:
            batch = fn(start, end)
            events.extend(batch)
            print(f"{name}: {len(batch)} konserter", flush=True)
        except Exception as exc:
            errors[name] = str(exc)
            print(f"{name}: FEL — {exc}", file=sys.stderr, flush=True)

    skipped_club = [
        event
        for event in events
        if is_club_night(event.get("title") or "", event.get("text") or "")
    ]
    skipped_cancelled = [
        event
        for event in events
        if is_cancelled(event.get("title") or "", event.get("text") or "")
    ]
    skip_ids = {event.get("id") for event in skipped_club} | {
        event.get("id") for event in skipped_cancelled
    }
    if skip_ids:
        events = [event for event in events if event.get("id") not in skip_ids]
    if skipped_club:
        print(f"hoppade över {len(skipped_club)} klubbkvällar", flush=True)
    if skipped_cancelled:
        print(f"hoppade över {len(skipped_cancelled)} inställda", flush=True)

    events.sort(key=lambda item: (item.get("datetime") or "", item.get("title") or ""))
    attach_tracks(events)
    normalize_event_titles(events)
    return {
        "updated": now_sthlm().isoformat(timespec="seconds"),
        "range": {"from": start.strftime("%Y-%m-%d"), "to": end.strftime("%Y-%m-%d")},
        "errors": errors,
        "events": events,
    }


def main() -> int:
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = collect()
    DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Skrev {len(payload['events'])} konserter till {DATA_PATH}", flush=True)
    return 0 if not payload["errors"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
