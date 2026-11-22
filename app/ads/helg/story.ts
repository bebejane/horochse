import { weekDaysFromMonday } from "@/lib/dates";
import { displayTitle } from "@/lib/events";
import { artistCandidates, billArtists, foldName } from "@/lib/scrapers/text";
import type { ConcertEvent } from "@/lib/types";

import type { FilmSection } from "../film";
import { cssToken, type PosterFonts, type PosterFormat } from "../poster";
import { eventsInWeek } from "../week";

export const STORY: PosterFormat = { id: "9:16", label: "9:16", width: 1080, height: 1920 };
const RADHÖJD = 156;
const MITT = 926;
const KANT = 76;
const RADPLATSER = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6];
const RADER_OVANFÖR_MITTEN = RADPLATSER.findIndex((plats) => plats > 0);
const WEBBADRESS = "www.höroch.se";
const RADTID = 0.38;

type Rad = { namn: string; färg: string };

export function helgensArtister(events: ConcertEvent[], monday: string): string[] {
  const helg = new Set(weekDaysFromMonday(monday).slice(4));
  const artister = new Map<string, string>();
  for (const event of eventsInWeek(events, monday)) {
    if (!helg.has(event.date)) continue;
    const titel = displayTitle(event);
    const namn = billArtists(titel, event.text);
    const kandidater = artistCandidates(titel);
    const artisterPåScen = namn.length ? namn : kandidater.filter((artist) => {
      const andra = kandidater.filter((kandidat) => kandidat !== artist);
      return andra.length < 2 || !andra.every((kandidat) => artist.includes(kandidat));
    });
    for (const artist of artisterPåScen) {
      const match = event.tracks?.find((track) => foldName(track.artist) === foldName(artist));
      const visning = match?.artist ?? (titel === artist + "!" ? titel : artist);
      const nyckel = foldName(visning);
      if (nyckel && !artister.has(nyckel)) artister.set(nyckel, visning);
    }
  }

  const sorterade = [...artister.values()].sort((a, b) => a.length - b.length);
  const rader: string[] = [];
  while (sorterade.length) {
    rader.push(sorterade.pop()!);
    if (sorterade.length) rader.push(sorterade.shift()!);
  }
  return rader;
}

export function blanda<T>(värden: readonly T[]): T[] {
  const blandade = [...värden];
  for (let i = blandade.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [blandade[i], blandade[j]] = [blandade[j], blandade[i]];
  }
  return blandade;
}

export function skapaStory(rubrik: string, artister: string[], fonts: PosterFonts): FilmSection[] {
  const font = `400 112px "${fonts.anselm}"`;
  const bakgrund = cssToken("--dark-bg");
  const vitt = cssToken("--dark-ink");
  const färger = ["fallan", "fryshuset", "kollektivetlivet", "nalen", "debaser"]
    .map((scen) => cssToken(`--dark-${scen}`));
  const palett = [...new Set(färger)];

  const rader: Rad[] = [];
  const delar: FilmSection[] = [];
  let mittrad = rubrik;

  function läggTillDel(sekunder: number) {
    const bild = [...rader];
    const text = mittrad;
    delar.push({
      seconds: sekunder,
      paint(ctx) {
        ctx.fillStyle = bakgrund;
        ctx.fillRect(0, 0, STORY.width, STORY.height);
        ctx.font = font;
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = vitt;
        ctx.fillText(text, KANT, MITT);

        bild.forEach((rad, plats) => {
          ctx.fillStyle = rad.färg;
          ctx.fillText(rad.namn, KANT, MITT + RADPLATSER[plats] * RADHÖJD);
        });
      },
    });
  }

  läggTillDel(0.85);

  let färgindex = 0;
  let förraFärgen = "";
  artister.forEach((namn, index) => {
    const plats = index % RADPLATSER.length;
    const upptagnaFärger = new Set([förraFärgen, rader[plats - 1]?.färg, rader[plats + 1]?.färg]);
    for (let försök = 0; försök < palett.length && upptagnaFärger.has(palett[färgindex]); försök++) {
      färgindex = (färgindex + 1) % palett.length;
    }
    förraFärgen = palett[färgindex];
    färgindex = (färgindex + 1) % palett.length;
    rader[plats] = { namn, färg: förraFärgen };
    läggTillDel(RADTID);
    if (index + 1 === RADPLATSER.length + RADER_OVANFÖR_MITTEN) {
      mittrad = WEBBADRESS;
      läggTillDel(RADTID);
    }
  });
  while (rader.length) {
    rader.pop();
    läggTillDel(RADTID);
  }

  return delar;
}
