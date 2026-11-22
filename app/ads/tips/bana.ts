import { VENUE_SIZE, VENUE_TRACKING, type PosterFormat } from "../poster";

export const BANTEXT = "SUPPORT A LOCAL BAND";
export const SKRIVTID = 4;
export const BLINKTID = 2;
export const MAX_UTJÄMNING = 5;
export const FILM_FPS = 30;

export function filmtider(skrivtid: number, blinktid: number, önskadLängd?: number) {
  if (önskadLängd === undefined) return { skrivtid, filmlängd: skrivtid + blinktid };

  const sluttid = Math.max(2 / FILM_FPS, Math.min(blinktid, önskadLängd / 10));
  return { skrivtid: Math.min(skrivtid, önskadLängd - sluttid), filmlängd: önskadLängd };
}

const SYNLIG_ANDEL = 0.68;

export type Punkt = { x: number; y: number };
type Tecken = Punkt & { text: string; vinkel: number };

export function scenfont(walter: string) {
  return `400 ${VENUE_SIZE}px "${walter}"`;
}

export function jämnaBana(bana: Punkt[], format: PosterFormat, utjämning = 0): Punkt[] {
  const kontrollpunkter: Punkt[] = [];
  bana.forEach(({ x, y }, index) => {
    const punkt = { x: x * format.width, y: y * format.height };
    const förra = kontrollpunkter.at(-1);
    if (!förra || index === bana.length - 1 || Math.hypot(punkt.x - förra.x, punkt.y - förra.y) >= 22) {
      kontrollpunkter.push(punkt);
    }
  });
  if (kontrollpunkter.length < 3) return kontrollpunkter;

  let jämnade = kontrollpunkter;
  const pass = 1 + 2 * Math.min(MAX_UTJÄMNING, Math.max(0, Math.floor(utjämning)));
  for (let steg = 0; steg < pass; steg++) {
    jämnade = jämnade.map((punkt, index, punkter) => {
      const före = punkter[index - 1];
      const efter = punkter[index + 1];
      if (!före || !efter) return punkt;
      return { x: (före.x + 2 * punkt.x + efter.x) / 4, y: (före.y + 2 * punkt.y + efter.y) / 4 };
    });
  }
  const punkter = [jämnade[0]];
  for (let i = 0; i < jämnade.length - 1; i++) {
    const start = jämnade[i];
    const slut = jämnade[i + 1];
    const före = jämnade[i - 1] ?? start;
    const efter = jämnade[i + 2] ?? slut;
    const styr1 = { x: start.x + (slut.x - före.x) / 6, y: start.y + (slut.y - före.y) / 6 };
    const styr2 = { x: slut.x - (efter.x - start.x) / 6, y: slut.y - (efter.y - start.y) / 6 };
    const antal = Math.max(4, Math.ceil(Math.hypot(slut.x - start.x, slut.y - start.y) / 6));
    for (let steg = 1; steg <= antal; steg++) {
      const t = steg / antal;
      const u = 1 - t;
      punkter.push({
        x: u ** 3 * start.x + 3 * u ** 2 * t * styr1.x + 3 * u * t ** 2 * styr2.x + t ** 3 * slut.x,
        y: u ** 3 * start.y + 3 * u ** 2 * t * styr1.y + 3 * u * t ** 2 * styr2.y + t ** 3 * slut.y,
      });
    }
  }
  return punkter;
}

export function placeraBantecken(
  ctx: CanvasRenderingContext2D,
  punkter: Punkt[],
  font: string,
  text: string,
): Tecken[] {
  const versaler = text.trim().toLocaleUpperCase("sv-SE");
  if (punkter.length < 2 || !versaler) return [];

  const avstånd = [0];
  for (let i = 1; i < punkter.length; i++) {
    avstånd.push(avstånd[i - 1] + Math.hypot(punkter[i].x - punkter[i - 1].x, punkter[i].y - punkter[i - 1].y));
  }
  const längd = avstånd.at(-1)!;

  ctx.font = font;
  ctx.letterSpacing = "0px";
  const segmenterare = new Intl.Segmenter("sv", { granularity: "grapheme" });
  const bokstäver = Array.from(segmenterare.segment(versaler), ({ segment }) => ({
    text: segment,
    bredd: ctx.measureText(segment).width,
  }));
  const spärrning = VENUE_SIZE * VENUE_TRACKING;
  const textbredd = bokstäver.reduce((summa, { bredd }) => summa + bredd, 0) + (bokstäver.length - 1) * spärrning;
  if (textbredd > längd) return [];

  function punktVid(mål: number): Punkt {
    const index = avstånd.findIndex((värde) => värde > mål);
    if (index === -1) return punkter[punkter.length - 1];
    const andel = (mål - avstånd[index - 1]) / (avstånd[index] - avstånd[index - 1]);
    const från = punkter[index - 1];
    const till = punkter[index];
    return { x: från.x + (till.x - från.x) * andel, y: från.y + (till.y - från.y) * andel };
  }

  const mellanRepetitioner = 2 * VENUE_SIZE;
  const tecken: Tecken[] = [];
  let start = 0;
  for (let index = 0; ; index++) {
    const { text, bredd } = bokstäver[index % bokstäver.length];
    if (index && index % bokstäver.length === 0) start += mellanRepetitioner - spärrning;
    if (start + bredd > längd) break;

    if (text !== " ") {
      const mitt = start + bredd / 2;
      const punkt = punktVid(mitt);
      const före = punktVid(Math.max(0, mitt - VENUE_SIZE / 2));
      const efter = punktVid(Math.min(längd, mitt + VENUE_SIZE / 2));
      tecken.push({ ...punkt, text, vinkel: Math.atan2(efter.y - före.y, efter.x - före.x) });
    }
    start += bredd + spärrning;
  }
  return tecken;
}

export function ritaBantecken(
  ctx: CanvasRenderingContext2D,
  tecken: Tecken[],
  font: string,
  färg: string,
  tid?: number,
  skrivtid = SKRIVTID,
  blinktid = BLINKTID,
) {
  ctx.save();
  ctx.font = font;
  ctx.letterSpacing = "0px";
  ctx.fillStyle = färg;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const blinkcykel = Math.round(blinktid * 1_000);
  const synligTid = Math.round(blinkcykel * SYNLIG_ANDEL);
  for (const [index, { text, x, y, vinkel }] of tecken.entries()) {
    if (tid !== undefined) {
      const start = Math.round((index + 1) * skrivtid * 1_000 / tecken.length);
      const ålder = Math.round(tid * 1_000) - start;
      if (ålder < 0 || ålder % blinkcykel >= synligTid) continue;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(vinkel);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}
