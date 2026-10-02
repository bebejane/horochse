# Hör & Se

Konsertaggregator för Stockholm. Next.js-appen visar aktuella konserter; Python hämtar programmet från scenerna och löser uppspelning från Bandcamp och SoundCloud.

## Förutsättningar

- **Node.js 20.9** eller nyare
- **npm**
- **Python 3** (standardbiblioteket räcker, inga pip-paket)

Kolla versionerna:

```bash
node -v
python3 --version
```

## Kom igång

```bash
npm install
npm run dev
```

Öppna [http://localhost:3000](http://localhost:3000).

Konsertlistan läses från `public/data/events.json`. Den filen följer med, så sidan går att köra direkt utan att hämta om data.

Inga miljövariabler eller `.env`-filer behövs.

## Hämta konserter

Scrapern går igenom scenerna för de kommande fem veckorna och skriver om `public/data/events.json`.

```bash
npm run fetch
```

Det kör `python3 fetch.py`. Körningen tar ett tag och vissa scener kan svara med 429. Om en scen misslyckas hamnar felet i `errors` i JSON-filen; övriga konserter skrivs ändå.

Ladda om sajten efteråt så syns den nya listan.

## Uppspelning

Spellistan går via `python3 scripts/stream.py`. Utvecklingsservern anropar det skriptet när någon trycker play, så Python måste finnas i PATH även om du inte kör fetch.

## Andra kommandon

```bash
npm run build    # produktionsbygge
npm run start    # kör bygget (efter npm run build)
```

ICS-filer ligger på `/kalender/{id}.ics`.

## Lokalt

På `localhost` nollställer klick på öron-symbolen i sidfoten sparade val (`konserter-*` i localStorage) och laddar om sidan som ett första besök.
