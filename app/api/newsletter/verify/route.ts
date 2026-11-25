import { NextResponse } from "next/server";

import { verifyNewsletter } from "@/lib/db/newsletter";
import { newsletterManageUrl, siteUrl } from "@/lib/newsletter/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!token) {
    return NextResponse.redirect(siteUrl("/"), 303);
  }

  await verifyNewsletter(token);
  // The manage page also handles an invalid token with a friendly message.
  return NextResponse.redirect(`${newsletterManageUrl(token)}?bekraftad=1`, 303);
}
