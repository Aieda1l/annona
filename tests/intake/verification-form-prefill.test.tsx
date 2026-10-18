// D-042 (captain decision, 2026-10-18): the donor form starts from the AI draft to save the donor typing, within limits.
// FILLED from the draft, each tagged and freely editable: dish name, servings (the LOWER bound of the estimate),
// the ingredients text (the visible components), and the allergens the AI flagged as possible, pre-selected as
// "Present" (the cautious direction). NEVER filled: any "not in my listed ingredients" (the AI not mentioning an
// allergen is not evidence of absence), cross-contact, handling, preparation, excluded category, temperatures and
// holding, previously served, containers, discard-by, pickup-by, the attestation. The ingredients fill needs an
// explicit "I checked this list" tick, because the donor's allergen answers are relative to that list.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ALLERGENS, scene1_vision_suggestion } from "@/contracts";
import { VerificationForm } from "@/features/intake/components";
import { parseVerifiedFacts } from "@/features/intake/verified-facts";

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
// scene1_vision_suggestion flags wheat, milk and eggs; it does not mention the other six.
const FLAGGED = ["wheat", "milk", "eggs"] as const;
const NOT_FLAGGED = ALLERGENS.filter((a) => !(FLAGGED as readonly string[]).includes(a));

const OTHER_SELECTS = [
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
  const utils = render(<VerificationForm suggestion={scene1_vision_suggestion} onSubmit={onSubmit} {...props} />);
  return { onSubmit, ...utils };
};

const checkedValue = (allergen: (typeof ALLERGENS)[number]) =>
  within(screen.getByRole("group", { name: NAMES[allergen] })).getByRole("radio", { checked: true }).getAttribute("value");

function fillTheDonorsOwnFacts() {
  fireEvent.change(screen.getByLabelText(/Latest time you can hand/i), { target: { value: "2026-10-18T18:30" } });
  fireEvent.click(screen.getByLabelText(/no discard-by time/i));
  fireEvent.change(screen.getByLabelText(/Your name or role/i), { target: { value: "Catering lead" } });
  fireEvent.click(screen.getByLabelText(/I attest/i));
}

describe("what the AI draft fills", () => {
  it("fills the dish name, the lower bound of the servings and the ingredients, each tagged as from the AI draft", () => {
    renderForm();
    expect(screen.getByLabelText(/^Dish name/i)).toHaveValue("assorted deli sandwiches and wraps");
    expect(screen.getByLabelText(/^Servings/i)).toHaveValue(18); // the estimate was 18 to 30
    expect(screen.getByLabelText(/^Ingredients/i)).toHaveValue("sliced bread sandwiches, tortilla wraps, lettuce, sliced cheese");
    for (const field of ["dish_name", "servings", "ingredients_text"]) {
      expect(screen.getByTestId(`ai-filled-${field}`)).toHaveTextContent(/from the AI draft/i);
    }
  });

  it("pre-selects only the allergens the AI flagged, as Present, with a tag; the other six stay 'I don't know'", () => {
    renderForm();
    for (const a of FLAGGED) {
      expect(checkedValue(a)).toBe("present");
      expect(screen.getByTestId(`ai-filled-allergen-${a}`)).toHaveTextContent(/pre-selected.*AI draft/i);
    }
    for (const a of NOT_FLAGGED) {
      expect(checkedValue(a)).toBe("unknown");
      expect(screen.queryByTestId(`ai-filled-allergen-${a}`)).toBeNull();
    }
  });

  it("never selects 'Not in my listed ingredients' for any allergen", () => {
    renderForm();
    for (const a of ALLERGENS) expect(checkedValue(a)).not.toBe("not_in_listed_ingredients");
  });

  it("leaves every other safety fact at its default: handling, preparation, excluded category, temperatures, served, containers, cross-contact", () => {
    renderForm();
    for (const label of OTHER_SELECTS) expect(screen.getByLabelText(label)).toHaveValue("unknown");
    expect(screen.getByLabelText(/Latest time you can hand/i)).toHaveValue("");
    expect(screen.getByLabelText(/^Discard-by time from/i)).toHaveValue("");
    expect(screen.getByLabelText(/I attest/i)).not.toBeChecked();
    expect(screen.getByLabelText(/Your name or role/i)).toHaveValue("");
    for (const a of ALLERGENS) expect(screen.getByLabelText(`${NAMES[a]} cross-contact`)).not.toBeChecked();
  });

  it("with no suggestion nothing is filled and no tag is shown", () => {
    const { container } = renderForm({ suggestion: null });
    expect(screen.getByLabelText(/^Dish name/i)).toHaveValue("");
    expect(screen.getByLabelText(/^Servings/i)).toHaveValue(null);
    expect(screen.getByLabelText(/^Ingredients/i)).toHaveValue("");
    for (const a of ALLERGENS) expect(checkedValue(a)).toBe("unknown");
    expect(container.querySelector('[data-testid^="ai-filled-"]')).toBeNull();
  });

  it("the AI hints are still shown beside the fields", () => {
    renderForm();
    expect(screen.getByTestId("ai-hint-servings")).toHaveTextContent(/AI estimate.*unverified.*18.*30/i);
    expect(screen.getByTestId("ai-hint-allergen-wheat")).toHaveTextContent(/AI.*possible/i);
  });

  it("claims nothing about food safety", () => {
    const { container } = renderForm();
    expect(container.textContent ?? "").not.toMatch(FORBIDDEN);
  });
});

describe("the donor stays in control", () => {
  it("editing a filled field removes its tag and the donor's text wins", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/^Dish name/i), { target: { value: "Club sandwich tray" } });
    expect(screen.getByLabelText(/^Dish name/i)).toHaveValue("Club sandwich tray");
    expect(screen.queryByTestId("ai-filled-dish_name")).toBeNull();
    fireEvent.change(screen.getByLabelText(/^Servings/i), { target: { value: "24" } });
    expect(screen.queryByTestId("ai-filled-servings")).toBeNull();
  });

  it("changing a pre-selected allergen removes its tag", () => {
    renderForm();
    const group = screen.getByRole("group", { name: NAMES.wheat });
    fireEvent.click(within(group).getByRole("radio", { name: /not in my listed ingredients/i })); // the donor's own statement
    expect(checkedValue("wheat")).toBe("not_in_listed_ingredients");
    expect(screen.queryByTestId("ai-filled-allergen-wheat")).toBeNull();
  });

  it("a suggestion that arrives after the donor started typing fills only the fields the donor has not touched", () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<VerificationForm suggestion={null} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/^Dish name/i), { target: { value: "My own dish name" } });
    fireEvent.click(within(screen.getByRole("group", { name: NAMES.milk })).getByRole("radio", { name: /i don't know/i }));
    rerender(<VerificationForm suggestion={scene1_vision_suggestion} onSubmit={onSubmit} />);
    expect(screen.getByLabelText(/^Dish name/i)).toHaveValue("My own dish name"); // not overwritten
    expect(screen.getByLabelText(/^Servings/i)).toHaveValue(18); // untouched, so filled
    expect(checkedValue("wheat")).toBe("present"); // untouched, so pre-selected
  });
});

describe("follow-ups from Dev 1's review of #77", () => {
  it("a tick given to the AI's list does not carry over after the donor edits the list and retypes the AI's text", () => {
    const { onSubmit } = renderForm();
    fillTheDonorsOwnFacts();
    const aiList = "sliced bread sandwiches, tortilla wraps, lettuce, sliced cheese";
    fireEvent.click(screen.getByLabelText(/checked this ingredient list/i)); // ticked for the AI's list
    fireEvent.change(screen.getByLabelText(/^Ingredients/i), { target: { value: "something else entirely" } });
    fireEvent.change(screen.getByLabelText(/^Ingredients/i), { target: { value: aiList } }); // back to the AI's exact text
    fireEvent.click(screen.getByRole("button", { name: /submit for review/i }));
    expect(onSubmit).not.toHaveBeenCalled(); // the old tick no longer counts
    expect(screen.getByLabelText(/checked this ingredient list/i)).not.toBeChecked();
  });

  it("a fresh suggestion object with the same content does not re-fill a field the donor cleared", () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<VerificationForm suggestion={scene1_vision_suggestion} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/^Dish name/i), { target: { value: "" } }); // the donor clears it on purpose
    rerender(<VerificationForm suggestion={structuredClone(scene1_vision_suggestion)} onSubmit={onSubmit} />);
    expect(screen.getByLabelText(/^Dish name/i)).toHaveValue("");
  });

  it("a genuinely different suggestion still fills the fields the donor has not touched", () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<VerificationForm suggestion={null} onSubmit={onSubmit} />);
    rerender(<VerificationForm suggestion={{ ...scene1_vision_suggestion, dish_suggestions: [{ name: "pasta tray", confidence: "high" }] }} onSubmit={onSubmit} />);
    expect(screen.getByLabelText(/^Dish name/i)).toHaveValue("pasta tray");
  });
});

describe("the ingredients fill needs an explicit check", () => {
  it("blocks submit with a plain message until the donor ticks that they checked the list", () => {
    const { onSubmit } = renderForm();
    fillTheDonorsOwnFacts();
    fireEvent.click(screen.getByRole("button", { name: /submit for review/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/checked the ingredient list/i);

    fireEvent.click(screen.getByLabelText(/checked this ingredient list/i));
    fireEvent.click(screen.getByRole("button", { name: /submit for review/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("is not needed once the donor has edited the ingredients themselves", () => {
    const { onSubmit } = renderForm();
    fireEvent.change(screen.getByLabelText(/^Ingredients/i), { target: { value: "bread, ham, cheddar, butter, mustard" } });
    expect(screen.queryByLabelText(/checked this ingredient list/i)).toBeNull();
    fillTheDonorsOwnFacts();
    fireEvent.click(screen.getByRole("button", { name: /submit for review/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("submits exactly what is in the fields, and the payload parses as the donor's facts", () => {
    const { onSubmit } = renderForm();
    fillTheDonorsOwnFacts();
    fireEvent.click(screen.getByLabelText(/checked this ingredient list/i));
    fireEvent.click(screen.getByRole("button", { name: /submit for review/i }));
    const raw = onSubmit.mock.calls[0]![0] as Record<string, unknown>;
    expect(raw).toMatchObject({
      dish_name: "assorted deli sandwiches and wraps",
      servings: 18,
      ingredients_text: "sliced bread sandwiches, tortilla wraps, lettuce, sliced cheese",
      cross_contact_status: "unknown",
      handling_mode: "unknown",
      preparation_type: "unknown",
      continuous_cold_holding: "unknown",
      temperature_log_available: "unknown",
    });
    const allergens = raw.allergens as Record<string, string>;
    for (const a of FLAGGED) expect(allergens[a]).toBe("present");
    for (const a of NOT_FLAGGED) expect(allergens[a]).toBe("unknown");
    expect(Object.values(allergens)).not.toContain("not_in_listed_ingredients");
    expect(parseVerifiedFacts(raw).ok).toBe(true);
  });
});
