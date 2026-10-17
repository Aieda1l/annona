"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ResourceFailure = { code: string; message: string };

/**
 * Polls a GET route that answers `{ ok: true, data } | { ok: false, error }` (CONTRACTS section 3.15).
 * - Pauses while the tab is hidden and refreshes when it becomes visible again.
 * - Only the most recently started request may apply its result, so a slow old poll cannot overwrite newer state.
 * - On failure the last good data is kept with its failure code (the caller labels it stale); nothing is invented.
 * - `lastGoodAt` is the server `Date` header of the last good response; the browser clock is never used.
 */
export function useServerResource<T>(url: string, pollMs = 2000) {
  const [data, setData] = useState<T | null>(null);
  const [failure, setFailure] = useState<ResourceFailure | null>(null);
  const [lastGoodAt, setLastGoodAt] = useState<string | null>(null);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (document.hidden) return;
    const mine = ++seq.current;
    const latest = () => mine === seq.current;
    try {
      const res = await fetch(url, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!latest()) return;
      if (res.ok && body?.ok) {
        setData(body.data as T);
        setFailure(null);
        const date = res.headers.get("date");
        setLastGoodAt(date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : null);
      } else if (body && body.ok === false && body.error) {
        setFailure({ code: body.error.code, message: body.error.message });
      } else {
        setFailure({ code: `HTTP_${res.status}`, message: "Unexpected response from the server." });
      }
    } catch {
      if (latest()) setFailure({ code: "UNREACHABLE", message: "The server could not be reached." });
    }
  }, [url]);

  useEffect(() => {
    const first = setTimeout(() => void reload(), 0);
    const timer = setInterval(() => void reload(), pollMs);
    const onVisible = () => {
      if (!document.hidden) void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload, pollMs]);

  return { data, failure, lastGoodAt, reload };
}
