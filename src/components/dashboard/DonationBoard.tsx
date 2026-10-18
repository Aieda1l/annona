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
  detailHref,
}: {
  donations: readonly DonationCardData[];
  counts_by_status: Partial<Record<DonationStatus, number>>;
  renderActions?: (card: DonationCardData) => ReactNode;
  detailHref?: (card: DonationCardData) => string;
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
            <h2 className="flex items-baseline gap-2 border-b border-border pb-1 text-xl font-bold">
              {HEADING[status] ?? statusLabel(status)}{" "}
              <span className="tabular rounded-full bg-primary/15 px-2 py-0.5 font-sans text-xs font-semibold text-primary">({counts_by_status[status] ?? cards.length})</span>
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {cards.map((c) => (
                <DonationCard key={c.id} card={c} actions={renderActions?.(c)} detailHref={detailHref?.(c)} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
