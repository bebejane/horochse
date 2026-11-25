// Opaque bearer token for the newsletter verify / manage / unsubscribe links.
// 32 random bytes in base64url; long enough that guessing is not a concern.

import { randomBytes } from "node:crypto";

export function createNewsletterToken(): string {
  return randomBytes(32).toString("base64url");
}
