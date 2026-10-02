#!/usr/bin/env python3
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import fetch  # noqa: E402


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Ogiltig förfrågan."}))
        return 1
    kind = sys.argv[1]
    payload = None
    try:
        if kind == "bandcamp" and len(sys.argv) >= 4:
            payload = fetch.bandcamp_stream_url(int(sys.argv[2]), int(sys.argv[3]), sys.argv[4] if len(sys.argv) > 4 else "a")
        elif kind == "soundcloud" and len(sys.argv) >= 3:
            payload = fetch.soundcloud_stream_url(int(sys.argv[2]))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        return 2
    if not payload:
        print(json.dumps({"error": "Ingen stream hittades."}))
        return 2
    print(json.dumps(payload))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
