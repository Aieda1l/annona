import type { ReactNode } from "react";
import type { DonationCard as DonationCardData, DonationStatus } from "@/contracts";
import { SectionHeading } from "@/components/layout/PageHeader";
import { DonationCard } from "./DonationCard";
import { statusIcon, statusLabel } from "./StatusBadge";

// Display order only; grouping is by the server-provided status. `unmatched` is a dispatch outcome,
// so it gets its own neutral group and never safety styling.
export const BOARD_ORDER: readonly DonationStatus[] = [
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
    <div className="space-y-8">
      {BOARD_ORDER.map((status) => {
        const cards = donations.filter((d) => d.status === status);
        if (cards.length === 0) return null;
        return (
          <section
            key={status}
            data-testid={`group-${status}`}
            data-tone={status === "unmatched" ? "neutral" : undefined}
            aria-labelledby={`group-heading-${status}`}
            className="scroll-mt-28 space-y-3"
            id={`status-${status}`}
          >
            <SectionHeading id={`group-heading-${status}`} icon={statusIcon(status)} count={counts_by_status[status] ?? cards.length}>
              {HEADING[status] ?? statusLabel(status)}
            </SectionHeading>
            <div className="grid gap-4 xl:grid-cols-2">
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
