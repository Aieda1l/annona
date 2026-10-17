// AI never reads as verified: AI "possible" allergens sit next to donor status; unlisted ones are never "absent".
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ALLERGENS, needsReviewCard, type Allergen, type DonorAllergenStatus } from "@/contracts";
import { AllergenGrid } from "@/components/dashboard/AllergenGrid";

afterEach(cleanup);

const allUnknown = Object.fromEntries(ALLERGENS.map((a) => [a, "unknown"])) as Record<Allergen, DonorAllergenStatus>;

describe("AllergenGrid", () => {
  it("shows all nine allergens; AI-possible ones are labeled, the rest are unknown", () => {
    render(<AllergenGrid suggestion={needsReviewCard.ai_suggestion} allergens={allUnknown} />);
    for (const a of ALLERGENS) expect(screen.getByTestId(`allergen-${a}`)).toBeInTheDocument();
    for (const a of ["wheat", "milk"] as const) {
      expect(screen.getByTestId(`allergen-${a}`)).toHaveTextContent("AI: possible");
      expect(screen.getByTestId(`allergen-${a}`)).toHaveAttribute("data-donor-status", "unknown");
    }
    for (const a of ALLERGENS.filter((x) => x !== "wheat" && x !== "milk")) {
      const row = screen.getByTestId(`allergen-${a}`);
      expect(row).not.toHaveTextContent("AI: possible");
      expect(row).toHaveTextContent(/unknown/i);
    }
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\b(none|absent|free|safe)\b/i);
  });

  it("with no donor facts yet, every allergen is unknown, never absent", () => {
    render(<AllergenGrid suggestion={null} allergens={null} />);
    for (const a of ALLERGENS) expect(screen.getByTestId(`allergen-${a}`)).toHaveAttribute("data-donor-status", "unknown");
  });

  it("donor 'not in listed ingredients' is worded as a donor statement", () => {
    render(<AllergenGrid suggestion={null} allergens={{ ...allUnknown, peanuts: "not_in_listed_ingredients" }} />);
    expect(screen.getByTestId("allergen-peanuts")).toHaveTextContent(/donor: not in listed ingredients/i);
  });
});
