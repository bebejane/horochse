<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Hör & Se — agent notes

Stockholm concert aggregator. A Next.js 16 App Router client app (React 19, Turbopack) reads `public/data/events.json`; a Python 3 scraper regenerates that file and resolves Bandcamp/SoundCloud playback. UI text, identifiers, and comments are in Swedish.

## Commands

- `npm install` then `npm run dev` → http://localhost:3000. Dev compiles without typechecking.
- `npm run fetch` — runs `python3 fetch.py`; rewrites the tracked `public/data/events.json` for the next 5 weeks. Slow and network-heavy (all venue sites + Bandcamp/SoundCloud). One failing venue is recorded under `errors` in the JSON and does not abort the run. Don't run it casually.
- `npm run lint` — `eslint` (flat config). **Currently unusable**: crashes on any file with `TypeError: contextOrFilename.getFilename is not a function` because `eslint-plugin-react@7.37.5` is incompatible with the pinned `eslint@10`. Fix deps before relying on it.
- `npx tsc --noEmit` — typecheck. **Currently fails** on ~33 pre-existing errors in `components/Mast.tsx` (strict-null DOM lookups and React 19 rejecting custom CSS properties in `style`). `npm run build` compiles but then fails at the same "Running TypeScript" step. Don't assume a green baseline; touching `Mast.tsx` inherits these.
- No test suite or test script exists. `tsconfig.tsbuildinfo` is tracked and rewritable by tsc/next — revert it if you don't mean to commit it.

## Architecture

- `app/page.tsx` (server) renders `components/ConcertApp.tsx`, a single `"use client"` tree. It fetches `/data/events.json` at runtime with `cache: "no-store"` (not imported), so editing the JSON shows on reload with no rebuild. UI state lives in `localStorage` under `konserter-*`.
- Server routes, all `runtime = "nodejs"` + `force-dynamic`:
  - `app/bandcamp/stream`, `app/soundcloud/stream` — spawn `python3 scripts/stream.py` via `lib/python-stream.ts` (`execFile`, 25 s timeout). **Python 3 must be on PATH on the server host**, not only when fetching; otherwise playback fails while pages still render.
  - `app/kalender/[id]` — serves `.ics`; reads the JSON from disk through `lib/load-events.ts` and drops cancelled events.
- `lib/types.ts` is the contract shared by `events.json` and the UI.

## Database (Drizzle + Turso)

- `lib/db/index.ts` exports `db` (a `drizzle-orm/libsql` client over `@libsql/client`). It imports `server-only`, so never import it from a client component. The client is cached on `globalThis` to survive dev hot-reloads.
- Env: `TURSO_DATABASE_URL` (required) and `TURSO_AUTH_TOKEN` (optional for a local `file:` DB); both live in the gitignored `.env`.
- Tables go in `lib/db/schema.ts` (currently empty) and are passed to `drizzle(client, { schema })`. `drizzle.config.ts` points `drizzle-kit` at that schema (`dialect: "turso"`).
- Migration workflow: `pnpm db:generate` → commit `./drizzle` → `pnpm db:push` (dev) or `pnpm db:migrate`. `pnpm db:studio` opens the browser UI. drizzle-kit loads `.env` itself.

## Python scraper

- `fetch.py` is a thin shim; the engine is `scrapers/core.py` (`collect()` picks sources, filters, resolves tracks; `main()` writes the JSON).
- Adding a venue: create `scrapers/venues/<slug>.py` exposing `fetch(start, end) -> list[dict]`, register it in `scrapers/registry.SOURCES`, add the slug to `VENUES`/`VenueSlug` in `lib/types.ts`, and add an address in `lib/ics.ts` (`VENUE_ADDRESSES`) if calendars should locate it.
- Reusable base patterns: `scrapers/ticketmaster.py`, `scrapers/live.py`, `scrapers/jsonld_site.py`, `scrapers/slakthusen.py`. `slaktkyrkan.py` and `hus7.py` delegate to `slakthusen.py`; all Slakthusen stages emit `venue_slug: "slakthusen"` with the stage in `place`.
- Window is fixed at `WEEKS = 5` in `core.py`. Concerts only: `helpers.is_concert` plus club-night/cancelled filtering in `collect()`.
- No API keys: the SoundCloud `client_id` is scraped from soundcloud.com at runtime; Bandcamp uses its public mobile API with 429 backoff.

## Duplicated logic — keep both sides in sync

Title casing, cancellation detection, and non-concert/club filtering are implemented **twice**:
- Python: `display_title` / `normalize_event_titles`, `is_cancelled`, `is_club_night`, `TITLE_NAME_SKIP` in `scrapers/core.py`.
- TypeScript: `displayTitle`, `isCancelledEvent`, `filteredEvents`, `TITLE_SKIP` in `lib/events.ts`.

Changing one side only makes the stored events and the rendered UI disagree.

## Environment / tooling gotchas

- README says the app/scraper itself needs no env vars, but the Turso client does read `TURSO_DATABASE_URL` (+ optional `TURSO_AUTH_TOKEN`) from the gitignored `.env`; those keys are already present locally.
- The working install is **pnpm** (`node_modules` is pnpm, `pnpm-workspace.yaml` + `pnpm-lock.yaml` are maintained, `allowBuilds: esbuild` is required by drizzle-kit), even though the README says npm and `package-lock.json` is stale. Prefer pnpm and don't regenerate `package-lock.json`.
- `next dev` auto-manages the `<!-- BEGIN:nextjs-agent-rules -->` block at the top of this file, plus `CLAUDE.md` (which is just `@AGENTS.md`). Leave it in place. Disable generation with `agentRules: false` in `next.config.ts`.
