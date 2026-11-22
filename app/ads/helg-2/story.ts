import { titleLetterMode, toTitleCase } from "@/lib/scrapers/text";

import type { FilmSection } from "../film";
import { blanda, STORY } from "../helg/story";
import { cssToken, type PosterFonts } from "../poster";

const KANT = 40;
const LODRÄT_KANT = 48;
const MAXBREDD = STORY.width - 2 * KANT;
const MAXHÖJD = STORY.height - 2 * LODRÄT_KANT;
const INFOTEXT = "Hitta alla konserter på höroch.se";
const INFOSTART_MS = 6_000;
const INTRO_MS = 650;
const SLUTBILD_MS = 2_000;
const FÖRSTA_RADTID_MS = 400;
const SISTA_RADTID_MS = 90;

type Ord = { text: string; bredd: number; uppstapel: number; nedstapel: number };
type Textbit = { ord: Ord[]; ordmellanrum: number; fastRad?: boolean; nyRad?: boolean };
type PlaceratOrd = Ord & { bit: number; x: number; rad: number };

function placera(bitar: Textbit[], fyrkant: number): PlaceratOrd[] {
  const platser: PlaceratOrd[] = [];
  let x = 0;
  let rad = 0;
  bitar.forEach((textbit, bit) => {
    const { ord, ordmellanrum, fastRad, nyRad } = textbit;
    if (x && (fastRad || nyRad || x + fyrkant + bitbredd(textbit) > MAXBREDD)) {
      x = 0;
      rad++;
    }
    ord.forEach((ordet, index) => {
      const mellanrum = index === 0 ? fyrkant : ordmellanrum;
      if (x) x += mellanrum;
      platser.push({ ...ordet, bit, x, rad });
      x += ordet.bredd;
    });
  });
  return platser;
}

function växelställ(platser: PlaceratOrd[], rubrikplats: number, infoplats: number) {
  const rubrikrad = platser.find(({ bit }) => bit === rubrikplats)?.rad ?? 0;
  let början = 0;
  while (början < platser.length) {
    let slut = början + 1;
    while (platser[slut]?.rad === platser[början].rad) slut++;
    const sista = platser[slut - 1];
    if (sista.rad % 2 !== rubrikrad % 2 || platser[början].bit === infoplats) {
      const förskjutning = MAXBREDD - sista.x - sista.bredd;
      for (let index = början; index < slut; index++) {
        platser[index].x += förskjutning;
      }
    }
    början = slut;
  }
}

function bitbredd({ ord, ordmellanrum }: Textbit) {
  return ord.reduce((summa, ordet) => summa + ordet.bredd, 0) + Math.max(0, ord.length - 1) * ordmellanrum;
}

function längdbalans(platser: PlaceratOrd[], bitar: Textbit[], rader: number) {
  const bredder = bitar.map(bitbredd);
  const artistbredder = bredder.filter((_, index) => !bitar[index].fastRad).sort((a, b) => a - b);
  const gräns = artistbredder[Math.floor(artistbredder.length * 0.6)];
  const lägen = bitar.map(() => ({ x: 0, y: 0, bredd: 0 }));
  for (const ord of platser) {
    const läge = lägen[ord.bit];
    läge.x += (ord.x + ord.bredd / 2) * ord.bredd;
    läge.y += ord.rad * ord.bredd;
    läge.bredd += ord.bredd;
  }

  let vågrätt = 0;
  let lodrätt = 0;
  let antal = 0;
  lägen.forEach(({ x, y, bredd }, index) => {
    if (bitar[index].fastRad || !bredd || bredder[index] < gräns) return;
    vågrätt += (x / bredd) / MAXBREDD - 0.5;
    lodrätt += (y / bredd) / Math.max(1, rader - 1) - 0.5;
    antal++;
  });
  return antal ? (Math.abs(vågrätt) + Math.abs(lodrätt)) / antal : 0;
}

function ordnaText(ctx: CanvasRenderingContext2D, rubrik: string, artister: string[], font: string) {
  const flöde = (grad: number, balansera = false) => {
    const sättFont = (storlek: number) => {
      ctx.font = `400 ${storlek}px "${font}"`;
      return ctx.font;
    };
    const mätOrd = (text: string) => text.split(/\s+/).filter(Boolean).map((text) => {
      const mått = ctx.measureText(text);
      return {
        text,
        bredd: Math.max(mått.width, mått.actualBoundingBoxRight),
        uppstapel: mått.actualBoundingBoxAscent,
        nedstapel: mått.actualBoundingBoxDescent,
      };
    });
    const artistfont = sättFont(grad);
    const ordmellanrum = ctx.measureText(" ").width;
    const bitar: Textbit[] = artister.map((text) => ({ ord: mätOrd(text), ordmellanrum }));
    if (bitar.some((bit) => bitbredd(bit) > MAXBREDD)) return;

    function mätFastRad(text: string) {
      let storlek = grad;
      let radfont = sättFont(storlek);
      let rad: Textbit = { ord: mätOrd(text), ordmellanrum: ctx.measureText(" ").width, fastRad: true };
      const radbredd = () => bitbredd(rad);
      for (let försök = 0; försök < 4 && radbredd() > MAXBREDD; försök++) {
        storlek *= (MAXBREDD - 1) / radbredd();
        radfont = sättFont(storlek);
        rad = { ord: mätOrd(text), ordmellanrum: ctx.measureText(" ").width, fastRad: true };
      }
      if (radbredd() <= MAXBREDD) return { rad, font: radfont };
    }
    const titel = mätFastRad(rubrik);
    const info = mätFastRad(INFOTEXT);
    if (!titel || !info) return;

    let uppstapel = 0;
    let nedstapel = 0;
    for (const { ord } of [...bitar, titel.rad, info.rad]) {
      for (const ordet of ord) {
        uppstapel = Math.max(uppstapel, ordet.uppstapel);
        nedstapel = Math.max(nedstapel, ordet.nedstapel);
      }
    }
    const teckenhöjd = uppstapel + nedstapel;
    const minstaRadhöjd = Math.max(grad * 1.08, teckenhöjd + grad * 0.07);
    const sökcentrum = Math.floor(bitar.length / 2) - 3;
    const sökradie = Math.max(6, Math.ceil(bitar.length * 0.12));
    let bäst: { platser: PlaceratOrd[]; rubrikplats: number; infoplats: number; rader: number; avstånd: number } | undefined;

    const ordningar = [bitar];
    if (balansera && bitar.length > 3) {
      for (let försök = 0; försök < 32; försök++) ordningar.push(blanda(bitar));
    }
    for (const ordning of ordningar) {
      const antalMellanrader = Math.min(2, bitar.length);
      const sistaRubrikplats = bitar.length - antalMellanrader;
      for (let index = Math.max(0, sökcentrum - sökradie); index <= Math.min(sistaRubrikplats, sökcentrum + sökradie); index++) {
        const mellan: Textbit[] = [];
        for (let rad = 0; rad < antalMellanrader; rad++) {
          let bredd = 0;
          const slut = ordning.length - (antalMellanrader - rad - 1);
          for (let plats = index + mellan.length; plats < slut; plats++) {
            const bit = ordning[plats];
            const tillägg = bitbredd(bit) + (bredd ? grad : 0);
            if (bredd && bredd + tillägg > MAXBREDD) break;
            mellan.push(bredd ? bit : { ...bit, nyRad: true });
            bredd += tillägg;
          }
        }
        const infoplats = index + 1 + mellan.length;
        const efterInfo = ordning.slice(index + mellan.length);
        if (efterInfo.length) efterInfo[0] = { ...efterInfo[0], nyRad: true };
        const medRubrik = [
          ...ordning.slice(0, index), titel.rad, ...mellan, info.rad, ...efterInfo,
        ];
        const platser = placera(medRubrik, grad);
        const rader = (platser.at(-1)?.rad ?? 0) + 1;
        if ((rader - 1) * minstaRadhöjd + teckenhöjd > MAXHÖJD) continue;
        const titelrad = platser.find(({ bit }) => bit === index)?.rad ?? (rader - 1) / 2;
        const inforad = platser.find(({ bit }) => bit === infoplats)?.rad ?? titelrad;
        if (antalMellanrader === 2 && inforad - titelrad !== 3) continue;
        const målrad = Math.max(0, Math.round((rader - 1) / 2) - 2);
        let avstånd = Math.abs(titelrad - målrad);
        if (balansera) {
          växelställ(platser, index, infoplats);
          avstånd += längdbalans(platser, medRubrik, rader);
        }
        if (!bäst || avstånd < bäst.avstånd) bäst = { platser, rubrikplats: index, infoplats, rader, avstånd };
      }
    }

    if (!bäst) return;
    const radhöjd = bäst.rader > 1 ? (MAXHÖJD - teckenhöjd) / (bäst.rader - 1) : 0;
    const baslinje = bäst.rader > 1
      ? LODRÄT_KANT + uppstapel
      : (STORY.height + uppstapel - nedstapel) / 2;
    return { artistfont, rubrikfont: titel.font, infofont: info.font, ...bäst, baslinje, radhöjd };
  };

  let hög = MAXBREDD;
  let låg = 0;
  let layout = flöde(hög);
  if (layout) låg = hög;
  for (let försök = 0; försök < 18 && hög > låg; försök++) {
    const grad = (hög + låg) / 2;
    const kandidat = flöde(grad);
    if (kandidat) {
      layout = kandidat;
      låg = grad;
    } else {
      hög = grad;
    }
  }
  if (!layout) return;
  // Lite extra utrymme för alternativa ordningar utan att texten tappar storlek märkbart.
  const balanserad = flöde(låg * 0.97, true);
  if (balanserad) return balanserad;
  växelställ(layout.platser, layout.rubrikplats, layout.infoplats);
  return layout;
}

export function artistnamnMedGemener(namn: string) {
  if (titleLetterMode(namn) !== "upper") return namn;
  const omvandlat = toTitleCase(namn);
  return titleLetterMode(omvandlat) === "upper" ? namn.toLocaleLowerCase("sv-SE") : omvandlat;
}

export function skapaFlödandeStory(rubrik: string, artister: string[], fonts: PosterFonts): FilmSection[] {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return [];
  const layout = ordnaText(ctx, rubrik, artister.map(artistnamnMedGemener), fonts.anselm);
  if (!layout) return [];

  const bakgrund = cssToken("--dark-bg");
  const vitt = cssToken("--dark-ink");
  const palett = [...new Set([
    "fallan", "fryshuset", "kollektivetlivet", "nalen", "debaser",
    "aviciiarena", "hovet", "sodrateatern", "annexet", "glennmillercafe",
  ].map((scen) => cssToken(`--dark-${scen}`)))];
  const { artistfont, rubrikfont, infofont, platser, baslinje, radhöjd, rubrikplats, infoplats } = layout;
  const ordning = blanda(Array.from({ length: artister.length + 2 }, (_, index) => index)
    .filter((index) => index !== rubrikplats && index !== infoplats));
  const namnytor: { rad: number; vänster: number; höger: number }[] = [];
  for (const { bit, rad, x, bredd } of platser) {
    const yta = namnytor[bit];
    if (yta) yta.höger = x + bredd;
    else namnytor[bit] = { rad, vänster: x, höger: x + bredd };
  }

  const mellanrader = new Map<number, Set<number>>();
  for (const { bit, rad } of platser) {
    if (bit <= rubrikplats || bit >= infoplats) continue;
    const namn = mellanrader.get(rad) ?? new Set<number>();
    namn.add(bit);
    mellanrader.set(rad, namn);
  }
  const tidigaNamn = new Set<number>();
  for (const namn of mellanrader.values()) {
    if ([...tidigaNamn].some((bit) => namn.has(bit))) continue;
    const första = ordning.find((bit) => namn.has(bit));
    if (första !== undefined) tidigaNamn.add(första);
  }
  ordning.sort((a, b) => Number(tidigaNamn.has(b)) - Number(tidigaNamn.has(a)));
  const färger: (string | undefined)[] = [];
  färger[rubrikplats] = vitt;
  let nästaFärg = 0;
  let förraFärgen = vitt;
  const delar: FilmSection[] = [];

  function läggTillBild(ms: number) {
    const bild = [...färger];
    delar.push({
      seconds: ms / 1_000,
      paint(ctx) {
        ctx.fillStyle = bakgrund;
        ctx.fillRect(0, 0, STORY.width, STORY.height);
        ctx.textBaseline = "alphabetic";
        platser.forEach(({ text, x, rad, bit }) => {
          const färg = bild[bit];
          if (färg === undefined) return;
          ctx.font = bit === rubrikplats ? rubrikfont : bit === infoplats ? infofont : artistfont;
          ctx.fillStyle = färg;
          ctx.fillText(text, KANT + x, baslinje + rad * radhöjd);
        });
      },
    });
  }

  function färgsätt(plats: number) {
    if (plats === infoplats) {
      färger[plats] = vitt;
      return;
    }

    const yta = namnytor[plats];
    const krockar = new Map<string, number>();
    namnytor.forEach((granne, bit) => {
      const färg = färger[bit];
      if (färg === undefined) return;
      const radavstånd = Math.abs(granne.rad - yta.rad);
      const sidavstånd = Math.max(0, granne.vänster - yta.höger, yta.vänster - granne.höger);
      let vikt = 0;
      if (radavstånd === 0 && Math.abs(bit - plats) === 1) vikt = 12;
      else if (radavstånd === 1) vikt = 2 + 8 * Math.max(0, 1 - sidavstånd / (MAXBREDD / 4));
      else if (radavstånd === 2 && sidavstånd === 0) vikt = 1;
      krockar.set(färg, (krockar.get(färg) ?? 0) + vikt);
    });

    let vald = nästaFärg;
    let minstaVikt = Infinity;
    for (let steg = 0; steg < palett.length; steg++) {
      const kandidat = (nästaFärg + steg) % palett.length;
      const färg = palett[kandidat];
      if (färg === förraFärgen && palett.length > 1) continue;
      const vikt = krockar.get(färg) ?? 0;
      if (vikt < minstaVikt) {
        vald = kandidat;
        minstaVikt = vikt;
      }
    }
    förraFärgen = palett[vald];
    nästaFärg = (vald + 1) % palett.length;
    färger[plats] = förraFärgen;
  }

  // Hitta tar nästa lediga steg från sexsekundersmärket, eller sista steget i en kort film.
  const antalSteg = ordning.length + 1;
  const radtid = (index: number) => {
    const andel = index / Math.max(1, antalSteg - 2);
    return Math.round(FÖRSTA_RADTID_MS - andel * (FÖRSTA_RADTID_MS - SISTA_RADTID_MS));
  };
  let tid = INTRO_MS;
  let infosteg = 0;
  while (infosteg < ordning.length && tid < INFOSTART_MS) {
    tid += radtid(infosteg++);
  }
  ordning.splice(infosteg, 0, infoplats);

  läggTillBild(INTRO_MS);
  ordning.forEach((plats, index) => {
    färgsätt(plats);
    läggTillBild(index === ordning.length - 1 ? SLUTBILD_MS : radtid(index));
  });
  return delar;
}
