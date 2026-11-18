export type PosterFormat = {
  id: "4:5" | "1:1" | "9:16";
  label: string;
  width: number;
  height: number;
};

export const POSTER_FORMATS: PosterFormat[] = [
  { id: "4:5", label: "4:5", width: 1080, height: 1350 },
  { id: "1:1", label: "1:1", width: 1080, height: 1080 },
  { id: "9:16", label: "9:16", width: 1080, height: 1920 },
];

export type PosterFonts = {
  anselm: string;
  walter: string;
};

export type PosterSlide = {
  title: string;
  venue: string;
  date: string;
  color: string;
  image: CanvasImageSource | null;
  /** Månadsannonsen ritar de här raderna i stället för titel och scen. */
  lines?: string[];
  /** Sekunder just den här bilden ska ligga kvar. Annars används exportens gemensamma tid. */
  hold?: number;
  /** Tecken i den fyllda knappen. Symbolen ersätter knappen. */
  mark?: MonthMark;
  /** Fyller ytan med en färg och hoppar över bilden. */
  solid?: string;
  /** Förskjutning från mittbeskärningen, i posterpixlar. */
  crop?: CoverPan;
};

export type CoverPan = { x: number; y: number };

export type MonthMark = "play" | "plus" | "symbol";

export type PosterTicker = {
  text: string;
  offset: number;
};

/** Pixlar per sekund för den lodräta raden i högerkanten. */
export const TICKER_SPEED = 140;

const VENUE_SIZE = 34;
const DATE_SIZE = 42;
/** Högerkanten på den lodräta raden, mätt från bildens högerkant. */
const TICKER_INSET = 52;

/** Läser en färg från stilmallen. Canvas kan inte använda `var()` själv. */
export function cssToken(name: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function posterInk(): string {
  return cssToken("--dark-ink");
}

function posterGround(): string {
  return cssToken("--dark-bg");
}

function withAlpha(color: string, alpha: number): string {
  const hex = color.trim().replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((channel) => channel + channel).join("") : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return color;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const MONTH_LINES = ["Hitta och lyssna", "på artister", "som spelar live", "i Stockholm"];
export const MONTH_LINES_NEXT = [
  "Välj vilka scener",
  "du vill följa &",
  "lägg till spelningar",
  "i din kalender",
];
export const MONTH_LINES_END = ["Hör&Se", "www.höroch.se"];

export const MONTH_COPIES: { lines: string[]; mark: MonthMark }[] = [
  { lines: MONTH_LINES, mark: "play" },
  { lines: MONTH_LINES_NEXT, mark: "plus" },
  { lines: MONTH_LINES_END, mark: "symbol" },
];

export type MonthFrame = { lines: string[]; mark?: MonthMark };

/** Närmaste tid som går jämnt upp i tiden per bild, minst en bild. */
export function alignedTextHold(textAfter: number, imageHold: number): number {
  const step = imageHold > 0 ? imageHold : 0.25;
  const count = Math.max(1, Math.round(Math.max(0, textAfter) / step));
  return Math.round(count * step * 1000) / 1000;
}

/** Texterna avlöser varandra utan paus. `show` ska gå jämnt upp i tiden per bild. */
export function monthFrame(elapsed: number, show: number): MonthFrame {
  if (show <= 0) return MONTH_COPIES[0];
  const cycle = show * MONTH_COPIES.length;
  const into = ((Math.max(0, elapsed) % cycle) + cycle) % cycle;
  return MONTH_COPIES[Math.floor(into / show) % MONTH_COPIES.length];
}

/** Delar ett tidsintervall där texten kan bytas mitt i en bild. */
export function monthSlices(
  start: number,
  end: number,
  show: number,
): { lines: string[]; mark?: MonthMark; hold: number }[] {
  if (end <= start) return [];
  if (show <= 0) return [{ ...MONTH_COPIES[0], hold: end - start }];
  const cycle = show * MONTH_COPIES.length;
  const slices: { lines: string[]; mark?: MonthMark; hold: number }[] = [];
  let t = start;
  while (t < end - 0.0005) {
    const into = ((t % cycle) + cycle) % cycle;
    const stepInto = into % show;
    const remain = show - stepInto;
    const cut = Math.min(end, t + remain);
    if (cut <= t) break;
    const frame = monthFrame(t, show);
    slices.push({ lines: frame.lines, mark: frame.mark, hold: cut - t });
    t = cut;
  }
  return slices;
}
const MONTH_SIZE = 92;
/** 20 procent större än den förra affischknappen. */
const MONTH_PLAY = 149;
const MONTH_PLAY_SLUGS = [
  "debaser",
  "nalen",
  "fallan",
  "kollektivetlivet",
  "sodrateatern",
  "berns",
  "cirkus",
  "fryshuset",
  "annexet",
  "hovet",
  "aviciiarena",
  "trearena",
  "strawberryarena",
  "konserthuset",
  "berwaldhallen",
  "stampen",
  "glennmillercafe",
  "kungcarls",
  "riche",
  "landet",
  "encore",
  "larryscorner",
];

/** Same-origin variant so the canvas stays exportable. Remote posters would taint it. */
export function posterImageUrl(src: string, width: 200 | 1200 = 1200, quality = 75): string {
  if (!src) return "";
  if (src.startsWith("/")) return src;
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality}`;
}

export function loadPosterImage(src: string): Promise<HTMLImageElement | null> {
  const urls = [...new Set([posterImageUrl(src, 1200, 90), posterImageUrl(src, 1200, 75)].filter(Boolean))];
  if (!urls.length) return Promise.resolve(null);

  const load = (url: string): Promise<HTMLImageElement | null> =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
      img.onerror = () => resolve(null);
      img.src = url;
    });

  return (async () => {
    for (const url of urls) {
      const image = await load(url);
      if (image) return image;
    }
    return null;
  })();
}

export function venueColor(slug: string): string {
  return cssToken(`--dark-${slug}`) || cssToken("--dark-debaser");
}

/** Unika scenfärger från appen, i den ordning knappen ska växla. */
export function monthPlayColors(): string[] {
  const seen = new Set<string>();
  const colors: string[] = [];
  for (const slug of MONTH_PLAY_SLUGS) {
    const value = venueColor(slug).toLowerCase();
    if (seen.has(value)) continue;
    seen.add(value);
    colors.push(value);
  }
  return colors.length ? colors : [cssToken("--dark-debaser")];
}

export function monthPlayColor(index: number, colors: string[]): string {
  if (!colors.length) return cssToken("--dark-debaser");
  const i = ((index % colors.length) + colors.length) % colors.length;
  return colors[i];
}

function firstFamily(list: string): string {
  return list.split(",")[0]?.trim().replace(/^["']|["']$/g, "") || "serif";
}

export async function loadPosterFonts(): Promise<PosterFonts> {
  const root = getComputedStyle(document.documentElement);
  const anselm = firstFamily(root.getPropertyValue("--font-anselm")) || "Palatino";
  const walter = firstFamily(root.getPropertyValue("--font-walter")) || "sans-serif";
  await Promise.all([
    document.fonts.load(`400 64px "${anselm}"`),
    document.fonts.load(`450 86px "${anselm}"`),
    document.fonts.load(`450 ${MONTH_SIZE}px "${anselm}"`),
    document.fonts.load(`400 ${VENUE_SIZE}px "${walter}"`),
    document.fonts.load(`400 ${MONTH_SIZE}px "${walter}"`),
  ]);
  await document.fonts.ready;
  return { anselm, walter };
}

function font(weight: number, size: number, family: string): string {
  return `${weight} ${size}px "${family}"`;
}

function wrapLine(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    if (ctx.measureText(word).width <= maxWidth) {
      line = word;
      continue;
    }
    let chunk = "";
    for (const ch of word) {
      const trial = chunk + ch;
      if (ctx.measureText(trial).width > maxWidth && chunk) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk = trial;
      }
    }
    line = chunk;
  }
  if (line) lines.push(line);
  return avoidOrphan(ctx, lines.length ? lines : [""], maxWidth);
}

/** Drar ner ett ord från raden ovanför så att sista raden inte blir ett ensamt ord. */
function avoidOrphan(ctx: CanvasRenderingContext2D, lines: string[], maxWidth: number): string[] {
  if (lines.length < 2) return lines;
  const lastWords = lines[lines.length - 1].split(/\s+/).filter(Boolean);
  if (lastWords.length !== 1) return lines;
  const prevWords = lines[lines.length - 2].split(/\s+/).filter(Boolean);
  if (prevWords.length < 2) return lines;
  const moved = prevWords.pop();
  if (!moved) return lines;
  const nextLast = `${moved} ${lastWords[0]}`;
  if (ctx.measureText(nextLast).width > maxWidth) return lines;
  const next = lines.slice();
  next[next.length - 2] = prevWords.join(" ");
  next[next.length - 1] = nextLast;
  return next;
}

function layoutTitle(
  ctx: CanvasRenderingContext2D,
  title: string,
  family: string,
  maxWidth: number,
): { size: number; lines: string[] } {
  ctx.letterSpacing = "-0.02em";
  // Bryt varje stycke separat så att automatisk ombrytning aldrig flyttar ord över en hård brytning.
  const wrap = () => title.split(/\r?\n|\|/).flatMap((part) => wrapLine(ctx, part, maxWidth));
  let size = 86;
  while (size >= 40) {
    ctx.font = font(450, size, family);
    const lines = wrap();
    const tooWide = lines.some((line) => ctx.measureText(line).width > maxWidth + 1);
    if (!tooWide && lines.length <= 6) return { size, lines };
    size -= 2;
  }
  ctx.font = font(450, 40, family);
  return { size: 40, lines: wrap().slice(0, 8) };
}

function imageSize(image: CanvasImageSource): { iw: number; ih: number } {
  const iw =
    "naturalWidth" in image && typeof image.naturalWidth === "number" ? image.naturalWidth : widthOf(image);
  const ih =
    "naturalHeight" in image && typeof image.naturalHeight === "number"
      ? image.naturalHeight
      : heightOf(image);
  return { iw, ih };
}

/** Håller förskjutningen inom det som fortfarande täcker ytan. */
export function clampCoverPan(
  image: CanvasImageSource,
  width: number,
  height: number,
  pan: CoverPan,
): CoverPan {
  const { iw, ih } = imageSize(image);
  if (!iw || !ih) return { x: 0, y: 0 };
  const scale = Math.max(width / iw, height / ih);
  const maxX = Math.max(0, (iw * scale - width) / 2);
  const maxY = Math.max(0, (ih * scale - height) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, pan.x)),
    y: Math.min(maxY, Math.max(-maxY, pan.y)),
  };
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  width: number,
  height: number,
  pan?: CoverPan,
) {
  const { iw, ih } = imageSize(image);
  if (!iw || !ih) return;
  const scale = Math.max(width / iw, height / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const placed = clampCoverPan(image, width, height, pan ?? { x: 0, y: 0 });
  ctx.drawImage(image, (width - dw) / 2 + placed.x, (height - dh) / 2 + placed.y, dw, dh);
}

function widthOf(image: CanvasImageSource): number {
  if ("width" in image && typeof image.width === "number") return image.width;
  return 0;
}

function heightOf(image: CanvasImageSource): number {
  if ("height" in image && typeof image.height === "number") return image.height;
  return 0;
}

type TickerStrip = {
  canvas: HTMLCanvasElement;
  textWidth: number;
  pad: number;
};

const tickerStrips = new Map<string, TickerStrip>();

/** Ritas en gång. Att rita om bokstäverna varje bildruta får raden att hacka. */
function tickerStrip(text: string, family: string): TickerStrip {
  const key = `${family}\0${posterInk()}\0${text}`;
  const cached = tickerStrips.get(key);
  if (cached) return cached;

  const probe = document.createElement("canvas").getContext("2d");
  const empty = document.createElement("canvas");
  if (!probe) return { canvas: empty, textWidth: 1, pad: 0 };
  probe.font = font(400, VENUE_SIZE, family);
  probe.letterSpacing = "0.16em";
  probe.textBaseline = "alphabetic";
  const metrics = probe.measureText(text);
  const ascent = Math.max(1, Math.ceil(metrics.actualBoundingBoxAscent));
  const descent = Math.max(1, Math.ceil(metrics.actualBoundingBoxDescent));
  const pad = 4;
  const textWidth = Math.max(1, Math.ceil(metrics.width));
  const canvas = document.createElement("canvas");
  canvas.width = textWidth + pad * 2;
  canvas.height = ascent + descent + pad * 2;
  const stripCtx = canvas.getContext("2d");
  if (!stripCtx) return { canvas, textWidth, pad };
  stripCtx.font = font(400, VENUE_SIZE, family);
  stripCtx.letterSpacing = "0.16em";
  stripCtx.fillStyle = posterInk();
  stripCtx.textBaseline = "alphabetic";
  stripCtx.fillText(text, pad, pad + ascent);
  const strip = { canvas, textWidth, pad };
  tickerStrips.set(key, strip);
  return strip;
}

function drawTicker(
  ctx: CanvasRenderingContext2D,
  ticker: PosterTicker,
  family: string,
  width: number,
  height: number,
) {
  const text = ticker.text.trim();
  if (!text) return;
  const strip = tickerStrip(text, family);
  const gap = height / 5;
  const period = strip.textWidth + gap;
  if (period < 1) return;
  const shift = ((ticker.offset % period) + period) % period;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();
  // 90° medurs: raden står i högerkanten och offset flyttar den nedåt.
  ctx.translate(width - TICKER_INSET, 0);
  ctx.rotate(Math.PI / 2);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const first = Math.floor((-strip.canvas.width - shift) / period) - 1;
  const last = Math.ceil((height - shift) / period) + 1;
  for (let copy = first; copy <= last; copy++) {
    const x = shift + copy * period - strip.pad;
    if (x < height && x + strip.canvas.width > 0) ctx.drawImage(strip.canvas, x, 0);
  }
  ctx.restore();
}

/** Ritar bara den löpande raden ovanpå en redan ritad bild. */
export function paintTicker(
  ctx: CanvasRenderingContext2D,
  ticker: PosterTicker,
  fonts: PosterFonts,
) {
  ctx.save();
  drawTicker(ctx, ticker, fonts.walter, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

export function drawPoster(
  ctx: CanvasRenderingContext2D,
  slide: PosterSlide | null,
  fonts: PosterFonts,
  ticker?: PosterTicker,
) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  const ground = posterGround();
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (slide?.image) drawCover(ctx, slide.image, width, height, slide.crop);

  const fadeTop = height * 0.62;
  const fade = ctx.createLinearGradient(0, fadeTop, 0, height);
  fade.addColorStop(0, withAlpha(ground, 0));
  fade.addColorStop(0.5, withAlpha(ground, 0.2));
  fade.addColorStop(1, withAlpha(ground, 0.52));
  ctx.fillStyle = fade;
  ctx.fillRect(0, fadeTop, width, height - fadeTop);

  ctx.fillStyle = slide?.color || posterInk();
  ctx.fillRect(0, height - 14, width, 14);

  if (!slide) {
    if (ticker?.text) paintTicker(ctx, ticker, fonts);
    ctx.restore();
    return;
  }

  const padX = 72;
  const tickerLane = ticker?.text.trim() ? TICKER_INSET + 72 : 0;
  const maxWidth = width - padX * 2 - tickerLane;
  const title = layoutTitle(ctx, slide.title || "Konsert", fonts.anselm, maxWidth);
  const venueSize = VENUE_SIZE;
  const dateSize = DATE_SIZE;
  const titleLineHeight = Math.round(title.size * 1.12);
  const titleHeight = title.lines.length * titleLineHeight;
  const blockHeight = venueSize + 26 + titleHeight + 28 + dateSize;
  let y = height - 64 - blockHeight;

  ctx.textBaseline = "top";
  ctx.letterSpacing = "0.16em";
  ctx.fillStyle = slide.color || posterInk();
  ctx.font = font(400, venueSize, fonts.walter);
  ctx.fillText(slide.venue.toLocaleUpperCase("sv"), padX, y);
  ctx.letterSpacing = "0px";

  y += venueSize + 26;
  const ink = posterInk();
  ctx.fillStyle = ink;
  ctx.letterSpacing = "-0.02em";
  ctx.font = font(450, title.size, fonts.anselm);
  for (const line of title.lines) {
    ctx.fillText(line, padX, y);
    y += titleLineHeight;
  }
  ctx.letterSpacing = "0px";

  y += 8;
  ctx.fillStyle = withAlpha(ink, 0.86);
  ctx.font = font(400, dateSize, fonts.anselm);
  ctx.fillText(slide.date, padX, y);

  if (ticker?.text) paintTicker(ctx, ticker, fonts);
  ctx.restore();
}

/** Bilden fyller ytan. Ingen titel, scen eller datum — bara meningen i mitten. */
export function drawMonthPoster(
  ctx: CanvasRenderingContext2D,
  slide: PosterSlide | null,
  fonts: PosterFonts,
) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = slide?.solid || posterGround();
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (!slide?.solid && slide?.image) {
    drawCover(ctx, slide.image, width, height);
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  const lines = slide?.lines ?? MONTH_LINES;
  if (slide?.lines && !slide.lines.length) {
    ctx.restore();
    return;
  }
  const maxText = width - 140;
  let size = MONTH_SIZE;
  const fitted = MONTH_COPIES.flatMap((copy) =>
    copy.lines.map((line, index) => ({
      line,
      size: copy.mark === "symbol" && index === 1 ? 0.7 : 1,
      walter: copy.mark === "symbol" && index === 0,
    })),
  );
  while (size > 64) {
    if (fitted.every((item) => monthLineWidth(ctx, item.line, Math.round(size * item.size), fonts, item.walter) <= maxText)) break;
    size -= 2;
  }
  const lineHeight = Math.round(MONTH_SIZE * 1.24);
  const lineCount = 4;
  const gap = 72;
  const slotHeight = lineCount * lineHeight;
  const textTop = (height - (slotHeight + gap + MONTH_PLAY)) / 2;
  ctx.font = font(450, MONTH_SIZE, fonts.anselm);
  ctx.textBaseline = "alphabetic";
  const ascent = ctx.measureText("Hg").fontBoundingBoxAscent || Math.round(MONTH_SIZE * 0.8);
  const baseline = (index: number) => textTop + ascent + index * lineHeight;

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = posterInk();
  if (slide?.mark === "symbol") {
    drawMonthLine(ctx, lines[0] || "Hör&Se", width / 2, baseline(1), size, fonts, true);
    drawMonthLine(ctx, lines[1] || "", width / 2, baseline(2), Math.round(size * 0.7), fonts);
  } else {
    lines.forEach((line, index) => drawMonthLine(ctx, line, width / 2, baseline(index), size, fonts));
  }
  ctx.textAlign = "left";
  ctx.letterSpacing = "0px";

  const mark = slide?.mark ?? "play";
  drawMonthMark(
    ctx,
    width / 2,
    textTop + slotHeight + gap + MONTH_PLAY / 2,
    mark === "symbol" ? Math.round(MONTH_PLAY * 1.3) : MONTH_PLAY,
    slide?.color || cssToken("--dark-debaser"),
    mark,
  );
  ctx.restore();
}

/** Samma kontur som symbolen i masten. Svart variant, som i ljust tema. */
const SYMBOL_OUTLINE =
  "M45.3,248.6c-32-50.1-25.9-114.9.9-161.5S124.7,12.8,175.7,13.7c91.5-2.6,153.7,75.1,169.3,160.6,14.7,78.6-10.4,168.4-54.4,225.4-44.9,57-88.1,104.7-132.1,156.3-31.8,36.2-68.2,40.6-101,23.3-30.2-15.5-44-43.2-44-70.8M267.5,133.7c-19.9-44-59.9-63.9-98.7-56.1-44.9,6.9-76,41.4-82.9,77.7-5,28.1,4.4,59.4,20.3,81.7M177.8,375.1c-37.1-3.5-56.5,21.1-80.7,53.1-14.7,19.9-31.4,25.6-43.5,20.6-22.3-9.5-20.4-34.4-9.2-67.2";
const SYMBOL_W = 364.1;
const SYMBOL_H = 601.6;
const EYE_CX = 191.2;
const EYE_CY = 280.4;

function monthLineWidth(
  ctx: CanvasRenderingContext2D,
  line: string,
  size: number,
  fonts: PosterFonts,
  walterAmp = false,
): number {
  return lineParts(line, walterAmp).reduce((sum, part, index, parts) => {
    const width = partWidth(ctx, part, size, fonts);
    if (!part.walter) return sum + width;
    return sum + width + ampPad(parts, index, size, "left") + ampPad(parts, index, size, "right");
  }, 0);
}

/** Lite luft på var sida om & i logotypen. */
const AMP_SIDE = 0.16;

function lineParts(line: string, walterAmp: boolean): { text: string; walter: boolean }[] {
  if (!walterAmp || !line.includes("&")) return [{ text: line, walter: false }];
  const parts: { text: string; walter: boolean }[] = [];
  const bits = line.split("&");
  bits.forEach((bit, index) => {
    if (bit) parts.push({ text: bit, walter: false });
    if (index < bits.length - 1) parts.push({ text: "&", walter: true });
  });
  return parts.length ? parts : [{ text: line, walter: false }];
}

function ampPad(parts: { text: string }[], index: number, size: number, side: "left" | "right"): number {
  const neighbor = parts[index + (side === "left" ? -1 : 1)];
  if (!neighbor) return 0;
  const spaced = side === "left" ? neighbor.text.endsWith(" ") : neighbor.text.startsWith(" ");
  return spaced ? 0 : size * AMP_SIDE;
}

function partWidth(
  ctx: CanvasRenderingContext2D,
  part: { text: string; walter: boolean },
  size: number,
  fonts: PosterFonts,
): number {
  ctx.letterSpacing = part.walter ? "0px" : "-0.02em";
  ctx.font = part.walter ? font(400, size, fonts.walter) : font(450, size, fonts.anselm);
  return ctx.measureText(part.text).width;
}

/** & i logotypen sätts i Walter. Övrig text, även &, är Anselm. */
function drawMonthLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  cx: number,
  y: number,
  size: number,
  fonts: PosterFonts,
  walterAmp = false,
) {
  const parts = lineParts(line, walterAmp);
  const total = parts.reduce((sum, part, index) => {
    const width = partWidth(ctx, part, size, fonts);
    if (!part.walter) return sum + width;
    return sum + width + ampPad(parts, index, size, "left") + ampPad(parts, index, size, "right");
  }, 0);
  let x = cx - total / 2;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  parts.forEach((part, index) => {
    ctx.letterSpacing = part.walter ? "0px" : "-0.02em";
    ctx.font = part.walter ? font(400, size, fonts.walter) : font(450, size, fonts.anselm);
    const measured = ctx.measureText(part.text).width;
    const pad = part.walter ? ampPad(parts, index, size, "left") : 0;
    ctx.fillText(part.text, x + pad, y);
    x += measured + pad + (part.walter ? ampPad(parts, index, size, "right") : 0);
  });
}

function drawMonthMark(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  diameter: number,
  fill: string,
  mark: MonthMark,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, diameter / 2, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (mark === "symbol") drawMastSymbol(ctx, cx, cy, diameter * 0.7);
  else if (mark === "plus") drawPlus(ctx, cx, cy, diameter);
  else drawPlayTriangle(ctx, cx, cy, diameter);
  ctx.restore();
}

/** Samma ruta som play-triangeln, så plusset får samma tyngd. Raka hörn. */
function drawPlus(ctx: CanvasRenderingContext2D, cx: number, cy: number, diameter: number) {
  const icon = diameter * (1.05 / 2.85) * 1.2;
  const scale = icon / 24;
  const thick = 3.2 * scale;
  const span = 12 * scale;
  ctx.fillStyle = posterGround();
  ctx.fillRect(cx - thick / 2, cy - span / 2, thick, span);
  ctx.fillRect(cx - span / 2, cy - thick / 2, span, thick);
}

function drawPlayTriangle(ctx: CanvasRenderingContext2D, cx: number, cy: number, diameter: number) {
  const icon = diameter * (1.05 / 2.85) * 1.2;
  const scale = icon / 24;
  ctx.save();
  ctx.translate(cx - icon / 2, cy - icon / 2);
  ctx.scale(scale, scale);
  ctx.fillStyle = posterGround();
  ctx.beginPath();
  ctx.moveTo(8, 5.5);
  ctx.lineTo(8, 18.5);
  ctx.lineTo(19, 12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawMastSymbol(ctx: CanvasRenderingContext2D, cx: number, cy: number, height: number) {
  const scale = height / SYMBOL_H;
  ctx.save();
  ctx.translate(cx - (SYMBOL_W * scale) / 2, cy - height / 2);
  ctx.scale(scale, scale);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 21.6;
  ctx.strokeStyle = cssToken("--light-ink");
  ctx.stroke(new Path2D(SYMBOL_OUTLINE));
  ctx.fillStyle = cssToken("--light-ink");
  ctx.beginPath();
  ctx.ellipse(236.8, EYE_CY, 41.3, 58.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(EYE_CX, EYE_CY, 95.6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
