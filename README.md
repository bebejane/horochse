# Hör & Se

Konsertaggregator för Stockholm. Next.js-appen visar aktuella konserter; en scraper i TypeScript hämtar programmet från scenerna och löser uppspelning från Bandcamp och SoundCloud.

## Förutsättningar

- **Node.js 20.9** eller nyare
- **pnpm** (README använder pnpm; npm fungerar också)

Scrapern körs helt i Node/TypeScript – inga pip-paket eller Python behövs.

Kolla versionerna:

```bash
node -v
pnpm -v
```

## Kom igång

```bash
pnpm install
pnpm dev
```

Öppna [http://localhost:3000](http://localhost:3000).

Konsertlistan läses från Turso-databasen via `/api/events`. Sätt `TURSO_DATABASE_URL` och `TURSO_AUTH_TOKEN` i `.env` (se `.env`, som är gitignorerad).

## Hämta konserter

Scrapern går igenom scenerna för de kommande fem veckorna och skriver till Turso.

```bash
pnpm scrape:db
```

Körningen tar ett tag och vissa scener kan svara med 429. Om en scen misslyckas sparas felet på scrape-körningen; övriga konserter skrivs ändå.

En enskild scen eller en snabb körning utan låtuppslag:

```bash
pnpm scrape:db --only debaser
pnpm scrape:db --no-tracks
```

Ladda om sajten efteråt så syns den nya listan.

## Uppspelning

Bandcamp- och SoundCloud-strömmar löses av `lib/scrapers/stream.ts` direkt i Node – ingen extern process behövs.

## Andra kommandon

```bash
pnpm build    # produktionsbygge
pnpm start    # kör bygget (efter pnpm build)
```

ICS-filer ligger på `/kalender/{id}.ics`.

## Lokalt

På `localhost` nollställer klick på öron-symbolen i sidfoten sparade val (`konserter-*` i localStorage) och laddar om sidan som ett första besök.
