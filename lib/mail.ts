// Postmark transactional email for cron run reports.
//
// Server-only. Reads POSTMARK_API_TOKEN / POSTMARK_FROM_NAME /
// POSTMARK_FROM_EMAIL from the environment. Sending is best-effort: a mail
// failure must never fail the scrape, so callers get a boolean and the error is
// logged rather than thrown.

import { warn } from "./scrapers/log";

const POSTMARK_ENDPOINT = "https://api.postmarkapp.com/email";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  tag?: string;
};

function fromAddress(): string {
  const email = (process.env.POSTMARK_FROM_EMAIL || "").trim().replace(/^"|"$/g, "");
  const name = (process.env.POSTMARK_FROM_NAME || "").trim().replace(/^"|"$/g, "");
  return name ? `${name} <${email}>` : email;
}

export function mailConfigured(): boolean {
  return Boolean(process.env.POSTMARK_API_TOKEN && process.env.POSTMARK_FROM_EMAIL);
}

export async function sendMail(message: MailMessage): Promise<boolean> {
  const token = process.env.POSTMARK_API_TOKEN;
  if (!token) {
    warn("postmark: POSTMARK_API_TOKEN saknas — skickar inget mail");
    return false;
  }
  try {
    const res = await fetch(POSTMARK_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": token,
      },
      body: JSON.stringify({
        From: fromAddress(),
        To: message.to,
        Subject: message.subject,
        TextBody: message.text,
        HtmlBody: message.html || undefined,
        MessageStream: "outbound",
        Tag: message.tag || "scrape-report",
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      warn(`postmark: HTTP ${res.status} ${body.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (err) {
    warn(`postmark: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}
