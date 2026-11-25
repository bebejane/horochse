// Newsletter subscribers.
//
// Imports `./client` (not `./index`) so scripts can reuse these helpers with
// `tsx` without tripping `server-only`. Writes are single statements; this
// remote libSQL client does not support interactive transactions reliably.

import { eq } from "drizzle-orm";

import { db } from "./client";
import { newsletter } from "./schema";

export type NewsletterFrequency = "weekly" | "monthly";

export type NewsletterSubscriber = typeof newsletter.$inferSelect;

export type SubscriptionInput = {
  email: string;
  venues: string[];
  frequency: NewsletterFrequency;
  token: string;
};

/** Lowercase and trim an address. The address is the primary key, so this must
 *  be the only way an address is stored or looked up. */
export function normalizeEmail(value: string): string {
  return String(value || "").trim().toLowerCase();
}

/** Stored as a comma-separated list of venue slugs. */
export function parseVenueList(value: string | null | undefined): string[] {
  return String(value || "")
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean);
}

export function serializeVenueList(venues: string[]): string {
  return [...new Set(venues.map((slug) => slug.trim()).filter(Boolean))].join(",");
}

export function normalizeFrequency(value: unknown): NewsletterFrequency {
  return value === "weekly" ? "weekly" : "monthly";
}

export async function getNewsletterByEmail(
  email: string,
): Promise<NewsletterSubscriber | null> {
  const [row] = await db
    .select()
    .from(newsletter)
    .where(eq(newsletter.email, normalizeEmail(email)))
    .limit(1);
  return row ?? null;
}

export async function getNewsletterByToken(
  token: string,
): Promise<NewsletterSubscriber | null> {
  const value = String(token || "").trim();
  if (!value) return null;
  const [row] = await db
    .select()
    .from(newsletter)
    .where(eq(newsletter.verificationToken, value))
    .limit(1);
  return row ?? null;
}

/** Insert a new subscriber. Existing rows must go through `updateNewsletter`. */
export async function insertNewsletter(input: SubscriptionInput): Promise<NewsletterSubscriber> {
  const now = new Date();
  const [row] = await db
    .insert(newsletter)
    .values({
      email: normalizeEmail(input.email),
      venues: serializeVenueList(input.venues),
      frequency: input.frequency,
      validated: false,
      verificationToken: input.token,
      mailedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row;
}

/** Update an existing subscriber's preferences. Keeps `validated` and token. */
export async function updateNewsletter(
  email: string,
  input: { venues: string[]; frequency: NewsletterFrequency },
): Promise<NewsletterSubscriber | null> {
  const [row] = await db
    .update(newsletter)
    .set({
      venues: serializeVenueList(input.venues),
      frequency: input.frequency,
      updatedAt: new Date(),
    })
    .where(eq(newsletter.email, normalizeEmail(email)))
    .returning();
  return row ?? null;
}

/** Mark the address as confirmed. Returns the updated row, or null. */
export async function verifyNewsletter(token: string): Promise<NewsletterSubscriber | null> {
  const value = String(token || "").trim();
  if (!value) return null;
  const [row] = await db
    .update(newsletter)
    .set({ validated: true, updatedAt: new Date() })
    .where(eq(newsletter.verificationToken, value))
    .returning();
  return row ?? null;
}

/** Update preferences from the tokenized manage page. */
export async function updateNewsletterByToken(
  token: string,
  input: { venues: string[]; frequency: NewsletterFrequency },
): Promise<NewsletterSubscriber | null> {
  const value = String(token || "").trim();
  if (!value) return null;
  const [row] = await db
    .update(newsletter)
    .set({
      venues: serializeVenueList(input.venues),
      frequency: input.frequency,
      updatedAt: new Date(),
    })
    .where(eq(newsletter.verificationToken, value))
    .returning();
  return row ?? null;
}

/** Delete the subscriber behind a manage/unsubscribe token. */
export async function deleteNewsletterByToken(token: string): Promise<boolean> {
  const value = String(token || "").trim();
  if (!value) return false;
  const result = await db
    .delete(newsletter)
    .where(eq(newsletter.verificationToken, value));
  return result.rowsAffected > 0;
}

/** Every confirmed subscriber. The cron decides due-ness in Stockholm time. */
export async function loadValidatedNewsletter(): Promise<NewsletterSubscriber[]> {
  return db.select().from(newsletter).where(eq(newsletter.validated, true));
}

/** Record a successful digest send. */
export async function markNewsletterMailed(email: string, at: Date = new Date()): Promise<void> {
  await db
    .update(newsletter)
    .set({ mailedAt: at })
    .where(eq(newsletter.email, normalizeEmail(email)));
}
