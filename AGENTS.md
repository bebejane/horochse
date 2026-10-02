<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Hör & Se — agent notes

Stockholm concert aggregator. A Next.js 16 App Router client app (React 19, Turbopack) reads `public/data/events.json`; a TypeScript scraper in `lib/scrapers/` regenerates that file and resolves Bandcamp/SoundCloud playback. UI text, identifiers, and comments are in Swedish. All scraping/streaming is TypeScript — the Python implementation has been removed; do not reintroduce Python or `child_process`.

## Commands

- `pnpm install` then `pnpm dev` → http://localhost:3000. Dev compiles without typechecking.
- `pnpm run fetch` — runs `tsx scripts/fetch.ts`; rewrites the tracked `public/data/events.json` for the next 5 weeks. Slow and network-heavy (all venue sites + Bandcamp/SoundCloud). Flags: `--only <source>` (single venue, e.g. `debaser`), `--out <file>`, `--concurrency <n>` (venue-stage HTTP cap, default 6), `--track-concurrency <n>` (track-stage HTTP cap, default 16), `--source-timeout <s>` (default 90), `--artist-timeout <s>` (default 45), `--no-tracks` (skip lookups for a fast structural run), `--verbose-http` (log every request to stderr), `--quiet`. A failing venue is recorded under `errors` and does not abort the run. **Use `pnpm run fetch`, not `pnpm fetch`** — the latter is a pnpm built-in.
- Execution model: two speed-critical shapes. **Venues** run in a small pool (4) with a 90 s per-source timeout; venue detail-page loops must use `mapPool`, never serial `for … await`. **Tracks** run a 24-wide event pool with each event's artists looked up concurrently (phase-ordered bandcamp → soundcloud), under a wider HTTP cap (`withHttpConcurrency`). The cap is the throttle — never add `sleep()`. Progress uses `lib/scrapers/log.ts` (`log`/`warn`/`mapPool`/`withTimeout`/`memoInflight`); artist results are cached across the run in `tracks.ts`.
- `pnpm run diff:events <a.json> <b.json>` — parity/diff tool: per-venue counts (flags mismatches and silently-empty scrapers) plus field, image, and track differences.
- `pnpm db:generate` / `db:push` / `db:migrate` / `db:studio` — Drizzle/Turso (see Database).
- `pnpm lint` — `eslint` (flat config). **Currently unusable**: crashes on any file with `TypeError: contextOrFilename.getFilename is not a function` because `eslint-plugin-react@7.37.5` is incompatible with the pinned `eslint@10`. Fix deps before relying on it.
- `npx tsc --noEmit` — typecheck. **Currently fails** on ~33 pre-existing errors in `components/Mast.tsx` (strict-null DOM lookups and React 19 rejecting custom CSS properties in `style`). `pnpm build` compiles but then fails at the same "Running TypeScript" step. Don't assume a green baseline; touching `Mast.tsx` inherits these.
- No test suite. `tsconfig.tsbuildinfo` is tracked and rewritable by tsc/next — revert it if you don't mean to commit it.

## Architecture

- `app/page.tsx` (server) renders `components/ConcertApp.tsx`, a single `"use client"` tree. It fetches `/data/events.json` at runtime with `cache: "no-store"` (not imported), so editing the JSON shows on reload with no rebuild. UI state lives in `localStorage` under `konserter-*`.
- Server routes, all `runtime = "nodejs"` + `force-dynamic`:
  - `app/bandcamp/stream`, `app/soundcloud/stream` — call `lib/scrapers/stream.ts` (`bandcampStreamUrl` / `soundcloudStreamUrl`) directly. No child process, no Python.
  - `app/kalender/[id]` — serves `.ics`; reads the JSON from disk through `lib/load-events.ts` and drops cancelled events.
- `lib/types.ts` is the contract shared by `events.json` and the UI.

## Scraper (`lib/scrapers/`)

- `http.ts` — `httpRequest`/`httpJson` over global `fetch` (form/JSON bodies, `HttpError.status`, 429 backoff).
- `dates.ts` — Luxon with `Europe/Stockholm`; `TZ`, `weekBounds`, date parsing, `iso*` formatters. **Do not use `Date` for venue dates** — DST correctness lives here.
- `html.ts` (`he` entity decode, `stripTags`, `pickImage`, `ogImage`), `text.ts` (folding/artist match/title casing), `filters.ts`, `links.ts`, `jsonld.ts`, `events.ts` (`eventId`, `makeEvent`).
- `bandcamp.ts`, `soundcloud.ts`, `tracks.ts` — track resolution engine. `collect.ts` runs `registry.SOURCES`, filters club-nights/cancelled, sorts, attaches tracks, and normalizes titles; `scripts/fetch.ts` is the CLI and writes `public/data/events.json`.
- `sources/{jsonld-site,live,ticketmaster,slakthusen}.ts` — reusable fetchers. `venues/<slug>.ts` — one `fetch(start, end): Promise<ScrapedEvent[]>` per venue.
- Adding a venue: create `lib/scrapers/venues/<slug>.ts`, register it in `lib/scrapers/registry.ts` (`SOURCES`), add the slug to `VENUES`/`VenueSlug` in `lib/types.ts`, and add an address in `lib/ics.ts` (`VENUE_ADDRESSES`) if calendars should locate it.
- Slakthusen stages (`slaktkyrkan`, `hus7`) all delegate to `sources/slakthusen.ts` and emit `venue_slug: "slakthusen"` with the stage in `place`.
- Window is fixed at `WEEKS = 5` in `dates.ts`. No API keys: the SoundCloud `client_id` is scraped from soundcloud.com at runtime; Bandcamp uses its public mobile API.
- **Bandcamp rate limits:** `autocomplete_elastic` (the search endpoint) can 429 an IP for a while. `httpJson` throttles same-host calls (see `HOST_LIMITS` in `http.ts`) with exponential backoff + jitter, and `bandcamp.ts` opens a 10-min circuit (`isBandcampSearchBlocked`) so a block skips search-assisted lookups instead of retrying every artist. A blocked search just means fewer tracks; the run is unaffected. The mobile API (`tralbum_details`/`band_details`) is not rate-limited the same way.
- **Event-page fetches in the track phase** (`takePageLinks`) skip Ticketmaster/Live Nation hosts (`EVENT_PAGE_SKIP_HOSTS` in `links.ts`) — they need a session cookie, always 401, and never expose music links. Other hosts log a single `evenemangssida … HTTP 4xx (hoppar över)` line via `warn` instead of a stack trace; the lookup continues using `text`/`title` only.
- Preserve the `eventId` algorithm and JSON field shape — ICS URLs and `localStorage` keys depend on them.

## Duplicated logic — keep both sides in sync

Title casing, cancellation detection, and non-concert/club filtering exist in **two** places:
- Scraper: `lib/scrapers/text.ts` (`displayTitle`, `isCancelled`, `isClubNight`, `TITLE_NAME_SKIP`) and `filters.ts`.
- Client: `lib/events.ts` (`displayTitle`, `isCancelledEvent`, `filteredEvents`, `TITLE_SKIP`).

Changing one side only makes the stored events and the rendered UI disagree.

## Database (Drizzle + Turso)

- `lib/db/schema.ts` holds `venues`, `sources`, `events`, `tracks`, `scrape_runs`, `scrape_errors`. `lib/db/queries.ts` is the data-access layer (write helpers `upsertEvents`/`reconcileSource`/`startScrapeRun`/… plus read helpers `loadPayload`/`loadEvents`/`findEvent`). `lib/db/client.ts` deliberately omits `server-only` so `tsx` scripts can reuse it; `lib/db/index.ts` re-exports it with the `server-only` guard for the app.
- Env: `TURSO_DATABASE_URL` (required) and `TURSO_AUTH_TOKEN` (optional for a local `file:` DB); both live in the gitignored `.env`.
- Migration workflow: `pnpm db:generate` → commit `./drizzle` → `pnpm db:push` (dev) or `pnpm db:migrate`. drizzle-kit loads `.env` itself.

## Scrape → Turso cron

- `lib/scrapers/store.ts` → `scrapeAndStore(opts)`: runs `collect()`, seeds `venues`/`sources`, upserts events + tracks, reconciles sources that ran cleanly, and records a `scrape_run`. It is the single shared writer; do not duplicate this logic.
- Two entry points, same function:
  - `pnpm scrape:db` — CLI (`scripts/scrape-to-db.ts`), for system crontab / GitHub Actions. Flags `--only`, `--no-tracks`, `--quiet`.
  - `GET /api/cron/scrape` — Vercel Cron (scheduled in `vercel.json`, daily 05:00 UTC). Guarded by `Authorization: Bearer $CRON_SECRET` (Vercel sends this) or `?secret=`; `&tracks=false` and `&only=` are supported for cheap manual runs. `maxDuration = 300` because a full run is ~5 min — **needs a Vercel plan allowing 300 s**, not Hobby's 60 s.
- `collect()` returns `provenance` (event id → source key) and `okSources`; these drive `events.source_key` and per-source reconciliation and are **not** part of `events.json`.
- The app still reads `public/data/events.json` (`lib/load-events.ts`); Turso is write-only for now. Switching the read path to `loadPayload()` is a separate change.
- For local runs, load `.env` explicitly: `node --env-file=.env --import tsx scripts/scrape-to-db.ts` (plain `tsx` via the pnpm shim can break under an inherited `NODE_OPTIONS`).

## Environment / tooling gotchas

- The scraper and app need **no** env vars; the Turso client reads `TURSO_DATABASE_URL` (+ optional `TURSO_AUTH_TOKEN`) from the gitignored `.env`, where the keys already exist.
- The working install is **pnpm** (`node_modules` is pnpm, `pnpm-workspace.yaml` + `pnpm-lock.yaml` are maintained, `allowBuilds: esbuild` is required by drizzle-kit), even though the README says npm and `package-lock.json` is stale. Prefer pnpm and don't regenerate `package-lock.json`.
- `next dev` auto-manages the `<!-- BEGIN:nextjs-agent-rules -->` block at the top of this file, plus `CLAUDE.md` (which is just `@AGENTS.md`). Leave it in place. Disable generation with `agentRules: false` in `next.config.ts`.
- This Next.js (16.3.6) / React 19 are newer than many model cutoffs. Read `node_modules/next/dist/docs/` before using unfamiliar APIs.
