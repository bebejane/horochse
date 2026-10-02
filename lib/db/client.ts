import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema";

/**
 * Turso (libSQL) client for Drizzle.
 *
 * Deliberately does NOT import `server-only`, so CLI scripts run with `tsx`
 * (which resolve the package's throwing `default` export) can reuse it.
 * `lib/db/index.ts` adds the `server-only` guard for the Next.js app.
 *
 * Required env vars (see `.env`): TURSO_DATABASE_URL, TURSO_AUTH_TOKEN.
 * `TURSO_AUTH_TOKEN` is optional for a local `file:` database.
 */
export function createTursoClient(): Client {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TURSO_DATABASE_URL is not set. Add it to .env before using lib/db.",
    );
  }
  return createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
}

// Next.js dev re-evaluates modules on hot reload; reuse one client so we
// don't leak libSQL connections.
const globalForDb = globalThis as unknown as { tursoClient?: Client };
const client = globalForDb.tursoClient ?? createTursoClient();
if (process.env.NODE_ENV !== "production") globalForDb.tursoClient = client;

export const db = drizzle(client, { schema });
export { client };
export type Database = typeof db;
