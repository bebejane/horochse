import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "horochse_admin";

export function adminPassword(): string | null {
  const value = process.env.ADMIN_PASSWORD?.trim() ?? "";
  return value || null;
}

export function passwordMatches(given: string): boolean {
  const expected = adminPassword();
  if (!expected || !given) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function sessionValue(password: string): string {
  return createHmac("sha256", password).update("horochse-admin").digest("base64url");
}

export async function isAdmin(): Promise<boolean> {
  const password = adminPassword();
  if (!password) return false;
  const jar = await cookies();
  const got = jar.get(ADMIN_COOKIE)?.value ?? "";
  const expected = sessionValue(password);
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function adminCookie() {
  const password = adminPassword();
  if (!password) return null;
  return {
    name: ADMIN_COOKIE,
    value: sessionValue(password),
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    },
  };
}
