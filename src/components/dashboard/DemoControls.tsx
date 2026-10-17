"use client";

import { useState } from "react";
import type { Outcome } from "./api";

/** Demo-mode controls. Each call goes to a server route; the UI has no authority to dispatch or reset on its own. */
export function DemoControls({
  onTick,
  onReset,
  locked = false,
}: {
  onTick: () => Promise<Outcome>;
  onReset: () => Promise<Outcome>;
  /** True while any demo action (tick, reset, dispatch) is in flight, so they cannot race each other. */
  locked?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [ownBusy, setBusy] = useState(false);
  const busy = ownBusy || locked;
  const [result, setResult] = useState<Outcome | null>(null);

  async function run(fn: () => Promise<Outcome>) {
    setBusy(true);
    setResult(null);
    try {
      setResult(await fn());
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  const btn =
    "rounded border border-slate-700 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-100 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900";

  return (
    <section aria-label="Demo controls" className="space-y-2 rounded border border-slate-400 bg-slate-50 p-3">
      <h2 className="text-sm font-semibold text-slate-900">Demo controls (synthetic data only)</h2>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} disabled={busy} onClick={() => run(onTick)}>
          Run tick now
        </button>
        {!confirming ? (
          <button type="button" className={btn} disabled={busy} onClick={() => setConfirming(true)}>
            Reset demo
          </button>
        ) : (
          <>
            <button type="button" className={btn} disabled={busy} onClick={() => run(onReset)}>
              Confirm reset
            </button>
            <button type="button" className={btn} disabled={busy} onClick={() => setConfirming(false)}>
              Back
            </button>
          </>
        )}
      </div>
      {result?.ok && (
        <p
          role="status"
          aria-label="Demo control result"
          className={
            result.warn
              ? "rounded border border-amber-700 bg-amber-50 px-2 py-1 text-sm text-amber-950"
              : "text-sm text-slate-900"
          }
        >
          {result.warn && <strong>Completed with failures: </strong>}
          {result.summary}
        </p>
      )}
      {result && !result.ok && (
        <p role="alert" className="rounded border border-rose-700 bg-rose-50 px-2 py-1 text-sm text-rose-950">
          {result.error}
        </p>
      )}
    </section>
  );
}
