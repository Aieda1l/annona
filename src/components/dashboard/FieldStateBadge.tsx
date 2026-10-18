import { CircleHelp, OctagonX, ShieldQuestion, Sparkles, UserCheck, type LucideIcon } from "lucide-react";
import type { FieldState } from "@/contracts";
import { cn } from "cn";

// Neutral palette on purpose: a field state describes provenance, never that a fact is good or safe.
const LABEL: Record<FieldState, string> = {
  suggested: "AI suggested",
  donor_verified: "Donor verified",
  unknown: "Unknown",
  needs_review: "Needs review",
  rejected: "Rejected",
};

const ICON: Record<FieldState, LucideIcon> = {
  suggested: Sparkles,
  donor_verified: UserCheck,
  unknown: CircleHelp,
  needs_review: ShieldQuestion,
  rejected: OctagonX,
};

const CLASS: Record<FieldState, string> = {
  // Dashed outline = a hypothesis that nobody has confirmed.
  suggested: "border-dashed border-input bg-card text-muted-foreground",
  donor_verified: "border-neutral-border bg-neutral-subtle text-neutral",
  unknown: "border-dashed border-closed-border bg-closed-subtle text-closed",
  needs_review: "border-review-border bg-review-subtle text-review",
  rejected: "border-danger-border bg-danger-subtle text-danger",
};

export function FieldStateBadge({ field, state }: { field: string; state: FieldState }) {
  const Icon = ICON[state];
  return (
    <span
      data-testid={`field-state-${field}`}
      data-state={state}
      className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs", CLASS[state])}
    >
      <Icon aria-hidden className="size-3 shrink-0" />
      <span className="font-medium capitalize">{field.replace(/[._]/g, " ")}:</span>
      <span>{LABEL[state]}</span>
    </span>
  );
}
