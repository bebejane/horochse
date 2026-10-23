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
};

export type PosterTicker = {
  text: string;
  offset: number;
};

/** Pixlar per sekund för den löpande raden överst. */
export const TICKER_SPEED = 140;

const VENUE_SIZE = 34;
const DATE_SIZE = 42;
/** Em-boxens underkant på datumet ligger så här många pixlar ovanför bildens nederkant. */
const DATE_EM_BOTTOM = 84;

const CREAM = "#f3eee4";
const INK = "#14120f";

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
  if (typeof document === "undefined") return "#d4573c";
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--${slug}`).trim();
  return value || "#d4573c";
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
    document.fonts.load(`400 ${VENUE_SIZE}px "${walter}"`),
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
  let size = 86;
  while (size >= 40) {
    ctx.font = font(450, size, family);
    const lines = wrapLine(ctx, title, maxWidth);
    const tooWide = lines.some((line) => ctx.measureText(line).width > maxWidth + 1);
    if (!tooWide && lines.length <= 6) return { size, lines };
    size -= 2;
  }
  ctx.font = font(450, 40, family);
  return { size: 40, lines: wrapLine(ctx, title, maxWidth).slice(0, 8) };
}

function drawCover(ctx: CanvasRenderingContext2D, image: CanvasImageSource, width: number, height: number) {
  const iw =
    "naturalWidth" in image && typeof image.naturalWidth === "number" ? image.naturalWidth : widthOf(image);
  const ih =
    "naturalHeight" in image && typeof image.naturalHeight === "number"
      ? image.naturalHeight
      : heightOf(image);
  if (!iw || !ih) return;
  const scale = Math.max(width / iw, height / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(image, (width - dw) / 2, (height - dh) / 2, dw, dh);
}

function widthOf(image: CanvasImageSource): number {
  if ("width" in image && typeof image.width === "number") return image.width;
  return 0;
}

function heightOf(image: CanvasImageSource): number {
  if ("height" in image && typeof image.height === "number") return image.height;
  return 0;
}

/** Avstånd från datumets bläck till bildens nederkant. Samma mått används som toppmarginal. */
function dateInkMargin(ctx: CanvasRenderingContext2D, date: string, family: string, height: number): number {
  ctx.font = font(400, DATE_SIZE, family);
  ctx.letterSpacing = "0px";
  ctx.textBaseline = "top";
  const descent = ctx.measureText(date || "Måndag").actualBoundingBoxDescent;
  const dateTop = height - DATE_EM_BOTTOM - DATE_SIZE;
  return height - (dateTop + descent);
}

type TickerStrip = {
  canvas: HTMLCanvasElement;
  textWidth: number;
  pad: number;
};

const tickerStrips = new Map<string, TickerStrip>();

/** Ritas en gång. Att rita om bokstäverna varje bildruta får raden att hacka. */
function tickerStrip(text: string, family: string): TickerStrip {
  const key = `${family}\0${text}`;
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
  stripCtx.fillStyle = "#ffffff";
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
  inkTop: number,
) {
  const text = ticker.text.trim();
  if (!text) return;
  const strip = tickerStrip(text, family);
  const gap = width / 5;
  const period = strip.textWidth + gap;
  if (period < 1) return;
  const shift = ((ticker.offset % period) + period) % period;
  const y = inkTop * 0.85 - strip.pad;
  const base = width - shift;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, ctx.canvas.height);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const first = Math.floor((-strip.canvas.width - base) / period) - 1;
  const last = Math.ceil((width - base) / period) + 1;
  for (let copy = first; copy <= last; copy++) {
    const x = base + copy * period - strip.pad;
    if (x < width && x + strip.canvas.width > 0) ctx.drawImage(strip.canvas, x, y);
  }
  ctx.restore();
}

/** Ritar bara den löpande raden ovanpå en redan ritad bild. */
export function paintTicker(
  ctx: CanvasRenderingContext2D,
  ticker: PosterTicker,
  fonts: PosterFonts,
  date: string,
) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  ctx.save();
  drawTicker(ctx, ticker, fonts.walter, width, dateInkMargin(ctx, date, fonts.anselm, height));
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
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (slide?.image) drawCover(ctx, slide.image, width, height);

  const fade = ctx.createLinearGradient(0, height * 0.36, 0, height);
  fade.addColorStop(0, "rgba(20, 18, 15, 0)");
  fade.addColorStop(0.42, "rgba(20, 18, 15, 0.62)");
  fade.addColorStop(1, "rgba(20, 18, 15, 0.94)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, height * 0.36, width, height * 0.64);

  ctx.fillStyle = slide?.color || CREAM;
  ctx.fillRect(0, height - 14, width, 14);

  if (!slide) {
    if (ticker?.text) paintTicker(ctx, ticker, fonts, "Måndag");
    ctx.restore();
    return;
  }

  const padX = 72;
  const maxWidth = width - padX * 2;
  const title = layoutTitle(ctx, slide.title || "Konsert", fonts.anselm, maxWidth);
  const venueSize = VENUE_SIZE;
  const dateSize = DATE_SIZE;
  const titleLineHeight = Math.round(title.size * 1.12);
  const titleHeight = title.lines.length * titleLineHeight;
  const blockHeight = venueSize + 26 + titleHeight + 28 + dateSize;
  let y = height - 64 - blockHeight;

  ctx.textBaseline = "top";
  ctx.letterSpacing = "0.16em";
  ctx.fillStyle = slide.color || CREAM;
  ctx.font = font(400, venueSize, fonts.walter);
  ctx.fillText(slide.venue.toLocaleUpperCase("sv"), padX, y);
  ctx.letterSpacing = "0px";

  y += venueSize + 26;
  ctx.fillStyle = CREAM;
  ctx.letterSpacing = "-0.02em";
  ctx.font = font(450, title.size, fonts.anselm);
  for (const line of title.lines) {
    ctx.fillText(line, padX, y);
    y += titleLineHeight;
  }
  ctx.letterSpacing = "0px";

  y += 8;
  ctx.fillStyle = "rgba(243, 238, 228, 0.86)";
  ctx.font = font(400, dateSize, fonts.anselm);
  ctx.fillText(slide.date, padX, y);

  if (ticker?.text) paintTicker(ctx, ticker, fonts, slide.date);
  ctx.restore();
}
