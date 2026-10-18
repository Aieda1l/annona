import { AlertTriangle, Info, OctagonX } from "lucide-react";
import type { EligibilityReason } from "@/contracts";
import { cn } from "cn";

// Renders the server's `message` verbatim. `dispatch` severity is a matching outcome, so it stays neutral.
export function ReasonList({ reasons }: { reasons: readonly EligibilityReason[] }) {
  if (reasons.length === 0) return null;
  return (
    <ul className="space-y-1.5" aria-label="Decision reasons">
      {reasons.map((r, i) => {
        const Icon = r.severity === "dispatch" ? Info : r.severity === "reject" ? OctagonX : AlertTriangle;
        return (
          <li
            key={`${r.code}-${r.field ?? i}`}
            data-severity={r.severity}
            className={cn(
              "flex gap-2.5 rounded-lg border px-3 py-2 text-sm",
              r.severity === "dispatch"
                ? "border-neutral-border bg-neutral-subtle text-neutral"
                : r.severity === "reject"
                  ? "border-danger-border bg-danger-subtle text-danger"
                  : "border-review-border bg-review-subtle text-review",
            )}
          >
            <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0">
              <span>{r.message}</span>
              <span className="mt-0.5 block font-mono text-[11px] opacity-75">{r.code}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
