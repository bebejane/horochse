// Render (and optionally send) a newsletter digest without waiting for cron.
//
//   pnpm newsletter:preview
//   pnpm newsletter:preview --frequency weekly --venues debaser,nalen
//   pnpm newsletter:preview --to you@example.com
//
// Without --to it writes .cache/newsletter-preview.html and .txt.

import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

config({ path: [".env.local", ".env"], quiet: true });

function argValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const frequency = argValue(args, "--frequency") === "weekly" ? "weekly" : "monthly";
  const only = argValue(args, "--venues");
  const to = argValue(args, "--to");

  const [{ loadPayload }, { buildDigest }, { renderDigestMail }, { sendMail, mailConfigured }, { VENUES }, { newsletterManageUrl, newsletterUnsubscribeUrl, newsletterImageBaseUrl, siteUrl }] =
    await Promise.all([
      import("../lib/db/queries"),
      import("../lib/newsletter/digest"),
      import("../lib/newsletter/render"),
      import("../lib/mail"),
      import("../lib/types"),
      import("../lib/newsletter/site"),
    ]);

  const venues = only
    ? only.split(",").map((slug) => slug.trim()).filter(Boolean)
    : VENUES.map((venue) => venue.slug);

  const payload = await loadPayload();
  const token = "preview-token";
  const view = buildDigest({
    subscriber: { venues: venues.join(","), frequency },
    events: payload.events ?? [],
    manageUrl: newsletterManageUrl(token),
    unsubscribeUrl: newsletterUnsubscribeUrl(token),
    siteUrl: siteUrl(),
  });

  const mail = await renderDigestMail(view);
  const dir = path.join(process.cwd(), ".cache");
  await mkdir(dir, { recursive: true });
  const htmlPath = path.join(dir, "newsletter-preview.html");
  const textPath = path.join(dir, "newsletter-preview.txt");
  await writeFile(htmlPath, mail.html, "utf8");
  await writeFile(textPath, mail.text, "utf8");

  console.log(`Ämne: ${mail.subject}`);
  console.log(`Bas-URL: ${siteUrl("/")}`);
  console.log(`Bild-URL: ${newsletterImageBaseUrl()}`);
  console.log(`Konserter: ${view.eventCount}${view.capped ? " (kapad)" : ""}`);
  console.log(`HTML: ${htmlPath}`);
  console.log(`Text: ${textPath}`);

  if (to) {
    if (!mailConfigured()) {
      console.error("Postmark är inte konfigurerat (POSTMARK_API_TOKEN / POSTMARK_FROM_EMAIL).");
      return 1;
    }
    const ok = await sendMail({
      to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      tag: "newsletter-preview",
    });
    console.log(ok ? `Skickat till ${to}` : "Kunde inte skicka");
    return ok ? 0 : 1;
  }

  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
