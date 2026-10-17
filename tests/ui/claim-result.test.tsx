// T-UI-05: each ClaimResultCode renders a distinct headline; only real claims use success styling.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CLAIM_RESULT_CODES, type ClaimResult, type ClaimResultCode } from "@/contracts";
import { ClaimResultView } from "@/components/phone/ClaimResultView";

afterEach(cleanup);

const make = (code: ClaimResultCode, extra: Partial<ClaimResult> = {}): ClaimResult => ({
  code,
  offer_id: null,
  donation_id: null,
  donation_status: null,
  assignment: null,
  message_for_actor: `server message for ${code}`,
  ...extra,
});

describe("T-UI-05 ClaimResultView", () => {
  it("renders a distinct headline for every code", () => {
    const seen = new Set<string>();
    for (const code of CLAIM_RESULT_CODES) {
      render(<ClaimResultView result={make(code)} />);
      const headline = screen.getByTestId("claim-headline").textContent ?? "";
      expect(headline.length).toBeGreaterThan(0);
      expect(seen.has(headline)).toBe(false);
      seen.add(headline);
      expect(screen.getByText(`server message for ${code}`)).toBeInTheDocument();
      cleanup();
    }
    expect(seen.size).toBe(CLAIM_RESULT_CODES.length);
  });

  it("uses success styling only for claimed / already_claimed_by_you", () => {
    for (const code of CLAIM_RESULT_CODES) {
      render(<ClaimResultView result={make(code)} />);
      const tone = screen.getByTestId("claim-result").getAttribute("data-tone");
      const isSuccess = code === "claimed" || code === "already_claimed_by_you";
      expect(tone === "success").toBe(isSuccess);
      cleanup();
    }
  });

  it("late claim: expired headline, no assignment or address", () => {
    render(<ClaimResultView result={make("offer_expired")} />);
    expect(screen.getByTestId("claim-headline")).toHaveTextContent("Expired — no assignment made");
    expect(screen.getByTestId("claim-result")).toHaveAttribute("data-tone", "warning");
    expect(screen.queryByTestId("claim-assignment")).toBeNull();
  });

  it("already_claimed is neutral, not success", () => {
    render(<ClaimResultView result={make("already_claimed")} />);
    expect(screen.getByTestId("claim-result")).toHaveAttribute("data-tone", "neutral");
  });
});
