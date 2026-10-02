import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// CLI entry point for the plain scrape (writes public/data/events.json).
// Loads .env so any env-dependent import behaves the same as the DB pipeline.

import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

const DEFAULT_PATH = path.join(process.cwd(), "public", "data", "events.json");

function argValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}

const HELP = `Användning: tsx scripts/fetch.ts [flaggor]

  --only <källa>          kör bara en källa (t.ex. debaser)
  --out <fil>             skriv till annan fil (standard public/data/events.json)
  --concurrency <n>       samtidiga HTTP-anrop (standard 6)
  --source-timeout <s>    per-källa timeout i sekunder (standard 90)
  --artist-timeout <s>    per-artistuppslag timeout i sekunder (standard 45)
  --track-concurrency <n> http-cap under låtfasen (standard 16)
  --no-tracks             hoppa över Bandcamp/SoundCloud-uppslag (snabb körning)
  --verbose-http          logga varje HTTP-anrop till stderr
  --quiet                 bara fasöversikter, inga rad-per-källa/event
  --help                  visa denna hjälp`;

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(HELP);
    return 0;
  }
  const only = argValue(args, "--only");
  const out = argValue(args, "--out");
  const concurrencyRaw = argValue(args, "--concurrency");
  const concurrency = concurrencyRaw ? Math.max(1, Number(concurrencyRaw) || 1) : undefined;
  const sourceTimeoutSec = Number(argValue(args, "--source-timeout") || 0);
  const artistTimeoutSec = Number(argValue(args, "--artist-timeout") || 0);
  const trackConcurrencyRaw = argValue(args, "--track-concurrency");
  const trackConcurrency = trackConcurrencyRaw
    ? Math.max(1, Number(trackConcurrencyRaw) || 1)
    : undefined;
  const tracks = !args.includes("--no-tracks");
  const quiet = args.includes("--quiet");

  const { collect } = await import("../lib/scrapers/collect");
  const { setHttpConcurrency, setHttpVerbose } = await import("../lib/scrapers/http");
  const { log, seconds } = await import("../lib/scrapers/log");
  if (concurrency) setHttpConcurrency(concurrency);
  if (args.includes("--verbose-http")) setHttpVerbose(true);

  const outPath = out ? path.resolve(out) : DEFAULT_PATH;
  const started = Date.now();
  log(`Start${only ? ` (endast ${only})` : ""}${tracks ? "" : " (utan låtar)"}`);

  const payload = await collect({
    only,
    concurrency,
    trackConcurrency,
    tracks,
    quiet,
    sourceTimeoutMs: sourceTimeoutSec ? sourceTimeoutSec * 1000 : undefined,
    artistTimeoutMs: artistTimeoutSec ? artistTimeoutSec * 1000 : undefined,
  });

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(payload, null, 2), "utf8");
  log(
    `Klart: ${payload.events.length} konserter, ${Object.keys(payload.errors).length} fel, ` +
      `${seconds(Date.now() - started)} totalt → ${outPath}`,
  );
  return Object.keys(payload.errors).length ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
