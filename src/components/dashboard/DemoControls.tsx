"use client";

import { useState } from "react";
import { FlaskConical, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  return (
    <section
      aria-label="Demo controls"
      className="space-y-3 rounded-xl border border-dashed border-offer-border bg-offer-subtle/50 p-4"
    >
      <div className="space-y-0.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-offer">
          <FlaskConical aria-hidden className="size-4" />
          Demo controls (synthetic data only)
        </h2>
        <p className="text-xs text-foreground/75">Each button calls the server; the page decides nothing on its own.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => run(onTick)}>
          <Play aria-hidden />
          Run tick now
        </Button>
        {!confirming ? (
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setConfirming(true)}>
            <RotateCcw aria-hidden />
            Reset demo
          </Button>
        ) : (
          <>
            <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => run(onReset)}>
              Confirm reset
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setConfirming(false)}>
              Back
            </Button>
          </>
        )}
      </div>
      {result?.ok && (
        <p
          role="status"
          aria-label="Demo control result"
          className={
            result.warn
              ? "rounded-lg border border-review-border bg-review-subtle px-3 py-2 text-sm text-review"
              : "rounded-lg bg-card px-3 py-2 text-sm text-foreground"
          }
        >
          {result.warn && <strong>Completed with failures: </strong>}
          {result.summary}
        </p>
      )}
      {result && !result.ok && (
        <p role="alert" className="rounded-lg border border-danger-border bg-danger-subtle px-3 py-2 text-sm text-danger">
          {result.error}
        </p>
      )}
    </section>
  );
}
