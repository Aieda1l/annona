import type { FieldState } from "@/contracts";

// Neutral palette on purpose: a field state describes provenance, never that a fact is good or safe.
const LABEL: Record<FieldState, string> = {
  suggested: "AI suggested",
  donor_verified: "Donor verified",
  unknown: "Unknown",
  needs_review: "Needs review",
  rejected: "Rejected",
};

const CLASS: Record<FieldState, string> = {
  suggested: "border-dashed border-slate-500 bg-card text-slate-800",
  donor_verified: "border-slate-600 bg-slate-100 text-slate-900",
  unknown: "border-slate-500 bg-slate-200 text-slate-900",
  needs_review: "border-amber-600 bg-amber-50 text-amber-950",
  rejected: "border-rose-700 bg-rose-50 text-rose-950",
};

export function FieldStateBadge({ field, state }: { field: string; state: FieldState }) {
  return (
    <span
      data-testid={`field-state-${field}`}
      data-state={state}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs ${CLASS[state]}`}
    >
      <span className="font-medium">{field.replace(/[._]/g, " ")}:</span>
      <span>{LABEL[state]}</span>
    </span>
  );
}
