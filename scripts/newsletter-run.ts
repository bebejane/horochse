// Run the newsletter cron locally, without Vercel or CRON_SECRET.
//
// Loads .env, reads the validated subscribers from Turso and sends (or dry-runs)
// the digests. Useful for testing the Monday/1st logic:
//
//   pnpm newsletter:run --dry
//   pnpm newsletter:run --force --email du@exempel.se
//   pnpm newsletter:run --force --now 2026-12-01
//
// Be careful with --force without --email: it considers every validated
// subscriber due.

import { config } from "dotenv";
import { DateTime } from "luxon";

config({ path: [".env.local", ".env"], quiet: true });

const TZ = "Europe/Stockholm";

const HELP = `Användning: pnpm newsletter:run [flaggor]

  --dry              räkna utan att skicka
  --force            ignorera måndag/1:a/mailed_at
  --email <adress>   kör bara den adressen
  --now <datum>      låtsas att det är datumet (YYYY-MM-DD, Stockholm)
  --cap <antal>      max konserter per mail (standard 80)
  --help             visa den här hjälpen

Exempel:
  pnpm newsletter:run --dry
  pnpm newsletter:run --force --email du@exempel.se
  pnpm newsletter:run --force --now 2026-12-01`;

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

  const dry = args.includes("--dry");
  const force = args.includes("--force");
  const emailArg = argValue(args, "--email");
  const nowArg = argValue(args, "--now");
  const capArg = argValue(args, "--cap");

  let cap: number | undefined;
  if (capArg !== undefined) {
    cap = Number(capArg);
    if (!Number.isFinite(cap) || cap <= 0) {
      console.error("--cap måste vara ett positivt tal.");
      return 2;
    }
  }

  let now: DateTime | undefined;
  if (nowArg !== undefined) {
    const parsed = DateTime.fromISO(nowArg, { zone: TZ });
    if (!parsed.isValid) {
      console.error("--now måste vara ett datum, t.ex. 2026-12-01.");
      return 2;
    }
    now = parsed.startOf("day");
  }

  const [{ sendDueDigests }, { newsletterEmail }] = await Promise.all([
    import("../lib/newsletter/send"),
    import("../lib/newsletter/validate"),
  ]);

  let email: string | undefined;
  if (emailArg !== undefined) {
    const normalized = newsletterEmail(emailArg);
    if (!normalized) {
      console.error("--email är inte en giltig e-postadress.");
      return 2;
    }
    email = normalized;
  }

  const result = await sendDueDigests({ dry, force, email, now, cap });
  console.log(JSON.stringify(result, null, 2));
  return result.failed ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
