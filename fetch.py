#!/usr/bin/env python3
"""Hämta konserter. En scraper per scen ligger i scrapers/venues/."""

from scrapers.core import bandcamp_stream_url, collect, main, soundcloud_stream_url

__all__ = ["bandcamp_stream_url", "soundcloud_stream_url", "collect", "main"]


if __name__ == "__main__":
    raise SystemExit(main())
