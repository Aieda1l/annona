// T-UI-03: operator controls per status. The UI only offers controls; the server decides and enforces.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { claimedCard, eligibleCard, needsReviewCard, type DonationCard } from "@/contracts";
import { OperatorActions } from "@/components/dashboard/OperatorActions";

afterEach(cleanup);

const withStatus = (c: DonationCard, status: DonationCard["status"]): DonationCard => ({ ...c, status });
const actionNames = () =>
  screen.queryAllByRole("button").map((b) => b.getAttribute("data-action") ?? b.textContent);

describe("T-UI-03 OperatorActions", () => {
  it("needs_review: only reject / return_to_donor / cancel; no dispatch or approve", () => {
    render(<OperatorActions card={needsReviewCard} onAction={vi.fn()} />);
    expect(actionNames().sort()).toEqual(["cancel", "reject", "return_to_donor"]);
    expect(screen.queryByText(/dispatch|approve|retry/i)).toBeNull();
  });

  it("needs_review after pickup (COURIER_OPTED_OUT_AFTER_PICKUP): only cancel / reject", () => {
    const card: DonationCard = {
      ...needsReviewCard,
      handoff: { ...needsReviewCard.handoff, collected_at: "2026-10-17T23:30:00.000Z" },
      decision: {
        ...needsReviewCard.decision!,
        reasons: [
          {
            code: "COURIER_OPTED_OUT_AFTER_PICKUP",
            severity: "review",
            message: "The courier opted out after pickup. An operator must decide.",
          },
        ],
      },
    };
    render(<OperatorActions card={card} onAction={vi.fn()} />);
    expect(actionNames().sort()).toEqual(["cancel", "reject"]);
  });

  it("rejected: no controls at all", () => {
    render(<OperatorActions card={withStatus(needsReviewCard, "rejected")} onAction={vi.fn()} />);
    expect(actionNames()).toEqual([]);
  });

  it("unmatched: only retry_matching and cancel, neutral", () => {
    render(<OperatorActions card={withStatus(eligibleCard, "unmatched")} onAction={vi.fn()} />);
    expect(actionNames().sort()).toEqual(["cancel", "retry_matching"]);
    expect(screen.getByTestId("operator-actions")).toHaveAttribute("data-tone", "neutral");
  });

  it("retry_matching appears only on unmatched cards", () => {
    for (const s of ["draft", "needs_review", "eligible", "offered", "claimed", "collected"] as const) {
      render(<OperatorActions card={withStatus(eligibleCard, s)} onAction={vi.fn()} />);
      expect(actionNames()).not.toContain("retry_matching");
      cleanup();
    }
  });

  it("reject requires a note before it can be sent", () => {
    const onAction = vi.fn();
    render(<OperatorActions card={needsReviewCard} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: /reject/i }));
    const confirm = screen.getByRole("button", { name: /confirm reject/i });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/note/i), { target: { value: "Cooling log not credible" } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(onAction).toHaveBeenCalledWith("reject", "Cooling log not credible");
  });

  it("cancel needs a note for claimed, none for eligible", () => {
    const onAction = vi.fn();
    render(<OperatorActions card={claimedCard} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: /^cancel/i }));
    expect(screen.getByRole("button", { name: /confirm cancel/i })).toBeDisabled();
    cleanup();

    render(<OperatorActions card={eligibleCard} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: /^cancel/i }));
    expect(screen.getByRole("button", { name: /confirm cancel/i })).toBeEnabled();
  });

  it("renders a server refusal verbatim", () => {
    render(<OperatorActions card={eligibleCard} onAction={vi.fn()} error="INVALID_TRANSITION: window closed" />);
    expect(screen.getByRole("alert")).toHaveTextContent("INVALID_TRANSITION: window closed");
  });

  it("a rejected onAction shows its message and keeps the confirm panel open", async () => {
    const onAction = vi.fn().mockRejectedValue(new Error("INVALID_TRANSITION: window closed"));
    render(<OperatorActions card={eligibleCard} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: /^cancel/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm cancel/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("INVALID_TRANSITION: window closed");
    expect(screen.getByRole("button", { name: /confirm cancel/i })).toBeInTheDocument();
  });
});
