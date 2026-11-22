import { Muxer, ArrayBufferTarget } from "mp4-muxer";

import {
  drawPoster,
  paintTicker,
  TICKER_SPEED,
  type PosterFonts,
  type PosterFormat,
  type PosterSlide,
} from "./poster";

type SlidePainter = (ctx: CanvasRenderingContext2D, slide: PosterSlide, fonts: PosterFonts) => void;

const CODECS = ["avc1.640028", "avc1.4d0028", "avc1.420028"];
const TICKER_FPS = 30;
const BITRATE = 20_000_000;

/**
 * En bild per konsert och ett hårt klipp mellan dem. Raden i högerkanten scrollar nedåt.
 * Kodaren är mjukvara och filmen är tyst: hårdvarukodaren och AAC-kodaren
 * kan ta ner hela webbläsarprocessen, och därmed Cursor.
 */
export async function exportFilm(
  slides: PosterSlide[],
  seconds: number,
  fonts: PosterFonts,
  format: PosterFormat,
  ticker: string,
  onProgress: (done: number, total: number) => void,
  isCancelled: () => boolean,
  paint: SlidePainter = drawPoster,
): Promise<Blob> {
  const scroll =
    paint === drawPoster &&
    ticker.trim() &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const still = document.createElement("canvas");
  still.width = format.width;
  still.height = format.height;
  const stillCtx = still.getContext("2d", { alpha: false });
  if (!stillCtx) throw new Error("Kunde inte rita bilden.");

  const sections = slides.map((slide, index): FilmSection => ({
    seconds: slide.hold ?? seconds,
    fps: scroll ? TICKER_FPS : undefined,
    paint(ctx, elapsed) {
      if (elapsed === 0) paint(stillCtx, slide, fonts);
      ctx.drawImage(still, 0, 0);
      if (paint === drawPoster && ticker) {
        const offset = scroll ? (index * seconds + elapsed) * TICKER_SPEED : 0;
        paintTicker(ctx, { text: ticker, offset }, fonts);
      }
    },
  }));

  return encodeFilm(sections, format, onProgress, isCancelled);
}

export type FilmSection = {
  seconds: number;
  fps?: number;
  paint: (ctx: CanvasRenderingContext2D, elapsed: number) => void;
};

export async function encodeFilm(
  sections: FilmSection[],
  format: PosterFormat,
  onProgress: (done: number, total: number) => void,
  isCancelled: () => boolean,
): Promise<Blob> {
  if (!sections.length) throw new Error("Inga inlägg att exportera.");
  if (typeof VideoEncoder === "undefined") {
    throw new Error("Den här webbläsaren kan inte skapa en mp4.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = format.width;
  canvas.height = format.height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Kunde inte rita bilden.");

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: "avc", width: format.width, height: format.height },
    fastStart: "in-memory",
  });

  const durations = new Map<number, number>();
  let videoError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      muxer.addVideoChunkRaw(
        data,
        chunk.type,
        chunk.timestamp,
        chunk.duration ?? durations.get(chunk.timestamp)!,
        meta,
      );
      durations.delete(chunk.timestamp);
    },
    error: (err) => {
      videoError = asError(err);
    },
  });

  try {
    await configureVideo(encoder, format);

    let timestampUs = 0;

    for (const [index, section] of sections.entries()) {
      const holdUs = Math.max(1, Math.round(section.seconds * 1_000_000));
      const frames = section.fps ? Math.max(1, Math.round(section.seconds * section.fps)) : 1;
      for (let frame = 0; frame < frames; frame++) {
        if (isCancelled()) throw new Error("Exporten avbröts.");
        if (videoError) throw videoError;
        section.paint(ctx, (frame / frames) * section.seconds);
        const offsetUs = Math.round((frame * holdUs) / frames);
        const frameUs = Math.round(((frame + 1) * holdUs) / frames) - offsetUs;
        const sample = new VideoFrame(canvas, { timestamp: timestampUs + offsetUs, duration: frameUs });
        try {
          durations.set(sample.timestamp, frameUs);
          encoder.encode(sample, { keyFrame: frame === 0 });
        } finally {
          sample.close();
        }
        await drain(encoder, () => videoError);
      }
      timestampUs += holdUs;
      onProgress(index + 1, sections.length);
    }

    await encoder.flush();
    if (videoError) throw videoError;
  } finally {
    if (encoder.state !== "closed") encoder.close();
    canvas.width = 0;
    canvas.height = 0;
  }

  muxer.finalize();
  return new Blob([target.buffer], { type: "video/mp4" });
}

async function configureVideo(encoder: VideoEncoder, format: PosterFormat) {
  for (const codec of CODECS) {
    const config: VideoEncoderConfig = {
      codec,
      width: format.width,
      height: format.height,
      bitrate: BITRATE,
      bitrateMode: "variable",
      hardwareAcceleration: "prefer-software",
      avc: { format: "avc" },
    };
    try {
      const support = await VideoEncoder.isConfigSupported(config);
      if (!support.supported) continue;
      encoder.configure(config);
      return;
    } catch {
      continue;
    }
  }
  throw new Error(`Den här webbläsaren kan inte koda ${format.width}×${format.height} till mp4.`);
}

async function drain(encoder: VideoEncoder, failed: () => Error | null) {
  while (encoder.encodeQueueSize > 1) {
    const err = failed();
    if (err) throw err;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
}

function asError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  if (/encoding error/i.test(message)) {
    return new Error("Webbläsaren avbröt kodningen. Välj färre inlägg och försök igen.");
  }
  return err instanceof Error ? err : new Error(message);
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
