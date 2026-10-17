import type { EligibilityReason } from "@/contracts";

// Renders the server's `message` verbatim. `dispatch` severity is a matching outcome, so it stays neutral.
export function ReasonList({ reasons }: { reasons: readonly EligibilityReason[] }) {
  if (reasons.length === 0) return null;
  return (
    <ul className="space-y-1" aria-label="Decision reasons">
      {reasons.map((r, i) => (
        <li
          key={`${r.code}-${r.field ?? i}`}
          data-severity={r.severity}
          className={`rounded border-l-4 px-2 py-1 text-sm ${
            r.severity === "dispatch"
              ? "border-slate-400 bg-slate-50 text-slate-900"
              : r.severity === "reject"
                ? "border-rose-600 bg-rose-50 text-rose-950"
                : "border-amber-600 bg-amber-50 text-amber-950"
          }`}
        >
          <span className="mr-2 font-mono text-xs opacity-80">{r.code}</span>
          <span>{r.message}</span>
        </li>
      ))}
    </ul>
  );
}
