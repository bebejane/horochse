import { NextResponse } from "next/server";

import { deleteNewsletterByToken } from "@/lib/db/newsletter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST-only on purpose: mail scanners follow GET links, and a prefetched
 *  unsubscribe must not remove a subscriber. */
export async function POST(request: Request) {
  const url = new URL(request.url);
  let token = url.searchParams.get("token") || "";

  if (!token) {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      token = String(body?.token || "");
    } else {
      const form = await request.formData().catch(() => null);
      token = String(form?.get("token") || "");
    }
  }

  if (!token.trim()) {
    return NextResponse.json({ error: "Länken saknar token." }, { status: 400 });
  }

  // Idempotent: an already removed address is not an error.
  await deleteNewsletterByToken(token);
  return NextResponse.json({ ok: true });
}
