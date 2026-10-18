"use client";

import type { Outcome } from "./api";

export type DispatchState = { busy: boolean; result: Outcome | null };

/** Presentational: state lives in OperatorDashboard so it survives the card moving columns after a dispatch. */
export function DispatchNowButton({
  onDispatch,
  disabled,
}: {
  onDispatch: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onDispatch}
      className="rounded border border-slate-700 bg-card px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-100 disabled:opacity-50"
    >
      Dispatch now
    </button>
  );
}

export function DispatchResult({ result }: { result: Outcome }) {
  if (result.ok) {
    return (
      <p
        role="status"
        aria-label="Dispatch result"
        className={result.warn ? "rounded border border-amber-700 bg-amber-50 px-2 py-1 text-xs text-amber-950" : "text-xs text-slate-800"}
      >
        {result.warn && <strong>Completed with failures: </strong>}
        {result.summary}
      </p>
    );
  }
  return (
    <p role="alert" aria-label="Dispatch result" className="rounded border border-rose-700 bg-rose-50 px-2 py-1 text-sm text-rose-950">
      {result.error}
    </p>
  );
}
