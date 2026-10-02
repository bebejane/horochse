const started = Date.now();

export function fmtElapsed(ms = Date.now() - started): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const milli = ms % 1000;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(milli).padStart(3, "0")}`;
}

export function elapsedMs(): number {
  return Date.now() - started;
}

export function log(message: string): void {
  process.stdout.write(`[${fmtElapsed()}] ${message}\n`);
}

export function warn(message: string): void {
  process.stderr.write(`[${fmtElapsed()}] ${message}\n`);
}

export function seconds(ms: number): string {
  return (ms / 1000).toFixed(1) + "s";
}

/** Run `worker` over `items` with a bounded number of concurrent tasks, preserving result order. */
export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const width = Math.max(1, Math.min(Math.floor(concurrency) || 1, items.length || 1));
  const runners = Array.from({ length: width }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

/** Deduplicate concurrent calls that share a cache key: reuse the in-flight promise. */
export function memoInflight<K, V>(
  inflight: Map<K, Promise<V>>,
  key: K,
  factory: () => Promise<V>,
): Promise<V> {
  const existing = inflight.get(key);
  if (existing) return existing;
  const promise = factory().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

/** Reject with a clear error if `promise` does not settle within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: timeout efter ${Math.round(ms / 1000)}s`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
