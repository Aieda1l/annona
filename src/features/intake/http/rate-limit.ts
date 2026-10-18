// Per-client fixed-window limiter for the unauthenticated /api/verify/* routes. Every refused link writes a
// link.rejected audit row in core, so an unbounded caller could grow the audit table. In-memory and per process:
// enough to blunt a loop on the demo deployment, not a substitute for an edge limiter.

export type RateLimiter = (key: string) => boolean;

const MAX_KEYS = 5_000;

export function createRateLimiter(opts: { limit: number; windowMs: number; now?: () => number }): RateLimiter {
  const now = opts.now ?? Date.now;
  const windows = new Map<string, { start: number; count: number }>();
  return (key) => {
    const t = now();
    if (windows.size >= MAX_KEYS) {
      for (const [k, w] of windows) if (t - w.start >= opts.windowMs) windows.delete(k);
      // Still full of live windows: drop the oldest so memory stays bounded.
      if (windows.size >= MAX_KEYS) windows.delete(windows.keys().next().value as string);
    }
    const w = windows.get(key);
    if (!w || t - w.start >= opts.windowMs) {
      windows.set(key, { start: t, count: 1 });
      return true;
    }
    w.count += 1;
    return w.count <= opts.limit;
  };
}

/** The proxy-reported client address; "unknown" shares one bucket. Spoofable without a trusted proxy. */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || request.headers.get("x-real-ip") || "unknown").slice(0, 64);
}
