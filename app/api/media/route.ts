import { allowedStreamHost } from "@/lib/media-src";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function fetchStream(target: string, range: string | null, hops = 0): Promise<Response> {
  if (hops > 4) return new Response("För många omdirigeringar.", { status: 502 });
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return new Response("Ogiltig adress.", { status: 400 });
  }
  if (url.protocol !== "https:" || url.username || url.password || !allowedStreamHost(url.hostname)) {
    return new Response("Otillåten källa.", { status: 400 });
  }
  const headers = new Headers();
  if (range) headers.set("Range", range);
  const upstream = await fetch(url, { headers, redirect: "manual" });
  if (upstream.status >= 300 && upstream.status < 400) {
    const location = upstream.headers.get("location");
    if (!location) return new Response("Saknar omdirigering.", { status: 502 });
    return fetchStream(new URL(location, url).href, range, hops + 1);
  }
  const out = new Headers();
  for (const key of ["content-type", "content-length", "content-range", "accept-ranges"]) {
    const value = upstream.headers.get(key);
    if (value) out.set(key, value);
  }
  out.set("cache-control", "no-store");
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("u") || "";
  return fetchStream(target, request.headers.get("range"));
}
