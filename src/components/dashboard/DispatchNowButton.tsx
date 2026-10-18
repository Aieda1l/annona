"use client";

import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <Button type="button" disabled={disabled} onClick={onDispatch} className="w-fit">
      <Send aria-hidden />
      Dispatch now
    </Button>
  );
}

export function DispatchResult({ result }: { result: Outcome }) {
  if (result.ok) {
    return (
      <p
        role="status"
        aria-label="Dispatch result"
        className={
          result.warn
            ? "rounded-lg border border-review-border bg-review-subtle px-3 py-2 text-xs text-review"
            : "rounded-lg bg-muted px-3 py-2 text-xs text-foreground/85"
        }
      >
        {result.warn && <strong>Completed with failures: </strong>}
        {result.summary}
      </p>
    );
  }
  return (
    <p role="alert" aria-label="Dispatch result" className="rounded-lg border border-danger-border bg-danger-subtle px-3 py-2 text-sm text-danger">
      {result.error}
    </p>
  );
}
