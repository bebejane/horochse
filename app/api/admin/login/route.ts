import { NextResponse } from "next/server";

import { adminCookie, adminPassword, passwordMatches } from "@/lib/admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!adminPassword()) {
    return NextResponse.json({ error: "Admin är inte konfigurerad." }, { status: 503 });
  }
  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";
  if (!passwordMatches(password)) {
    return NextResponse.json({ error: "Fel lösenord." }, { status: 401 });
  }
  const cookie = adminCookie();
  const response = NextResponse.json({ ok: true });
  if (cookie) response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
