import type { DonationStatus } from "@/contracts";

// Status colors encode workflow state only. No green-for-safe, and a text label always accompanies color.
const STATUS_STYLE: Record<DonationStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "border-slate-400 bg-slate-100 text-slate-900" },
  needs_review: { label: "Needs review", className: "border-amber-600 bg-amber-100 text-amber-950" },
  eligible: { label: "Eligible for dispatch", className: "border-sky-700 bg-sky-100 text-sky-950" },
  unmatched: { label: "Unmatched", className: "border-slate-500 bg-slate-100 text-slate-900" },
  offered: { label: "Offered", className: "border-indigo-700 bg-indigo-100 text-indigo-950" },
  claimed: { label: "Claimed", className: "border-teal-700 bg-teal-100 text-teal-950" },
  collected: { label: "Collected (simulated)", className: "border-teal-700 bg-teal-100 text-teal-950" },
  delivered: { label: "Delivered (simulated)", className: "border-teal-800 bg-teal-200 text-teal-950" },
  rejected: { label: "Rejected", className: "border-rose-700 bg-rose-100 text-rose-950" },
  canceled: { label: "Canceled", className: "border-slate-500 bg-slate-200 text-slate-900" },
  expired: { label: "Expired", className: "border-stone-600 bg-stone-200 text-stone-900" },
};

export function statusLabel(status: DonationStatus): string {
  return STATUS_STYLE[status].label;
}

export function StatusBadge({ status }: { status: DonationStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      data-testid="status-badge"
      data-status={status}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${s.className}`}
    >
      {/* Shape plus text label: color is never the only cue. */}
      <span aria-hidden="true" className="size-1.5 rounded-sm bg-current" />
      {s.label}
    </span>
  );
}
