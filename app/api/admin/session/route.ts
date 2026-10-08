import { NextResponse } from "next/server";

import { adminPassword, isAdmin } from "@/lib/admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!adminPassword()) {
    return NextResponse.json(
      { error: "Admin är inte konfigurerad." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!(await isAdmin())) {
    return NextResponse.json(
      { error: "Logga in." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
