import {
  Ban,
  CircleDashed,
  CircleSlash,
  Hand,
  Hourglass,
  PackageCheck,
  Send,
  TimerOff,
  ShieldQuestion,
  Truck,
  UserX,
  type LucideIcon,
} from "lucide-react";
import type { DonationStatus } from "@/contracts";
import { cn } from "cn";

export type StatusTone = "neutral" | "review" | "info" | "offer" | "progress" | "danger" | "closed";

// Status colors encode workflow state only. No green-for-safe: "eligible" is informational blue, and a text label and
// an icon always accompany color.
const STATUS_STYLE: Record<DonationStatus, { label: string; tone: StatusTone; icon: LucideIcon }> = {
  draft: { label: "Draft", tone: "neutral", icon: CircleDashed },
  needs_review: { label: "Needs review", tone: "review", icon: ShieldQuestion },
  eligible: { label: "Eligible for dispatch", tone: "info", icon: Hourglass },
  unmatched: { label: "Unmatched", tone: "neutral", icon: UserX },
  offered: { label: "Offered", tone: "offer", icon: Send },
  claimed: { label: "Claimed", tone: "progress", icon: Hand },
  collected: { label: "Collected (simulated)", tone: "progress", icon: Truck },
  delivered: { label: "Delivered (simulated)", tone: "progress", icon: PackageCheck },
  rejected: { label: "Rejected", tone: "danger", icon: Ban },
  canceled: { label: "Canceled", tone: "closed", icon: CircleSlash },
  expired: { label: "Expired", tone: "closed", icon: TimerOff },
};

export const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "border-neutral-border bg-neutral-subtle text-neutral",
  review: "border-review-border bg-review-subtle text-review",
  info: "border-info-border bg-info-subtle text-info",
  offer: "border-offer-border bg-offer-subtle text-offer",
  progress: "border-progress-border bg-progress-subtle text-progress",
  danger: "border-danger-border bg-danger-subtle text-danger",
  closed: "border-closed-border bg-closed-subtle text-closed",
};

/** Solid accent used for a card's leading edge and the KPI tiles. */
export const TONE_ACCENT: Record<StatusTone, string> = {
  neutral: "bg-neutral-border",
  review: "bg-review-border",
  info: "bg-info-border",
  offer: "bg-offer-border",
  progress: "bg-progress-border",
  danger: "bg-danger-border",
  closed: "bg-closed-border",
};

export function statusLabel(status: DonationStatus): string {
  return STATUS_STYLE[status].label;
}

export function statusTone(status: DonationStatus): StatusTone {
  return STATUS_STYLE[status].tone;
}

export function statusIcon(status: DonationStatus): LucideIcon {
  return STATUS_STYLE[status].icon;
}

export function StatusBadge({ status, size = "sm" }: { status: DonationStatus; size?: "sm" | "lg" }) {
  const s = STATUS_STYLE[status];
  const Icon = s.icon;
  return (
    <span
      data-testid="status-badge"
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap",
        size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm",
        TONE_CLASS[s.tone],
      )}
    >
      <Icon aria-hidden className={size === "sm" ? "size-3.5" : "size-4"} />
      {s.label}
    </span>
  );
}
