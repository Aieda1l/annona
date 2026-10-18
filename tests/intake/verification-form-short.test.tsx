// A shorter donor form (the captain's choice: shorten the form only, keep every gate rule):
// - the cold-holding and temperature-log questions are asked only while they can matter. The prototype policy offers
//   refrigerated food only (HANDLING_OUT_OF_SCOPE rejects the rest), so once the donor says the food is hot, room
//   temperature or frozen, those two questions are hidden, and what is submitted for them is `unknown`, never a stale
//   answer the donor can no longer see;
// - "cooked, then cooled" is still a choice and still goes to review at the gate (COOLING_HISTORY_REVIEW is untouched);
// - the time fields get "+1 h / +2 h / +4 h" buttons. Nothing is pre-selected: the donor has to click.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VerificationForm } from "@/features/intake/components";
import { evaluateEligibility } from "@/core/eligibility";
import { DEMO_POLICY, type DonorProfile } from "@/core/types";
import { parseVerifiedFacts } from "@/features/intake/verified-facts";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const COLD = /Held at 41/i;
const LOG = /temperature log/i;
const HANDLING = /How is this food being held right now/i;
const PREP = /How was it prepared/i;

const renderForm = () => {
  const onSubmit = vi.fn();
  render(<VerificationForm suggestion={null} onSubmit={onSubmit} />);
  return { onSubmit };
};

function fillRequiredAndSubmit() {
  fireEvent.change(screen.getByLabelText(/^Dish name/i), { target: { value: "Tray" } });
  fireEvent.change(screen.getByLabelText(/^Servings/i), { target: { value: "10" } });
  fireEvent.change(screen.getByLabelText(/Latest time you can hand/i), { target: { value: "2026-10-18T18:30" } });
  fireEvent.click(screen.getByLabelText(/no discard-by time/i));
  fireEvent.change(screen.getByLabelText(/Your name or role/i), { target: { value: "Lead" } });
  fireEvent.click(screen.getByLabelText(/I attest/i));
  fireEvent.click(screen.getByRole("button", { name: /submit for review/i }));
}

describe("the cold-holding and temperature-log questions", () => {
  it("are shown before the donor has said how the food is held, and for refrigerated food", () => {
    renderForm();
    expect(screen.getByLabelText(COLD)).toBeInTheDocument();
    expect(screen.getByLabelText(LOG)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(HANDLING), { target: { value: "refrigerated" } });
    expect(screen.getByLabelText(COLD)).toBeInTheDocument();
    expect(screen.getByLabelText(LOG)).toBeInTheDocument();
  });

  it.each(["hot_held", "ambient", "frozen"])("are hidden when the food is %s, with a plain note why", (mode) => {
    renderForm();
    fireEvent.change(screen.getByLabelText(HANDLING), { target: { value: mode } });
    expect(screen.queryByLabelText(COLD)).toBeNull();
    expect(screen.queryByLabelText(LOG)).toBeNull();
    expect(screen.getByTestId("cold-questions-skipped")).toHaveTextContent(/only offers refrigerated food/i);
  });

  it("come back, with their old answers, if the donor switches back to refrigerated", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(COLD), { target: { value: "yes" } });
    fireEvent.change(screen.getByLabelText(HANDLING), { target: { value: "ambient" } });
    fireEvent.change(screen.getByLabelText(HANDLING), { target: { value: "refrigerated" } });
    expect(screen.getByLabelText(COLD)).toHaveValue("yes");
  });

  it("submit as unknown while hidden, never a stale answer the donor can no longer see", () => {
    const { onSubmit } = renderForm();
    fireEvent.change(screen.getByLabelText(COLD), { target: { value: "yes" } });
    fireEvent.change(screen.getByLabelText(LOG), { target: { value: "yes" } });
    fireEvent.change(screen.getByLabelText(HANDLING), { target: { value: "ambient" } });
    fillRequiredAndSubmit();
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ handling_mode: "ambient", continuous_cold_holding: "unknown", temperature_log_available: "unknown" });
  });

  it("are submitted as the donor answered them while the food is refrigerated", () => {
    const { onSubmit } = renderForm();
    fireEvent.change(screen.getByLabelText(HANDLING), { target: { value: "refrigerated" } });
    fireEvent.change(screen.getByLabelText(COLD), { target: { value: "yes" } });
    fireEvent.change(screen.getByLabelText(LOG), { target: { value: "no" } });
    fillRequiredAndSubmit();
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ continuous_cold_holding: "yes", temperature_log_available: "no" });
  });
});

describe("cooked, then cooled is not weakened", () => {
  it("is still an option, and facts that choose it still go to review on the real gate", () => {
    const { onSubmit } = renderForm();
    expect(screen.getByLabelText(PREP)).toContainHTML("cooked_then_cooled");
    fireEvent.change(screen.getByLabelText(HANDLING), { target: { value: "refrigerated" } });
    fireEvent.change(screen.getByLabelText(PREP), { target: { value: "cooked_then_cooled" } });
    fireEvent.change(screen.getByLabelText(COLD), { target: { value: "yes" } });
    fireEvent.change(screen.getByLabelText(LOG), { target: { value: "yes" } });
    fillRequiredAndSubmit();
    const parsed = parseVerifiedFacts(onSubmit.mock.calls[0]![0]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const donor: DonorProfile = {
      id: "00000000-0000-4000-8000-000000000011",
      display_name: "Donor",
      org_type: "caterer",
      licensed_food_establishment: true,
      approval_status: "approved",
      location: { lat: 47.6, lng: -122.3, area_label: "Area" },
    } as DonorProfile;
    const decision = evaluateEligibility({ facts: parsed.data, donor, policy: DEMO_POLICY, now: new Date("2026-10-18T12:00:00Z") });
    expect(decision.outcome).not.toBe("eligible");
    expect(decision.reasons.map((r) => r.code)).toContain("COOLING_HISTORY_REVIEW");
  });
});

describe("time shortcuts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 18, 10, 0, 0)); // 10:00 local
  });

  it("start empty: nothing is pre-selected", () => {
    renderForm();
    expect(screen.getByLabelText(/Latest time you can hand/i)).toHaveValue("");
    expect(screen.getByLabelText(/^Discard-by time from/i)).toHaveValue("");
  });

  it("'+2 h' next to the pickup time sets two hours from now, and the donor can still edit it", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /pickup.*\+2 h/i }));
    expect(screen.getByLabelText(/Latest time you can hand/i)).toHaveValue("2026-10-18T12:00");
    fireEvent.change(screen.getByLabelText(/Latest time you can hand/i), { target: { value: "2026-10-18T12:45" } });
    expect(screen.getByLabelText(/Latest time you can hand/i)).toHaveValue("2026-10-18T12:45");
  });

  it("the discard-by shortcuts set the discard-by time and are off while 'no discard-by time' is ticked", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /discard.*\+4 h/i }));
    expect(screen.getByLabelText(/^Discard-by time from/i)).toHaveValue("2026-10-18T14:00");
    fireEvent.click(screen.getByLabelText(/no discard-by time/i));
    expect(screen.getByRole("button", { name: /discard.*\+1 h/i })).toBeDisabled();
  });
});
