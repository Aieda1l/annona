// T-UI-02: nothing the UI renders may imply food safety, allergen freedom, certification or compliance.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DONATION_CARD_FIXTURES, DONATION_STATUSES, type DonationCard as Card } from "@/contracts";
import { DonationBoard } from "@/components/dashboard/DonationBoard";
import { OperatorActions } from "@/components/dashboard/OperatorActions";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { ModeBanner } from "@/components/layout/ModeBanner";

afterEach(cleanup);

const FORBIDDEN = /\b(safe|safely|safety-approved|allergen[- ]free|certified|compliant|compliance)\b/i;

describe("T-UI-02 no safety wording", () => {
  it("fixture cards, board, actions", () => {
    const { container } = render(
      <>
        <DonationBoard donations={DONATION_CARD_FIXTURES} counts_by_status={{}} />
        {DONATION_CARD_FIXTURES.map((c: Card) => (
          <OperatorActions key={c.id} card={c} onAction={vi.fn()} />
        ))}
      </>,
    );
    expect(container.textContent ?? "").not.toMatch(FORBIDDEN);
  });

  it.each(DONATION_STATUSES)("status badge %s", (status) => {
    const { container } = render(<StatusBadge status={status} />);
    expect(container.textContent ?? "").not.toMatch(FORBIDDEN);
  });

  it("mode banner", () => {
    const { container } = render(
      <ModeBanner
        generated_at="2026-10-17T23:00:00.000Z"
        modes={{
          vision: { mode: "fake", provider: "fake", model: null, status: "ok" },
          messaging: { mode: "fake", provider: "fake", channel: "simulated", status: "ok" },
          store: "pglite",
          demo_accelerated: true,
          last_tick_at: "2026-10-17T22:59:55.000Z",
          policy_version: "x",
        }}
      />,
    );
    expect(container.textContent ?? "").not.toMatch(FORBIDDEN);
  });
});
