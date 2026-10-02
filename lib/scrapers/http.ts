export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message?: string) {
    super(message ?? `HTTP ${status}`);
    this.name = "HttpError";
    this.status = status;
  }
}

let maxInflight = Math.max(1, Number(process.env.SCRAPE_HTTP_CONCURRENCY || 6) || 6);
let activeInflight = 0;
const waiters: Array<() => void> = [];

export function setHttpConcurrency(value: number): void {
  maxInflight = Math.max(1, Math.floor(value) || 1);
}

export function getHttpConcurrency(): number {
  return maxInflight;
}

/**
 * Temporarily switch the in-flight cap for a phase. The track stage talks to
 * the Bandcamp/SoundCloud APIs, which tolerate far more parallelism than the
 * venue sites, so it can run much wider without being rude or getting blocked.
 */
export async function withHttpConcurrency<T>(value: number, fn: () => Promise<T>): Promise<T> {
  const prev = maxInflight;
  maxInflight = Math.max(1, Math.floor(value) || 1);
  try {
    return await fn();
  } finally {
    maxInflight = prev;
  }
}

let httpVerbose = false;

export function setHttpVerbose(value: boolean): void {
  httpVerbose = value;
}

let httpInFlight = 0;

function httpTrace(done: boolean, method: string, url: string, started: number, note = ""): void {
  if (!httpVerbose) return;
  const ms = Date.now() - started;
  const tag = done ? "←" : "→";
  const tail = note ? ` ${note}` : "";
  process.stderr.write(
    `[http ${String(httpInFlight).padStart(2)}] ${tag} ${method} ${ms}ms ${url}${tail}\n`,
  );
}

/** Global in-flight cap so parallel sources/track lookups never hammer a host. */
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (activeInflight >= maxInflight) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  activeInflight++;
  try {
    return await fn();
  } finally {
    activeInflight--;
    const next = waiters.shift();
    if (next) next();
  }
}

export type HttpOptions = {
  data?: Uint8Array | string | null;
  contentType?: string | null;
  extraHeaders?: Record<string, string>;
  timeoutMs?: number;
};

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toBody(data: Uint8Array | string): BodyInit {
  if (typeof data === "string") return data;
  return new Uint8Array(data);
}

export async function httpRequest(url: string, opts: HttpOptions = {}): Promise<string> {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "*/*",
    ...(opts.extraHeaders || {}),
  };
  let body: BodyInit | undefined;
  if (opts.data != null) {
    headers["Content-Type"] = opts.contentType || "application/x-www-form-urlencoded";
    body = toBody(opts.data);
  }
  return withSlot(async () => {
    const method = opts.data != null ? "POST" : "GET";
    httpInFlight++;
    const t = Date.now();
    httpTrace(false, method, url, t);
    try {
      const res = await fetch(url, {
        method,
        headers,
        body,
        redirect: "follow",
        signal: AbortSignal.timeout(opts.timeoutMs ?? 30000),
      });
      if (!res.ok) {
        httpTrace(true, method, url, t, `HTTP ${res.status}`);
        throw new HttpError(res.status, `HTTP ${res.status} for ${url}`);
      }
      const text = await res.text();
      httpTrace(true, method, url, t, `HTTP ${res.status} ${text.length}b`);
      return text;
    } catch (err) {
      if (!(err instanceof HttpError)) httpTrace(true, method, url, t, String(err));
      throw err;
    } finally {
      httpInFlight--;
    }
  });
}

export async function httpJson(url: string, payload: Record<string, unknown>): Promise<any> {
  const body = JSON.stringify(payload);
  const headers = {
    "User-Agent": UA,
    Accept: "application/json",
    "Content-Type": "application/json",
    Referer: "https://bandcamp.com/",
  };
  let lastError: unknown;
  const attempts = 4;
  for (let attempt = 0; attempt < attempts; attempt++) {
    // Bandcamp's search API is rate-limited per host; serialize same-host calls
    // so bursts from many concurrent artists don't trip 429s.
    await hostThrottle(url);
    const res = await withSlot(() =>
      fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(30000) }),
    );
    if (res.ok) return await res.json();
    lastError = new HttpError(res.status, `HTTP ${res.status} for ${url}`);
    if (res.status !== 429 || attempt === attempts - 1) throw lastError;
    // Honor Retry-After; otherwise a short exponential backoff with jitter. The
    // caller's circuit handles sustained 429s, so keep this bounded and small.
    const retryAfter = Number(res.headers.get("retry-after") || 0);
    const base = retryAfter > 0 ? retryAfter * 1000 : Math.min(6000, 1000 * 2 ** attempt);
    await sleep(base + Math.floor(Math.random() * 500));
  }
  throw lastError;
}

// --- Per-host throttling ----------------------------------------------------
// Some APIs (Bandcamp search) 429 if several requests land at once. These
// limits apply globally per host so concurrency in the caller can stay high.
const HOST_LIMITS: { match: RegExp; minIntervalMs: number; maxConcurrent: number }[] = [
  { match: /bandcamp\.com$/i, minIntervalMs: 400, maxConcurrent: 1 },
];

type HostState = { last: number; active: number; queue: Array<() => void> };
const hostStates = new Map<string, HostState>();

function hostState(host: string): HostState {
  let state = hostStates.get(host);
  if (!state) {
    state = { last: 0, active: 0, queue: [] };
    hostStates.set(host, state);
  }
  return state;
}

async function hostThrottle(url: string): Promise<void> {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return;
  }
  const limit = HOST_LIMITS.find((entry) => entry.match.test(host));
  if (!limit) return;
  const state = hostState(host);
  if (state.active >= limit.maxConcurrent) {
    await new Promise<void>((resolve) => state.queue.push(resolve));
  }
  state.active++;
  const wait = state.last + limit.minIntervalMs - Date.now();
  if (wait > 0) await sleep(wait);
  state.last = Date.now();
  // Release the concurrency slot once the (throttled) caller proceeds.
  queueMicrotask(() => {
    state.active--;
    const next = state.queue.shift();
    if (next) next();
  });
}
