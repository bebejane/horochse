from __future__ import annotations

import html
import re
from datetime import datetime

from scrapers.core import MONTHS_SV, TZ, http_request, in_range, page_media_fields
from scrapers.helpers import is_concert, make_event, og_image, page_blurb, pick_image

MONTHS_SHORT = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "maj": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "okt": 10, "nov": 11, "dec": 12,
}


def fetch(start: datetime, end: datetime) -> list[dict]:
    html_page = http_request("https://debaser.se/konserter")
    events: list[dict] = []
    seen: set[str] = set()
    for match in re.finditer(
        r'<a href="(/events/[^"]+)" class="event-info[^"]*">(?P<body>.*?)</a>',
        html_page,
        re.S,
    ):
        body = match.group("body")
        kind = re.search(r'class="b2 white">([^<]+)', body)
        if not kind or "konsert" not in html.unescape(kind.group(1)).lower():
            continue
        title_match = re.search(r'class="h3[^"]*">([^<]+)', body)
        if not title_match:
            continue
        title = html.unescape(title_match.group(1)).strip()
        support = re.search(r'class="h4[^"]*">([^<]+)', body)
        if support:
            extra = html.unescape(support.group(1)).strip()
            extra = re.sub(r"(?i)^support:\s*", "", extra)
            if extra:
                title = f"{title} + {extra}"
        days = re.findall(r'class="b1-data[^"]*">([^<]+)', body)
        if len(days) < 4:
            continue
        day_n = int(re.sub(r"\D", "", days[1]) or "0")
        month = MONTHS_SHORT.get(days[2].strip().lower()[:3])
        year = int(re.sub(r"\D", "", days[3]) or "0")
        if not (day_n and month and year):
            continue
        place_match = re.search(r'class="b2 aa notranslate">([^<]+)', body)
        place = html.unescape(place_match.group(1)).strip() if place_match else "Debaser"
        if not re.search(r"strand|nova", place, re.I):
            continue
        when = datetime(year, month, day_n, 20, 0, tzinfo=TZ)
        if not in_range(when, start, end):
            continue
        if not is_concert(title, category="konsert"):
            continue
        url = "https://debaser.se" + match.group(1)
        if url in seen:
            continue
        seen.add(url)
        listing_img = re.search(
            r'url\(&quot;(/img/card/uploads/img/[^&]+)&quot;\)',
            html_page[max(0, match.start() - 3500) : match.start()],
        )
        image = pick_image("https://debaser.se" + listing_img.group(1) if listing_img else "")
        detail = ""
        time_str = "20:00"
        try:
            page = http_request(url)
            detail = page
            image = pick_image(og_image(page), image)
            doors = re.search(r"Dörrar\s+(\d{1,2})[.:](\d{2})", page, re.I)
            if doors:
                time_str = f"{int(doors.group(1)):02d}:{doors.group(2)}"
                when = when.replace(hour=int(time_str[:2]), minute=int(time_str[3:]))
        except Exception:
            page = ""
        event = make_event(
            "debaser",
            "Debaser",
            title,
            when,
            url,
            place=place,
            image=image,
            text=page_blurb(page=detail),
        )
        event.update(page_media_fields(detail, "debaser"))
        events.append(event)
    return events
