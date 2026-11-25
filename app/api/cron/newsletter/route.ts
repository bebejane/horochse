import { NextResponse } from "next/server";
import { DateTime } from "luxon";

import { cronAuthorized } from "@/lib/cron-auth";
import { mailConfigured } from "@/lib/mail";
import { NEWSLETTER_TZ } from "@/lib/newsletter/digest";
import { sendDueDigests } from "@/lib/newsletter/send";
import { newsletterEmail } from "@/lib/newsletter/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dry = url.searchParams.get("dry") === "1";
  const force = url.searchParams.get("force") === "1";

  const emailParam = url.searchParams.get("email");
  const email = emailParam ? newsletterEmail(emailParam) : null;
  if (emailParam && !email) {
    return NextResponse.json(
      { error: "Ogiltig e-postadress i email." },
      { status: 400 },
    );
  }

  const nowParam = url.searchParams.get("now");
  let now: DateTime | undefined;
  if (nowParam) {
    const parsed = DateTime.fromISO(nowParam, { zone: NEWSLETTER_TZ });
    if (!parsed.isValid) {
      return NextResponse.json(
        { error: "Ogiltigt datum i now. Använd YYYY-MM-DD." },
        { status: 400 },
      );
    }
    now = parsed.startOf("day");
  }

  if (!mailConfigured() && !dry) {
    return NextResponse.json(
      { error: "Postmark är inte konfigurerat (POSTMARK_API_TOKEN / POSTMARK_FROM_EMAIL)." },
      { status: 503 },
    );
  }

  try {
    const result = await sendDueDigests({ dry, force, email: email ?? undefined, now });
    console.log("newsletter cron", result);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.stack || err.message : String(err);
    console.error("newsletter cron failed", message);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
