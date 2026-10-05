import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const rs = await db.execute(
  "select artist_key, artist, found, release from bandcamp_artists where artist_key like '%stern%' or artist_key like '%property%'",
);
for (const row of rs.rows) {
  const rel = row.release ? String(row.release).slice(0, 240) : null;
  console.log(row.artist_key, "found=" + row.found, rel);
}
