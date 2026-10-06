export const POSTER_W = 1080;
export const POSTER_H = 1350;

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

const CREAM = "#f3eee4";
const INK = "#14120f";

/** Same-origin variant so the canvas stays exportable. Remote posters would taint it. */
export function posterImageUrl(src: string, width: 200 | 1200 = 1200): string {
  if (!src) return "";
  if (src.startsWith("/")) return src;
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75`;
}

export function loadPosterImage(src: string): Promise<HTMLImageElement | null> {
  const url = posterImageUrl(src, 1200);
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = url;
  });
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
    document.fonts.load(`italic 400 42px "${anselm}"`),
    document.fonts.load(`700 80px "${anselm}"`),
    document.fonts.load(`400 36px "${walter}"`),
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
  let size = 86;
  while (size >= 40) {
    ctx.font = font(700, size, family);
    const lines = wrapLine(ctx, title, maxWidth);
    const tooWide = lines.some((line) => ctx.measureText(line).width > maxWidth + 1);
    if (!tooWide && lines.length <= 6) return { size, lines };
    size -= 2;
  }
  ctx.font = font(700, 40, family);
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

export function drawPoster(ctx: CanvasRenderingContext2D, slide: PosterSlide | null, fonts: PosterFonts) {
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
    ctx.restore();
    return;
  }

  const padX = 72;
  const maxWidth = width - padX * 2;
  const title = layoutTitle(ctx, slide.title || "Konsert", fonts.anselm, maxWidth);
  const venueSize = 34;
  const dateSize = 42;
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
  ctx.font = font(700, title.size, fonts.anselm);
  for (const line of title.lines) {
    ctx.fillText(line, padX, y);
    y += titleLineHeight;
  }

  y += 8;
  ctx.fillStyle = "rgba(243, 238, 228, 0.86)";
  ctx.font = font(400, dateSize, fonts.anselm);
  ctx.fillText(slide.date, padX, y);
  ctx.restore();
}
