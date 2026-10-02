<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Hör & Se — agent notes

Stockholm concert aggregator. A Next.js 16 App Router client app (React 19, Turbopack) reads `public/data/events.json`; a TypeScript scraper in `lib/scrapers/` regenerates that file and resolves Bandcamp/SoundCloud playback. UI text, identifiers, and comments are in Swedish. All scraping/streaming is TypeScript — the Python implementation has been removed; do not reintroduce Python or `child_process`.

## Commands

- `pnpm install` then `pnpm dev` → http://localhost:3000. Dev compiles without typechecking.
- `pnpm scrape:db` (alias `pnpm scrape`) — runs `tsx scripts/scrape-to-db.ts`; scrapes the next 5 weeks and writes to Turso. Slow and network-heavy. Flags: `--only <source>`, `--no-tracks` (fast structural run), `--quiet`. A failing venue is recorded on the run and does not abort it.
- Execution model: two speed-critical shapes. **Venues** run in a small pool (4) with a 90 s per-source timeout; venue detail-page loops must use `mapPool`, never serial `for … await`. **Tracks** run a 24-wide event pool with each event's artists looked up concurrently (phase-ordered bandcamp → soundcloud, then YouTube as a last resort), under a wider HTTP cap (`withHttpConcurrency`). The cap is the throttle — never add `sleep()`. Progress uses `lib/scrapers/log.ts` (`log`/`warn`/`mapPool`/`withTimeout`/`memoInflight`); artist results are cached across the run in `tracks.ts`.
- `pnpm run diff:events <a.json> <b.json>` — parity/diff tool: per-venue counts (flags mismatches and silently-empty scrapers) plus field, image, and track differences. Reads two JSON payloads, so it is only useful when you export a scrape snapshot yourself.
- `pnpm scrape:logs` — triggers the **deployed** Vercel cron and streams its logs: starts `vercel logs --follow | grep /api/cron/scrape`, then GETs the route. Flags `--only`, `--no-tracks`, `--site`. Needs `vercel login` + `vercel link` and `CRON_SECRET` in `.env`; picks the site from `--site`/`SCRAPE_SITE_URL`, ignoring a localhost `NEXT_PUBLIC_SITE_URL`. Ctrl-C stops watching (the remote run continues).
- `pnpm db:generate` / `db:push` / `db:migrate` / `db:studio` — Drizzle/Turso (see Database).
- `pnpm lint` — `eslint` (flat config). **Currently unusable**: crashes on any file with `TypeError: contextOrFilename.getFilename is not a function` because `eslint-plugin-react@7.37.5` is incompatible with the pinned `eslint@10`. Fix deps before relying on it.
- `npx tsc --noEmit` — typecheck. **Currently fails** on ~33 pre-existing errors in `components/Mast.tsx` (strict-null DOM lookups and React 19 rejecting custom CSS properties in `style`). `pnpm build` compiles but then fails at the same "Running TypeScript" step. Don't assume a green baseline; touching `Mast.tsx` inherits these.
- No test suite. `tsconfig.tsbuildinfo` is tracked and rewritable by tsc/next — revert it if you don't mean to commit it.

## Architecture

- `app/page.tsx` (server) renders `components/ConcertApp.tsx`, a single `"use client"` tree. It fetches `/api/events` at runtime with `cache: "no-store"`; that route returns `loadPayload()` from Turso. UI state lives in `localStorage` under `konserter-*`.
- Server routes, all `runtime = "nodejs"` + `force-dynamic`:
  - `app/api/events` — the feed: `loadPayload()` from `lib/db/queries.ts` (active, non-cancelled, non-club), with `s-maxage=300`.
  - `app/api/bandcamp/stream`, `app/api/soundcloud/stream` — call `lib/scrapers/stream.ts` (`bandcampStreamUrl` / `soundcloudStreamUrl`) directly. No child process, no Python.
  - `app/api/cron/scrape` — the daily scrape→DB job (see below).
  - `app/kalender/[id]` — serves `.ics`; `findEvent()` from `lib/db/queries.ts`.
- `lib/types.ts` is the contract shared by the DB payload and the UI.

## Images

- Venue pages link full-resolution originals (some 16 MB) rendered as small thumbnails, so `app/api/image` (`?url=&w=&sig=`, Node runtime) fetches once, resizes with `sharp`, and re-encodes. Payloads get their URLs server-side via `signedImageUrl()` (`lib/image-sign.ts`, called from `lib/db/queries.ts`), and components render `event.image` directly. Measured: 215 KB → 12 KB JPEG, 16 MB → 38 KB AVIF.
- **Signed URLs (anti-SSRF/abuse)**: the route verifies an HMAC over `url|w` (`lib/image-sign.ts`, key = `IMAGE_SECRET` or `CRON_SECRET`, dev fallback) and returns **403** for missing/tampered signatures — an arbitrary `?url=` cannot be proxied even for an allowed host. The secret never reaches the client. Rotating the secret only invalidates image URLs (they are rebuilt per request from the payload).
- **SSRF allowlist**: additionally only hosts in `IMAGE_ALLOWED_HOSTS` (`lib/image-url.ts`) are proxied. Add new hosts there when adding venues, or the image silently falls back to the original URL.
- **Caching layers**: browser + Vercel CDN via `public, max-age=31536000, immutable` (+ `Vary: Accept`, `X-Content-Type-Options: nosniff`); a **disk cache** at `.cache/images` (gitignored) persists in dev so repeats are instant and is a harmless no-op on Vercel's ephemeral FS. AVIF/WebP/JPEG chosen from `Accept`; widths snap to `IMAGE_WIDTHS` (200/400/800/1200). A failed fetch redirects (307) to the original rather than breaking the page.
- `sharp` needs its install script: `allowBuilds: sharp: true` in `pnpm-workspace.yaml`. Binary fetch uses `httpBuffer` (`http.ts`) — `httpRequest` decodes as UTF-8 and corrupts images.

## Scraper (`lib/scrapers/`)

- `http.ts` — `httpRequest`/`httpJson` over global `fetch` (form/JSON bodies, `HttpError.status`, 429 backoff).
- `dates.ts` — Luxon with `Europe/Stockholm`; `TZ`, `weekBounds`, date parsing, `iso*` formatters. **Do not use `Date` for venue dates** — DST correctness lives here.
- `html.ts` (`he` entity decode, `stripTags`, `pickImage`, `ogImage`), `text.ts` (folding/artist match/title casing), `filters.ts`, `links.ts`, `jsonld.ts`, `events.ts` (`eventId`, `makeEvent`).
- `bandcamp.ts`, `soundcloud.ts`, `tracks.ts` — track resolution engine. `collect.ts` runs `registry.SOURCES`, filters club-nights/cancelled, sorts, attaches tracks, and normalizes titles. There is no JSON artifact: `lib/scrapers/store.ts` (`scrapeAndStore`) writes results to Turso and is the only CLI entry point (`scrape-to-db.ts`).
- `sources/{jsonld-site,live,ticketmaster,slakthusen}.ts` — reusable fetchers. `venues/<slug>.ts` — one `fetch(start, end): Promise<ScrapedEvent[]>` per venue.
- Adding a venue: create `lib/scrapers/venues/<slug>.ts`, register it in `lib/scrapers/registry.ts` (`SOURCES`), add the slug to `VENUES`/`VenueSlug` in `lib/types.ts`, and add an address in `lib/ics.ts` (`VENUE_ADDRESSES`) if calendars should locate it.
- Slakthusen stages (`slaktkyrkan`, `hus7`) all delegate to `sources/slakthusen.ts` and emit `venue_slug: "slakthusen"` with the stage in `place`.
- Window is fixed at `WEEKS = 5` in `dates.ts`. No API keys: the SoundCloud `client_id` is scraped from soundcloud.com at runtime; Bandcamp uses its public mobile API.
- **Bandcamp rate limits:** `autocomplete_elastic` (the search endpoint) can 429 an IP; Bandcamp has **no public catalog API** (its official API is OAuth and scoped to a label's own sales/orders), so these are undocumented internal endpoints. Two defenses:
  - **Persistent artist cache** (`bandcamp_artists` table): `store.ts` loads it via `loadBandcampArtists()` into `attachTracks`, and saves new outcomes with `saveBandcampArtists()`. Resolved artists (including "no release found") are never searched again across runs — this is the main lever, cutting the track phase from ~190 s to ~20 s once warm and eliminating most 429s.
  - **Adaptive per-host pacing** (`http.ts`): `hostThrottle` paces same-host calls (base 250 ms, 2 concurrent); `penalizeHost` widens spacing after a 429 (up to 1.5 s), `easeHost` relaxes it on success. `httpJson` backs off with jitter and honours `Retry-After`. `bandcamp.ts` also opens a 10-min circuit (`isBandcampSearchBlocked`) on a 429. Do **not** drop `maxConcurrent` to 1 — that queues lookups past the 45 s artist timeout (this caused a cluster of `timeout efter 45s`).
- **Event-page fetches in the track phase** (`takePageLinks`) skip Ticketmaster/Live Nation hosts (`EVENT_PAGE_SKIP_HOSTS` in `links.ts`) — they need a session cookie, always 401, and never expose music links. Other hosts log a single `evenemangssida … HTTP 4xx (hoppar över)` line via `warn` instead of a stack trace; the lookup continues using `text`/`title` only.
- **Spotify** (`extractSpotifyLinks` / `spotifyMeta` in `links.ts`): venue pages (Nalen, Fasching, Fållan, …) embed Spotify artist/album links. Spotify audio **cannot** be streamed for anonymous visitors (needs Premium + OAuth), so it is never a `stream` source. Instead: (1) the public **oembed** endpoint (`https://open.spotify.com/oembed?url=…`, no credentials) returns the authoritative artist/album `title`, used as a fallback search key for Bandcamp/SoundCloud when normal matching misses; (2) the link is stored on `events.spotify` and shown in "Lyssna mer". Playlist links carry no artist metadata and are ignored for lookup but still stored.
- **Ticketmaster venue listings** (`sources/ticketmaster.ts`) send browser-like navigation headers (`BROWSER_HEADERS`) and retry twice on 403/429; a bare `Accept: */*` gets 403'd as a bot. Used by `cirkus` and `fryshuset`. A 0-event result there usually means the venue genuinely has no concerts in the window, not a fetch failure.
- Preserve the `eventId` algorithm and JSON field shape — ICS URLs and `localStorage` keys depend on them.

## Duplicated logic — keep both sides in sync

Title casing, cancellation detection, and non-concert/club filtering exist in **two** places:
- Scraper: `lib/scrapers/text.ts` (`displayTitle`, `isCancelled`, `isClubNight`, `TITLE_NAME_SKIP`) and `filters.ts`.
- Client: `lib/events.ts` (`displayTitle`, `isCancelledEvent`, `filteredEvents`, `TITLE_SKIP`).

Changing one side only makes the stored events and the rendered UI disagree.

## Database (Drizzle + Turso)

- `lib/db/schema.ts` holds `venues`, `sources`, `events`, `tracks`, `scrape_runs`, `scrape_errors`, `bandcamp_artists`. `lib/db/queries.ts` is the data-access layer (write helpers `upsertEvents`/`reconcileSource`/`startScrapeRun`/`loadBandcampArtists`/`saveBandcampArtists`/… plus read helpers `loadPayload`/`loadEvents`/`findEvent`). `lib/db/client.ts` deliberately omits `server-only` so `tsx` scripts can reuse it; `lib/db/index.ts` re-exports it with the `server-only` guard for the app.
- Env: `TURSO_DATABASE_URL` (required) and `TURSO_AUTH_TOKEN` (optional for a local `file:` DB); both live in the gitignored `.env`.
- Migration workflow: `pnpm db:generate` → commit `./drizzle` → `pnpm db:push` (dev) or `pnpm db:migrate`. drizzle-kit loads `.env` itself.

## Scrape → Turso cron

- `lib/scrapers/store.ts` → `scrapeAndStore(opts)`: runs `collect()`, seeds `venues`/`sources`, upserts events + tracks, reconciles sources that ran cleanly, and records a `scrape_run`. It is the single shared writer; do not duplicate this logic.
- Two entry points, same function:
  - `pnpm scrape:db` — CLI (`scripts/scrape-to-db.ts`), for system crontab / GitHub Actions. Flags `--only`, `--no-tracks`, `--quiet`.
  - `GET /api/cron/scrape` — Vercel Cron (scheduled in `vercel.json`, daily 05:00 UTC). Guarded by `Authorization: Bearer $CRON_SECRET` (Vercel sends this) or `?secret=`; `&tracks=false` and `&only=` are supported for cheap manual runs. `maxDuration = 300` because a full run is ~5 min — **needs a Vercel plan allowing 300 s**, not Hobby's 60 s.
- `collect()` returns `provenance` (event id → source key) and `okSources`; these drive `events.source_key` and per-source reconciliation and are internal to the write path (not persisted on the event).
- **Never use `db.transaction()` with this remote `libsql://` client** — interactive transactions (BEGIN/COMMIT) hang over Turso's HTTP transport, which stalls the run right after the seed log. Use `db.batch([...])` (one atomic HTTP round-trip; statements run in array order) as `upsertEvents` does. Same applies to any future multi-statement write.
- The app reads from Turso (`/api/events` → `loadPayload()`, ICS → `findEvent()`); there is no JSON feed. The only writer is `scrapeAndStore`.
- For local runs, load `.env` explicitly: `node --env-file=.env --import tsx scripts/scrape-to-db.ts` (plain `tsx` via the pnpm shim can break under an inherited `NODE_OPTIONS`).

## Environment / tooling gotchas

- The scraper and app need **no** env vars — YouTube is scraped key-lessly (`ytInitialData` + oembed). The Turso client reads `TURSO_DATABASE_URL` (+ optional `TURSO_AUTH_TOKEN`) from the gitignored `.env`, where the keys already exist.
- The working install is **pnpm** (`node_modules` is pnpm, `pnpm-workspace.yaml` + `pnpm-lock.yaml` are maintained, `allowBuilds: esbuild` is required by drizzle-kit), even though the README says npm and `package-lock.json` is stale. Prefer pnpm and don't regenerate `package-lock.json`.
- `next dev` auto-manages the `<!-- BEGIN:nextjs-agent-rules -->` block at the top of this file, plus `CLAUDE.md` (which is just `@AGENTS.md`). Leave it in place. Disable generation with `agentRules: false` in `next.config.ts`.
- This Next.js (16.3.6) / React 19 are newer than many model cutoffs. Read `node_modules/next/dist/docs/` before using unfamiliar APIs.
