// Slice 2 item 4: operator detail page. Server truth only: no status, eligibility or deadline is computed here.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  claimedCard,
  DONATION_CARD_FIXTURES,
  DONATION_STATUSES,
  eligibleCard,
  needsReviewCard,
  type DonationCard,
  type DonationStatus,
} from "@/contracts";
import { DonationDetail } from "@/components/dashboard/DonationDetail";
import { HandoffControls } from "@/components/dashboard/HandoffControls";

afterEach(cleanup);

// Uses the shared fixture for a status when it exists; derives one from the closest fixture otherwise.
const cardFor = (status: DonationStatus): DonationCard =>
  DONATION_CARD_FIXTURES.find((c) => c.status === status) ?? {
    ...(status === "collected" || status === "delivered" ? claimedCard : eligibleCard),
    status,
    ...(status === "draft" ? { verified_facts: null, decision: null, effective_cutoff_at: null } : {}),
    handoff: {
      collected_at: status === "collected" || status === "delivered" ? "2026-10-17T23:25:00.000Z" : null,
      delivered_at: status === "delivered" ? "2026-10-17T23:40:00.000Z" : null,
      simulated: true,
    },
  };

const FORBIDDEN = /\b(safe|safely|allergen[- ]free|certified|compliant|compliance)\b/i;
const noop = vi.fn();

describe("DonationDetail", () => {
  it.each(DONATION_STATUSES)("renders the %s card with a status badge and no safety wording", (status) => {
    const card = cardFor(status);
    const { container } = render(<DonationDetail card={card} onAction={noop} onHandoff={noop} />);
    expect(screen.getByTestId("status-badge")).toHaveAttribute("data-status", status);
    expect(container.textContent ?? "").not.toMatch(FORBIDDEN);
  });

  it("shows donor-stated facts labeled as donor-attested, never as verified by us", () => {
    render(<DonationDetail card={eligibleCard} onAction={noop} onHandoff={noop} />);
    const facts = screen.getByRole("region", { name: /donor-attested facts/i });
    expect(within(facts).getByText(/donor-attested/i)).toBeInTheDocument();
    expect(facts).toHaveTextContent(eligibleCard.verified_facts!.dish_name);
    expect(facts).toHaveTextContent(String(eligibleCard.verified_facts!.servings));
  });

  it("shows a placeholder, not invented facts, when there are none yet", () => {
    render(<DonationDetail card={cardFor("draft")} onAction={noop} onHandoff={noop} />);
    expect(screen.getByText(/no donor facts submitted yet/i)).toBeInTheDocument();
  });

  it("shows the image when image_url is set, otherwise says none is on file", () => {
    render(<DonationDetail card={{ ...eligibleCard, image_url: "/api/images/abc" }} onAction={noop} onHandoff={noop} />);
    expect(screen.getByRole("img", { name: /donor photo/i })).toHaveAttribute("src", "/api/images/abc");
    cleanup();
    render(<DonationDetail card={eligibleCard} onAction={noop} onHandoff={noop} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(/no image on file/i)).toBeInTheDocument();
  });

  it("renders every reason message verbatim and the full audit timeline", () => {
    const withTimeline: DonationCard = {
      ...needsReviewCard,
      timeline: [
        { id: "00000000-0000-4000-8000-000000000501", at: "2026-10-17T23:00:00.000Z", donation_id: needsReviewCard.id, offer_id: null, type: "donation.created", actor: { role: "donor", id: null }, mode: {}, data: {} },
        { id: "00000000-0000-4000-8000-000000000502", at: "2026-10-17T23:05:00.000Z", donation_id: needsReviewCard.id, offer_id: null, type: "eligibility.evaluated", actor: { role: "system", id: null }, mode: {}, data: {} },
      ],
    };
    render(<DonationDetail card={withTimeline} onAction={noop} onHandoff={noop} />);
    for (const r of needsReviewCard.decision!.reasons) expect(screen.getByText(r.message)).toBeInTheDocument();
    const timeline = screen.getByRole("list", { name: /audit timeline/i });
    expect(within(timeline).getAllByRole("listitem")).toHaveLength(2);
  });

  it("offers only the operator actions for the status, and no dispatch control", () => {
    render(<DonationDetail card={needsReviewCard} onAction={noop} onHandoff={noop} />);
    expect(screen.getByRole("button", { name: /^reject/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /dispatch|approve|retry/i })).toBeNull();
  });

  it("shows a server action error verbatim", () => {
    render(<DonationDetail card={claimedCard} onAction={noop} onHandoff={noop} actionError="INVALID_TRANSITION: window closed" />);
    expect(screen.getByRole("alert")).toHaveTextContent("INVALID_TRANSITION: window closed");
  });
});

describe("HandoffControls (simulated)", () => {
  it("claimed: offers only 'Mark collected', clearly labeled as a simulation", () => {
    render(<HandoffControls card={cardFor("claimed")} onHandoff={vi.fn()} />);
    expect(screen.getByRole("button", { name: /mark collected \(simulated\)/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delivered/i })).toBeNull();
    expect(screen.getByText(/no real food moves/i)).toBeInTheDocument();
  });

  it("collected: offers only 'Mark delivered' (recipient accepted after inspection)", () => {
    render(<HandoffControls card={cardFor("collected")} onHandoff={vi.fn()} />);
    expect(screen.getByRole("button", { name: /mark delivered \(simulated\).*recipient accepted after inspection/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark collected/i })).toBeNull();
  });

  it.each(DONATION_STATUSES.filter((s) => s !== "claimed" && s !== "collected"))("%s: no handoff controls", (status) => {
    const { container } = render(<HandoffControls card={cardFor(status)} onHandoff={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("sends the step and shows the outcome", async () => {
    const onHandoff = vi.fn().mockResolvedValue({ ok: true, summary: "Done." });
    render(<HandoffControls card={cardFor("claimed")} onHandoff={onHandoff} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /mark collected/i }));
    });
    expect(onHandoff).toHaveBeenCalledWith("collected");
    expect(screen.getByRole("status")).toHaveTextContent("Done.");
  });

  it("shows a refused step with the server's code and message, verbatim", async () => {
    const onHandoff = vi
      .fn()
      .mockResolvedValue({ ok: false, error: "INVALID_TRANSITION: The effective cutoff has been reached." });
    render(<HandoffControls card={cardFor("claimed")} onHandoff={onHandoff} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /mark collected/i }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("INVALID_TRANSITION: The effective cutoff has been reached.");
  });

  it("cannot be double-submitted while a step is in flight", async () => {
    let release!: (v: { ok: true; summary: string }) => void;
    const onHandoff = vi.fn(() => new Promise<{ ok: true; summary: string }>((r) => (release = r)));
    render(<HandoffControls card={cardFor("claimed")} onHandoff={onHandoff} />);
    const btn = screen.getByRole("button", { name: /mark collected/i });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onHandoff).toHaveBeenCalledTimes(1);
    await act(async () => release({ ok: true, summary: "Done." }));
  });
});
