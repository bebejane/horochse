// Trigger the deployed Vercel cron and stream its logs to the terminal.
//
// Usage: pnpm scrape:logs [--only <source>] [--no-tracks] [--site <url>]
//
// Starts `vercel logs --follow` first (so early output isn't missed), then
// triggers GET /api/cron/scrape on the deployed app and pipes the follow stream
// through a grep for that route. Ctrl-C stops watching; the remote run continues.
//
// Requires: `vercel login` + `vercel link` in this directory, and CRON_SECRET in
// .env. Picks the site from --site, then SCRAPE_SITE_URL, then a remote
// NEXT_PUBLIC_SITE_URL, else https://horochse.vercel.app.

import { spawn } from "node:child_process";

import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

const DEFAULT_SITE = "https://horochse.vercel.app";
const ROUTE = "/api/cron/scrape";

const HELP = `Användning: pnpm scrape:logs [flaggor]

  --only <källa>   kör bara en källa (t.ex. debaser)
  --no-tracks      hoppa över Bandcamp/SoundCloud-uppslag
  --site <url>     annan bas-URL (annars SCRAPE_SITE_URL / produktion)
  --help           visa denna hjälp`;

function argValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}

function siteUrl(override?: string): string {
  const candidates = [override, process.env.SCRAPE_SITE_URL].filter(Boolean) as string[];
  // `NEXT_PUBLIC_SITE_URL` is often localhost in dev; only trust it if remote.
  const publicUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (publicUrl && /^https?:\/\//.test(publicUrl) && !/localhost|127\.0\.0\.1/.test(publicUrl)) {
    candidates.push(publicUrl);
  }
  const raw = candidates[0] || DEFAULT_SITE;
  return raw.replace(/\/+$/, "");
}

async function trigger(only: string | undefined, tracks: boolean | undefined, site: string): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("CRON_SECRET saknas i .env — kan inte trigga cronen.");
    process.exit(1);
  }
  const params = new URLSearchParams({ secret });
  if (only) params.set("only", only);
  if (tracks === false) params.set("tracks", "false");
  const url = `${site}${ROUTE}?${params.toString()}`;
  console.log(
    `Trigger: ${site}${ROUTE}${only ? ` (only=${only})` : ""}${tracks === false ? " (tracks=false)" : ""}`,
  );

  const res = await fetch(url, { headers: { accept: "application/json" } });
  const text = await res.text();
  console.log(`Cron svar: HTTP ${res.status}`);
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
}

function followLogs(): void {
  // `vercel logs --follow` streams deployment logs; filter to the cron route.
  const logs = spawn("vercel", ["logs", "--follow", "--no-color"], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const grep = spawn("grep", ["--line-buffered", ROUTE], {
    stdio: ["pipe", "inherit", "inherit"],
  });
  logs.stdout.pipe(grep.stdin);
  logs.on("error", (err) => {
    console.error("Kunde inte starta `vercel logs`:", err.message);
    console.error("Kör `vercel link` / `vercel login` och försök igen.");
  });
  process.on("SIGINT", () => {
    logs.kill("SIGINT");
    grep.kill("SIGINT");
    process.exit(0);
  });
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(HELP);
    return;
  }
  const only = argValue(args, "--only");
  const tracks = args.includes("--no-tracks") ? false : undefined;
  const site = siteUrl(argValue(args, "--site"));

  followLogs();

  // Give the log stream a moment to connect before firing the request.
  setTimeout(() => {
    trigger(only, tracks, site).catch((err) => {
      console.error("Trigger misslyckades:", err instanceof Error ? err.message : err);
    });
  }, 4000);

  console.log(`Följer loggar från ${site} (Ctrl-C för att sluta). Triggaren skickas strax…`);
}

main();
