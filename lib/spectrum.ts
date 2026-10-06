// Frekvensband från uppspelningens ljud, ett per bokstav i ordmärket.

const BANDS = 6;
const EDGES = [2, 4, 8, 14, 24, 40, 72];

export type SpectrumTap = {
  resume: () => void;
  sample: (out: Float32Array) => void;
  close: () => void;
};

export function attachSpectrum(audio: HTMLAudioElement): SpectrumTap {
  let ctx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let bins: Uint8Array | null = null;

  function ensure() {
    if (ctx || typeof window === "undefined") return;
    ctx = new AudioContext();
    const source = ctx.createMediaElementSource(audio);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.84;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    bins = new Uint8Array(analyser.frequencyBinCount);
  }

  return {
    resume() {
      ensure();
      if (ctx && ctx.state === "suspended") void ctx.resume();
    },
    sample(out: Float32Array) {
      if (!analyser || !bins) {
        out.fill(0);
        return;
      }
      analyser.getByteFrequencyData(bins as unknown as Uint8Array<ArrayBuffer>);
      const count = Math.min(out.length, BANDS);
      for (let i = 0; i < count; i++) {
        const from = EDGES[i];
        const to = Math.min(EDGES[i + 1], bins.length);
        let sum = 0;
        for (let n = from; n < to; n++) sum += bins[n];
        const avg = sum / Math.max(1, to - from) / 255;
        out[i] = avg < 0.05 ? 0 : Math.pow(avg, 0.8);
      }
    },
    close() {
      void ctx?.close();
      ctx = null;
      analyser = null;
      bins = null;
    },
  };
}
