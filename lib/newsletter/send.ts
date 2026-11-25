// Sends the newsletter confirmation and the weekly/monthly digests.
//
// Sending is best-effort: one failed address must not abort the run, so
// `sendMail` returns a boolean and failures are counted. `mailed_at` is only
// updated after Postmark accepts the mail, which makes the next daily run a
// retry.

import type { NewsletterSubscriber } from "@/lib/db/newsletter";
import {
  loadValidatedNewsletter,
  markNewsletterMailed,
  normalizeEmail,
  normalizeFrequency,
  parseVenueList,
} from "@/lib/db/newsletter";
import { loadPayload } from "@/lib/db/queries";
import { sendMail } from "@/lib/mail";
import { mapPool, warn } from "@/lib/scrapers/log";
import { VENUES } from "@/lib/types";
import { buildDigest, DIGEST_EVENT_CAP, frequencyLabel, isDigestDue, stockholmToday } from "./digest";
import { renderConfirmMail, renderDigestMail } from "./render";
import {
  newsletterManageUrl,
  newsletterUnsubscribeApiUrl,
  newsletterUnsubscribeUrl,
  newsletterVerifyUrl,
  siteUrl,
} from "./site";
import { venueColor } from "./theme";

function subscriberVenues(subscriber: NewsletterSubscriber): { name: string; color: string }[] {
  const slugs = new Set(parseVenueList(subscriber.venues));
  return VENUES.filter((venue) => slugs.has(venue.slug))
    .sort((a, b) => a.name.localeCompare(b.name, "sv"))
    .map((venue) => ({ name: venue.name, color: venueColor(venue.slug) }));
}

export async function sendNewsletterConfirmation(
  subscriber: NewsletterSubscriber,
): Promise<boolean> {
  try {
    const rendered = await renderConfirmMail({
      venues: subscriberVenues(subscriber),
      frequency: frequencyLabel(normalizeFrequency(subscriber.frequency)),
      verifyUrl: newsletterVerifyUrl(subscriber.verificationToken),
      manageUrl: newsletterManageUrl(subscriber.verificationToken),
      unsubscribeUrl: newsletterUnsubscribeUrl(subscriber.verificationToken),
    });
    return await sendMail({
      to: subscriber.email,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      tag: "newsletter-confirm",
    });
  } catch (err) {
    warn(
      `newsletter: bekräftelsemail till ${subscriber.email} misslyckades — ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return false;
  }
}

export type DigestRunResult = {
  dry: boolean;
  force: boolean;
  now: string;
  email?: string;
  subscribers: number;
  due: number;
  sent: number;
  skipped: number;
  failed: number;
};

export type DigestRunOptions = {
  dry?: boolean;
  /** Ignore the Monday/1st/mailed_at check and consider every validated row due. */
  force?: boolean;
  /** Limit the run to one address. */
  email?: string;
  /** Pretend it is this Stockholm day. */
  now?: ReturnType<typeof stockholmToday>;
  cap?: number;
};

/** Send every digest that is due at `now` (Stockholm). `dry` renders nothing and
 *  sends nothing, but reports what would happen. `force` bypasses the due check;
 *  `email` limits the run to one subscriber. */
export async function sendDueDigests(options: DigestRunOptions = {}): Promise<DigestRunResult> {
  const now = options.now ?? stockholmToday();
  const dry = Boolean(options.dry);
  const force = Boolean(options.force);
  const email = options.email ? normalizeEmail(options.email) : "";
  const cap = options.cap ?? DIGEST_EVENT_CAP;

  const subscribers = await loadValidatedNewsletter();
  const candidates = email
    ? subscribers.filter((subscriber) => subscriber.email === email)
    : subscribers;
  const due = force
    ? candidates
    : candidates.filter((subscriber) => isDigestDue(subscriber, now));

  const result: DigestRunResult = {
    dry,
    force,
    now: now.toISODate() ?? "",
    email: email || undefined,
    subscribers: subscribers.length,
    due: due.length,
    sent: 0,
    skipped: 0,
    failed: 0,
  };
  if (!due.length) return result;

  const payload = await loadPayload();
  const events = payload.events ?? [];

  await mapPool(due, 5, async (subscriber) => {
    const view = buildDigest({
      subscriber,
      events,
      now,
      cap,
      manageUrl: newsletterManageUrl(subscriber.verificationToken),
      unsubscribeUrl: newsletterUnsubscribeUrl(subscriber.verificationToken),
      siteUrl: siteUrl(),
    });
    if (!view.eventCount) {
      result.skipped += 1;
      return;
    }
    if (dry) {
      result.sent += 1;
      return;
    }

    try {
      const rendered = await renderDigestMail(view);
      const ok = await sendMail({
        to: subscriber.email,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        tag: "newsletter-digest",
        headers: {
          "List-Unsubscribe": `<${newsletterUnsubscribeApiUrl(subscriber.verificationToken)}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      if (!ok) {
        result.failed += 1;
        return;
      }
      await markNewsletterMailed(subscriber.email);
      result.sent += 1;
    } catch (err) {
      result.failed += 1;
      warn(
        `newsletter: ${subscriber.email} kunde inte skickas — ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  });

  return result;
}
