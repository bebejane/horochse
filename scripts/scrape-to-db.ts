// CLI entry point for the scrape → Turso pipeline.
//
// Used by an external scheduler (system crontab / GitHub Actions) as an
// alternative to the Vercel cron route. Reuses the same `scrapeAndStore`.

// Load .env before any module that reads process.env at import time. `tsx` does
// not load env files, and `pnpm scrape:db` does not pass --env-file, so this is
// what makes the CLI see TURSO_DATABASE_URL / TURSO_AUTH_TOKEN.
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

const HELP = `Användning: tsx scripts/scrape-to-db.ts [flaggor]

  --only <källa>   kör bara en källa (t.ex. debaser)
  --no-tracks      hoppa över Bandcamp/SoundCloud-uppslag
  --quiet          bara fasöversikter
  --help           visa denna hjälp`;

function argValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(HELP);
    return 0;
  }
  const only = argValue(args, "--only");
  const tracks = !args.includes("--no-tracks");
  const quiet = args.includes("--quiet");

  const { scrapeAndStore } = await import("../lib/scrapers/store");
  const summary = await scrapeAndStore({ only, tracks, quiet });
  console.log(JSON.stringify(summary, null, 2));
  return summary.ok ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
