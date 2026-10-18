import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ALLERGENS, scene1_vision_suggestion } from "@/contracts";
import { VerificationForm } from "@/features/intake/components";
import { evaluateEligibility } from "@/core/eligibility";
import { DEMO_POLICY, type DonorProfile } from "@/core/types";
import { parseVerifiedFacts } from "@/features/intake/verified-facts";

// T-IN-12: the form never pre-fills a fact from the AI suggestion; unknown is the default everywhere.
afterEach(cleanup);

const FORBIDDEN = /\b(safe|safely|safety-approved|allergen[- ]free|certified|compliant|compliance)\b/i;
const NAMES: Record<(typeof ALLERGENS)[number], string> = {
  milk: "Milk",
  eggs: "Eggs",
  fish: "Fish",
  crustacean_shellfish: "Crustacean shellfish",
  tree_nuts: "Tree nuts",
  peanuts: "Peanuts",
  wheat: "Wheat",
  soybeans: "Soybeans",
  sesame: "Sesame",
};
const UNKNOWN_SELECTS = [
  /How is this food being held right now/i,
  /How was it prepared/i,
  /raw\/unpasteurized milk/i,
  /Held at 41/i,
  /temperature log/i,
  /served to or handled by customers/i,
  /covered, food-grade containers/i,
  /^Cross-contact status/i,
];

const renderForm = (props: Partial<React.ComponentProps<typeof VerificationForm>> = {}) => {
  const onSubmit = vi.fn();
  // These tests cover the empty form; what the AI draft fills (D-042) is covered in verification-form-prefill.test.tsx.
  const utils = render(<VerificationForm suggestion={null} onSubmit={onSubmit} {...props} />);
  return { onSubmit, ...utils };
};

function fillRequired() {
  fireEvent.change(screen.getByLabelText(/^Dish name/i), { target: { value: "Sandwich tray" } });
  fireEvent.change(screen.getByLabelText(/^Servings/i), { target: { value: "24" } });
  fireEvent.change(screen.getByLabelText(/Latest time you can hand/i), { target: { value: "2026-10-17T18:30" } });
  fireEvent.click(screen.getByLabelText(/no discard-by time/i));
  fireEvent.change(screen.getByLabelText(/Your name or role/i), { target: { value: "Catering lead" } });
  fireEvent.click(screen.getByLabelText(/I attest/i));
}

describe("defaults (T-IN-12)", () => {
  it.each(ALLERGENS)("%s starts as unknown", (allergen) => {
    renderForm();
    const group = screen.getByRole("group", { name: NAMES[allergen] });
    expect(within(group).getByRole("radio", { checked: true })).toHaveAttribute("value", "unknown");
  });

  it.each(UNKNOWN_SELECTS)("%s starts as unknown", (label) => {
    renderForm();
    expect(screen.getByLabelText(label)).toHaveValue("unknown");
  });

  it("servings, ingredients, dish name and description start empty despite the AI suggestion", () => {
    renderForm();
    for (const label of [/^Dish name/i, /^Servings/i, /^Ingredients/i, /^Description/i]) {
      expect(screen.getByLabelText(label)).toHaveValue(label.source.includes("Servings") ? null : "");
    }
  });

  it("shows the AI guesses as unverified hints beside the fields (what it also fills is in verification-form-prefill.test.tsx)", () => {
    renderForm({ suggestion: scene1_vision_suggestion });
    expect(screen.getByTestId("ai-hint-servings")).toHaveTextContent(/AI estimate.*unverified.*18.*30/i);
    expect(screen.getByTestId("ai-hint-dish_name")).toHaveTextContent(/assorted deli sandwiches and wraps/i);
    expect(screen.getByTestId("ai-hint-allergen-wheat")).toHaveTextContent(/AI.*possible/i);
    expect(screen.queryByTestId("ai-hint-allergen-sesame")).toBeNull();
  });

  it("renders no forbidden wording, with or without a suggestion", () => {
    const withAi = renderForm();
    expect(withAi.container.textContent ?? "").not.toMatch(FORBIDDEN);
    cleanup();
    const noAi = renderForm({ suggestion: null });
    expect(noAi.container.textContent ?? "").not.toMatch(FORBIDDEN);
    expect(screen.queryByTestId("ai-hint-servings")).toBeNull();
  });
});

describe("submitting", () => {
  it("shows an error and re-enables submit when onSubmit rejects", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("boom"));
    render(<VerificationForm suggestion={null} onSubmit={onSubmit} />);
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: /submit for review/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be submitted/i);
    expect(screen.getByRole("button", { name: /submit for review/i })).toBeEnabled();
  });

  it("with only the required fields filled, everything else is submitted as unknown", () => {
    const { onSubmit } = renderForm();
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: /submit for review/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const raw = onSubmit.mock.calls[0]![0] as Record<string, unknown>;
    expect(raw).toMatchObject({
      dish_name: "Sandwich tray",
      servings: 24,
      ingredients_text: "",
      cross_contact_status: "unknown",
      cross_contact_allergens: [],
      handling_mode: "unknown",
      preparation_type: "unknown",
      contains_excluded_category: "unknown",
      continuous_cold_holding: "unknown",
      temperature_log_available: "unknown",
      previously_served: "unknown",
      covered_food_grade_containers: "unknown",
      discard_by: null,
      donor_pickup_by: new Date("2026-10-17T18:30").toISOString(),
      attestation: { attested: true, attested_by_label: "Catering lead" },
    });
    expect(Object.values(raw.allergens as object).every((s) => s === "unknown")).toBe(true);
    expect(parseVerifiedFacts(raw).ok).toBe(true);
  });

  it("T-IN-12: facts submitted with only the required fields evaluate to needs_review on the real gate", () => {
    const { onSubmit } = renderForm();
    fireEvent.change(screen.getByLabelText(/^Dish name/i), { target: { value: "Sandwich tray" } });
    fireEvent.change(screen.getByLabelText(/^Servings/i), { target: { value: "24" } });
    fireEvent.change(screen.getByLabelText(/Latest time you can hand/i), { target: { value: "2026-10-18T10:00" } });
    fireEvent.click(screen.getByLabelText(/no discard-by time/i));
    fireEvent.change(screen.getByLabelText(/Your name or role/i), { target: { value: "Catering lead" } });
    fireEvent.click(screen.getByLabelText(/I attest/i));
    fireEvent.click(screen.getByRole("button", { name: /submit for review/i }));
    const parsed = parseVerifiedFacts(onSubmit.mock.calls[0]![0]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const donor: DonorProfile = {
      id: "00000000-0000-4000-8000-000000000011",
      display_name: "Rainier Catering (synthetic)",
      org_type: "caterer",
      licensed_food_establishment: true,
      approval_status: "approved",
      location: { lat: 47.6, lng: -122.3, area_label: "Capitol Hill", address_line: "1 Synthetic Way" },
      is_synthetic: true,
    };
    const decision = evaluateEligibility({ facts: parsed.data, donor, policy: DEMO_POLICY, now: new Date("2026-10-17T23:10:00.000Z") });
    expect(decision.outcome).toBe("needs_review");
    expect(decision.reasons.filter((r) => r.code === "ALLERGEN_UNKNOWN")).toHaveLength(ALLERGENS.length);
    expect(decision.reasons.some((r) => r.code === "HANDLING_UNKNOWN")).toBe(true);
  });

  it("the AI draft changes what is submitted only through the fields it filled: once the donor sets those back, the payload is identical", () => {
    const strip = (r: unknown) => ({ ...(r as object), attestation: undefined });
    const a = renderForm({ suggestion: scene1_vision_suggestion });
    fillRequired(); // dish name and servings typed over the AI's
    fireEvent.change(screen.getByLabelText(/^Ingredients/i), { target: { value: "" } }); // the donor clears the filled list
    for (const name of ["Milk", "Wheat", "Eggs"]) {
      fireEvent.click(within(screen.getByRole("group", { name })).getByRole("radio", { name: /i don't know/i })); // and the pre-selected allergens
    }
    fireEvent.click(screen.getByRole("button", { name: /submit for review/i }));
    const withAi = strip(a.onSubmit.mock.calls[0]![0]);
    cleanup();
    const b = renderForm({ suggestion: null });
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: /submit for review/i }));
    expect(strip(b.onSubmit.mock.calls[0]![0])).toEqual(withAi);
  });

  it("sends donor-chosen allergen answers, a discard-by time and cross-contact allergens", () => {
    const { onSubmit } = renderForm();
    fillRequired();
    fireEvent.click(within(screen.getByRole("group", { name: "Milk" })).getByRole("radio", { name: /^Present/i }));
    fireEvent.click(within(screen.getByRole("group", { name: "Wheat" })).getByRole("radio", { name: /my listed ingredients/i }));
    fireEvent.click(screen.getByLabelText(/no discard-by time/i)); // untick
    fireEvent.change(screen.getByLabelText(/^Discard-by time/i), { target: { value: "2026-10-18T05:00" } });
    fireEvent.change(screen.getByLabelText(/^Cross-contact status/i), { target: { value: "declared" } });
    fireEvent.click(screen.getByLabelText("Peanuts cross-contact"));
    fireEvent.click(screen.getByRole("button", { name: /submit for review/i }));
    const raw = onSubmit.mock.calls[0]![0] as { allergens: Record<string, string>; discard_by: string; cross_contact_allergens: string[] };
    expect(raw.allergens).toMatchObject({ milk: "present", wheat: "not_in_listed_ingredients", sesame: "unknown" });
    expect(raw.discard_by).toBe(new Date("2026-10-18T05:00").toISOString());
    expect(raw.cross_contact_allergens).toEqual(["peanuts"]);
    expect(parseVerifiedFacts(raw).ok).toBe(true);
  });

  it("cross-contact allergens are disabled until declared and cleared when set back to unknown", () => {
    const { onSubmit } = renderForm();
    fillRequired();
    const peanuts = screen.getByLabelText("Peanuts cross-contact");
    expect(peanuts).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/^Cross-contact status/i), { target: { value: "declared" } });
    fireEvent.click(peanuts);
    fireEvent.change(screen.getByLabelText(/^Cross-contact status/i), { target: { value: "unknown" } });
    fireEvent.click(screen.getByRole("button", { name: /submit for review/i }));
    const raw = onSubmit.mock.calls[0]![0] as { cross_contact_allergens: string[] };
    expect(raw.cross_contact_allergens).toEqual([]);
    expect(parseVerifiedFacts(raw).ok).toBe(true);
  });
});

describe("required fields and states", () => {
  it("blocks submit and lists what is missing", () => {
    const { onSubmit } = renderForm();
    fireEvent.click(screen.getByRole("button", { name: /submit for review/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    for (const m of [/dish name/i, /servings/i, /hand the food over/i, /discard-by/i, /your name or role/i, /attest/i]) {
      expect(alert).toHaveTextContent(m);
    }
  });

  it.each(["2.5", "0", "501", "-3", "1e2", "0x10"])("rejects servings %s", (value) => {
    const { onSubmit } = renderForm();
    fillRequired();
    fireEvent.change(screen.getByLabelText(/^Servings/i), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: /submit for review/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/servings/i);
  });

  it("requires the attestation checkbox", () => {
    const { onSubmit } = renderForm();
    fillRequired();
    fireEvent.click(screen.getByLabelText(/I attest/i)); // untick
    fireEvent.click(screen.getByRole("button", { name: /submit for review/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("disables the button while submitting and shows a server error", () => {
    renderForm({ submitting: true, error: "Something went wrong. Please try again." });
    expect(screen.getByRole("button", { name: /submitting/i })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/something went wrong/i);
  });
});

describe("accessibility", () => {
  it("groups the cross-contact checkboxes in a labelled fieldset", () => {
    renderForm();
    const group = screen.getByRole("group", { name: /allergens that may have touched this food/i });
    expect(within(group).getAllByRole("checkbox")).toHaveLength(ALLERGENS.length);
  });

  it.each([/^Dish name/i, /^Servings/i, /Latest time you can hand/i, /Your name or role/i])("marks %s as required", (label) => {
    renderForm();
    expect(screen.getByLabelText(label)).toHaveAttribute("aria-required", "true");
  });

  it("moves focus to the error list when submit fails validation", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /submit for review/i }));
    expect(screen.getByRole("alert")).toHaveFocus();
  });

  it("renders duplicate messages without a React key collision", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      renderForm({ error: "Dish name is required." });
      fireEvent.click(screen.getByRole("button", { name: /submit for review/i }));
      expect(screen.getAllByText("Dish name is required.")).toHaveLength(2);
      expect(spy.mock.calls.flat().join(" ")).not.toMatch(/same key|unique "key"/i);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("an AI suggestion with no possible allergens", () => {
  it("leaves every allergen unset (unknown): silence from the AI is not an absence", () => {
    renderForm({ suggestion: { ...scene1_vision_suggestion, possible_allergens: [] } });
    for (const allergen of ALLERGENS) {
      const group = screen.getByRole("group", { name: NAMES[allergen] });
      expect(within(group).getByRole("radio", { checked: true })).toHaveAttribute("value", "unknown");
      expect(within(group).queryByTestId(`ai-hint-allergen-${allergen}`)).toBeNull();
    }
  });
});
