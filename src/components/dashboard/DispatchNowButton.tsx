"use client";

import { useState } from "react";
import type { Outcome } from "./api";

export function DispatchNowButton({ onDispatch }: { onDispatch: () => Promise<Outcome> }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Outcome | null>(null);
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setResult(null);
          try {
            setResult(await onDispatch());
          } finally {
            setBusy(false);
          }
        }}
        className="rounded border border-slate-700 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-100 disabled:opacity-50"
      >
        Dispatch now
      </button>
      {result?.ok && <p role="status" className="text-xs text-slate-800">{result.summary}</p>}
      {result && !result.ok && (
        <p role="alert" aria-label="Dispatch result" className="rounded border border-rose-700 bg-rose-50 px-2 py-1 text-sm text-rose-950">
          {result.error}
        </p>
      )}
    </div>
  );
}
