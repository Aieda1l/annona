// T-UI-01: a card renders for every DonationStatus, with reasons and FieldState badges from
// decision.field_states; `unmatched` sits in its own neutral group. Fixtures only, no network.
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  DONATION_CARD_FIXTURES,
  DONATION_STATUSES,
  eligibleCard,
  type DonationCard as DonationCardData,
  type DonationStatus,
} from "@/contracts";
import { DonationCard } from "@/components/dashboard/DonationCard";
import { DonationBoard } from "@/components/dashboard/DonationBoard";
import { StatusBadge } from "@/components/dashboard/StatusBadge";

afterEach(cleanup); // vitest globals are off, so RTL does not auto-clean

const unmatchedCard: DonationCardData = {
  ...eligibleCard,
  id: "00000000-0000-4000-8000-0000000000d9",
  status: "unmatched",
  decision: {
    ...eligibleCard.decision!,
    reasons: [
      {
        code: "NO_ELIGIBLE_MATCH",
        severity: "dispatch",
        message: "No cold-capable courier is available right now.",
      },
    ],
  },
};

const counts = (cards: readonly DonationCardData[]): Partial<Record<DonationStatus, number>> => {
  const out: Partial<Record<DonationStatus, number>> = {};
  for (const c of cards) out[c.status] = (out[c.status] ?? 0) + 1;
  return out;
};

describe("T-UI-01 StatusBadge", () => {
  it.each(DONATION_STATUSES)("renders a text label for %s (never color alone)", (status) => {
    render(<StatusBadge status={status} />);
    const badge = screen.getByTestId("status-badge");
    expect(badge).toHaveAttribute("data-status", status);
    expect(badge.textContent?.trim().length).toBeGreaterThan(0);
  });
});

describe("T-UI-01 DonationCard", () => {
  it.each(DONATION_CARD_FIXTURES.map((c) => [c.status, c] as const))(
    "renders the %s fixture with reasons verbatim and field-state badges",
    (_status, card) => {
      render(<DonationCard card={card} />);
      expect(screen.getByTestId("status-badge")).toHaveAttribute("data-status", card.status);

      for (const reason of card.decision?.reasons ?? []) {
        expect(screen.getByText(reason.message)).toBeInTheDocument();
      }
      for (const [field, state] of Object.entries(card.decision?.field_states ?? {})) {
        const badge = screen.getByTestId(`field-state-${field}`);
        expect(badge).toHaveAttribute("data-state", state);
        expect(badge.textContent).toMatch(new RegExp(state.replace("_", "[ _]"), "i"));
      }
    },
  );

  it("renders an unmatched card with a dispatch reason", () => {
    render(<DonationCard card={unmatchedCard} />);
    expect(screen.getByText("No cold-capable courier is available right now.")).toBeInTheDocument();
  });
});

describe("T-UI-01 DonationBoard", () => {
  const all = [...DONATION_CARD_FIXTURES, unmatchedCard];

  it("groups cards by status with server counts", () => {
    render(<DonationBoard donations={all} counts_by_status={counts(all)} />);
    for (const status of ["needs_review", "eligible", "claimed"] as const) {
      const group = screen.getByTestId(`group-${status}`);
      expect(within(group).getAllByTestId("donation-card")).toHaveLength(1);
    }
  });

  it("puts unmatched cards in their own neutral group", () => {
    render(<DonationBoard donations={all} counts_by_status={counts(all)} />);
    const group = screen.getByTestId("group-unmatched");
    expect(within(group).getByRole("heading", { name: /Unmatched — needs couriers/ })).toBeInTheDocument();
    expect(group).toHaveAttribute("data-tone", "neutral");
    expect(within(group).getAllByTestId("donation-card")).toHaveLength(1);
    // never inside the needs_review (safety) group
    expect(within(screen.getByTestId("group-needs_review")).queryByText(/Unmatched/)).toBeNull();
  });
});
