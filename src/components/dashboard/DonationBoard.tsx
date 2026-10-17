import type { ReactNode } from "react";
import type { DonationCard as DonationCardData, DonationStatus } from "@/contracts";
import { DonationCard } from "./DonationCard";
import { statusLabel } from "./StatusBadge";

// Display order only; grouping is by the server-provided status. `unmatched` is a dispatch outcome,
// so it gets its own neutral group and never safety styling.
const ORDER: readonly DonationStatus[] = [
  "needs_review",
  "eligible",
  "unmatched",
  "offered",
  "claimed",
  "collected",
  "delivered",
  "draft",
  "rejected",
  "canceled",
  "expired",
];

const HEADING: Partial<Record<DonationStatus, string>> = {
  unmatched: "Unmatched — needs couriers",
};

export function DonationBoard({
  donations,
  counts_by_status,
  renderActions,
}: {
  donations: readonly DonationCardData[];
  counts_by_status: Partial<Record<DonationStatus, number>>;
  renderActions?: (card: DonationCardData) => ReactNode;
}) {
  return (
    <div className="space-y-6">
      {ORDER.map((status) => {
        const cards = donations.filter((d) => d.status === status);
        if (cards.length === 0) return null;
        return (
          <section
            key={status}
            data-testid={`group-${status}`}
            data-tone={status === "unmatched" ? "neutral" : undefined}
            className="space-y-3"
          >
            <h2 className="text-lg font-semibold text-slate-900">
              {HEADING[status] ?? statusLabel(status)}{" "}
              <span className="text-sm font-normal text-slate-700">({counts_by_status[status] ?? cards.length})</span>
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {cards.map((c) => (
                <DonationCard key={c.id} card={c} actions={renderActions?.(c)} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
