import { Muxer, ArrayBufferTarget } from "mp4-muxer";

import { drawPoster, POSTER_H, POSTER_W, type PosterFonts, type PosterSlide } from "./poster";

const CODECS = ["avc1.640028", "avc1.4d0028", "avc1.420028"];

/**
 * En stillbild per konsert, med längden som sample-duration, så bytet är ett
 * hårt klipp. Kodaren är mjukvara och filmen är tyst: hårdvarukodaren och
 * AAC-kodaren kan ta ner hela webbläsarprocessen, och därmed Cursor.
 */
export async function exportFilm(
  slides: PosterSlide[],
  seconds: number,
  fonts: PosterFonts,
  onProgress: (done: number, total: number) => void,
  isCancelled: () => boolean,
): Promise<Blob> {
  if (!slides.length) throw new Error("Inga inlägg att exportera.");
  if (typeof VideoEncoder === "undefined") {
    throw new Error("Den här webbläsaren kan inte skapa en mp4.");
  }

  const holdUs = Math.round(seconds * 1_000_000);
  const canvas = document.createElement("canvas");
  canvas.width = POSTER_W;
  canvas.height = POSTER_H;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Kunde inte rita bilden.");

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: "avc", width: POSTER_W, height: POSTER_H },
    fastStart: "in-memory",
  });

  let videoError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      muxer.addVideoChunkRaw(data, chunk.type, chunk.timestamp, holdUs, meta);
    },
    error: (err) => {
      videoError = asError(err);
    },
  });

  try {
    await configureVideo(encoder);

    for (let i = 0; i < slides.length; i++) {
      if (isCancelled()) throw new Error("Exporten avbröts.");
      if (videoError) throw videoError;
      drawPoster(ctx, slides[i], fonts);
      const frame = new VideoFrame(canvas, { timestamp: i * holdUs, duration: holdUs });
      try {
        encoder.encode(frame, { keyFrame: true });
      } finally {
        frame.close();
      }
      await drain(encoder, () => videoError);
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

async function configureVideo(encoder: VideoEncoder) {
  for (const codec of CODECS) {
    const config: VideoEncoderConfig = {
      codec,
      width: POSTER_W,
      height: POSTER_H,
      bitrate: 3_000_000,
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
  throw new Error("Den här webbläsaren kan inte koda 1080×1350 till mp4.");
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
