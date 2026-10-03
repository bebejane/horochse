import { NextResponse } from "next/server";

import { verifyImageSignature } from "@/lib/image-sign";
import { normalizeWidth, proxyImage } from "@/lib/image-proxy";

// Image proxy: fetch a remote original, resize, and serve with long-lived
// caching. Node runtime because `sharp` is native.
//
// Only signed URLs are accepted (see `lib/image-sign.ts`): the HMAC over
// `url|w` means arbitrary `?url=` requests are rejected, so this cannot be
// abused as an open SSRF proxy or a resize service.
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  const width = normalizeWidth(searchParams.get("w"));
  const sig = searchParams.get("sig") || "";

  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }
  if (!verifyImageSignature(url, width, sig)) {
    return new NextResponse(null, { status: 403 });
  }

  const accept = request.headers.get("accept") || "";
  let result;
  try {
    result = await proxyImage(url, width, accept);
  } catch (err) {
    // Not an allowed host (or bad input): don't proxy, don't leak internals.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Bad request" },
      { status: 400 },
    );
  }

  if ("redirect" in result) {
    return NextResponse.redirect(url, 307);
  }

  return new NextResponse(new Uint8Array(result.body), {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "X-Content-Type-Options": "nosniff",
      // Immutable because the URL encodes content (source url + width + format).
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
      "Content-Length": String(result.body.byteLength),
    },
  });
}
