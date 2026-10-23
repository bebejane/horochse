import { Muxer, ArrayBufferTarget } from "mp4-muxer";

import { drawPoster, paintTicker, TICKER_SPEED, type PosterFonts, type PosterFormat, type PosterSlide } from "./poster";

const CODECS = ["avc1.640028", "avc1.4d0028", "avc1.420028"];
const TICKER_FPS = 30;

/**
 * En bild per konsert och ett hårt klipp mellan dem. Rad överst scrollar.
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
): Promise<Blob> {
  if (!slides.length) throw new Error("Inga inlägg att exportera.");
  if (typeof VideoEncoder === "undefined") {
    throw new Error("Den här webbläsaren kan inte skapa en mp4.");
  }

  const holdUs = Math.round(seconds * 1_000_000);
  const scroll = ticker.trim() && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const framesPerSlide = scroll ? Math.max(1, Math.round(seconds * TICKER_FPS)) : 1;
  const frameUs = Math.round(holdUs / framesPerSlide);
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

  let videoError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      muxer.addVideoChunkRaw(data, chunk.type, chunk.timestamp, frameUs, meta);
    },
    error: (err) => {
      videoError = asError(err);
    },
  });

  try {
    await configureVideo(encoder, format);

    const still = document.createElement("canvas");
    still.width = format.width;
    still.height = format.height;
    const stillCtx = still.getContext("2d", { alpha: false });
    if (!stillCtx) throw new Error("Kunde inte rita bilden.");

    let frameIndex = 0;

    for (let i = 0; i < slides.length; i++) {
      drawPoster(stillCtx, slides[i], fonts);
      for (let frame = 0; frame < framesPerSlide; frame++) {
        if (isCancelled()) throw new Error("Exporten avbröts.");
        if (videoError) throw videoError;
        ctx.drawImage(still, 0, 0);
        if (ticker) {
          const offset = scroll ? (i * seconds + frame / TICKER_FPS) * TICKER_SPEED : format.width;
          paintTicker(ctx, { text: ticker, offset }, fonts, slides[i].date);
        }
        const sample = new VideoFrame(canvas, { timestamp: frameIndex * frameUs, duration: frameUs });
        frameIndex += 1;
        try {
          encoder.encode(sample, { keyFrame: frame === 0 });
        } finally {
          sample.close();
        }
        await drain(encoder, () => videoError);
      }
      onProgress(i + 1, slides.length);
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
      bitrate: 8_000_000,
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
