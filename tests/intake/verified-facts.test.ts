import { describe, expect, it } from "vitest";
import { ALLERGENS, scene1_eligible_facts, scene1_vision_suggestion, type VerifiedFacts } from "@/contracts";
import { computeEditedFromAi, parseVerifiedFacts } from "@/features/intake/verified-facts";

const facts = (patch: Partial<VerifiedFacts> = {}): VerifiedFacts => ({ ...scene1_eligible_facts, ...patch });
const raw = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({ ...scene1_eligible_facts, ...patch });

function expectInvalid(input: unknown) {
  const r = parseVerifiedFacts(input);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.code).toBe("VALIDATION_FAILED");
}

describe("parseVerifiedFacts (T-IN-06)", () => {
  it("accepts the scene 1 facts unchanged", () => {
    const r = parseVerifiedFacts(raw());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual(scene1_eligible_facts);
  });

  it("accepts explicit `unknown` for allergens and handling answers", () => {
    const allergens = Object.fromEntries(ALLERGENS.map((a) => [a, "unknown"]));
    const r = parseVerifiedFacts(
      raw({ allergens, handling_mode: "unknown", preparation_type: "unknown", continuous_cold_holding: "unknown" }),
    );
    expect(r.ok).toBe(true);
  });

  it.each(ALLERGENS)("rejects facts missing the %s allergen key", (allergen) => {
    const allergens: Record<string, unknown> = { ...scene1_eligible_facts.allergens };
    delete allergens[allergen];
    expectInvalid(raw({ allergens }));
  });

  it.each(Object.keys(scene1_eligible_facts))("rejects facts missing required key %s", (key) => {
    const input = raw();
    delete input[key];
    expectInvalid(input);
  });

  it("rejects an extra top-level key", () => {
    expectInvalid(raw({ allergen_free: true }));
  });

  it("rejects an extra allergen key", () => {
    expectInvalid(raw({ allergens: { ...scene1_eligible_facts.allergens, gluten: "present" } }));
  });

  it("rejects an allergen value outside the enum", () => {
    expectInvalid(raw({ allergens: { ...scene1_eligible_facts.allergens, sesame: "none" } }));
  });

  it.each([null, undefined, "", 42, [], "facts"])("rejects non-object input %j", (input) => expectInvalid(input));

  it("rejects cross_contact_allergens unless cross_contact_status is declared", () => {
    expectInvalid(raw({ cross_contact_status: "unknown", cross_contact_allergens: ["peanuts"] }));
    expect(parseVerifiedFacts(raw({ cross_contact_status: "declared", cross_contact_allergens: ["peanuts"] })).ok).toBe(true);
  });

  it("rejects a missing or false attestation", () => {
    expectInvalid(raw({ attestation: { ...scene1_eligible_facts.attestation, attested: false } }));
    const input = raw();
    delete input.attestation;
    expectInvalid(input);
  });

  it("does not echo submitted values in the error", () => {
    const r = parseVerifiedFacts(raw({ ingredients_text: "secret-ingredient-xyz".repeat(100) }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(JSON.stringify(r.error)).not.toContain("secret-ingredient-xyz");
  });
});

describe("computeEditedFromAi (T-IN-07, CONTRACTS §3.2)", () => {
  const ai = scene1_vision_suggestion; // servings 18-30; dish "assorted deli sandwiches and wraps"; wheat, milk, eggs possible

  it("returns an empty list when there is no AI suggestion", () => {
    expect(computeEditedFromAi(null, facts())).toEqual([]);
  });

  it("lists servings, dish_name and allergens.wheat for the spec example", () => {
    const edited = computeEditedFromAi(
      ai,
      facts({
        dish_name: "Grandma's secret casserole",
        servings: 24,
        allergens: { ...scene1_eligible_facts.allergens, wheat: "not_in_listed_ingredients" },
      }),
    );
    expect(edited).toEqual(expect.arrayContaining(["servings", "dish_name", "allergens.wheat"]));
  });

  describe("dish_name", () => {
    it("is not listed when it matches a suggestion, ignoring case and surrounding whitespace", () => {
      const edited = computeEditedFromAi(ai, facts({ dish_name: "  Assorted Deli Sandwiches AND wraps " }));
      expect(edited).not.toContain("dish_name");
    });

    it("is listed when it only partly matches", () => {
      expect(computeEditedFromAi(ai, facts({ dish_name: "Assorted deli sandwiches" }))).toContain("dish_name");
    });

    it("is listed when the AI had no dish suggestions", () => {
      expect(computeEditedFromAi({ ...ai, dish_suggestions: [] }, facts())).toContain("dish_name");
    });
  });

  describe("servings", () => {
    it("is listed when the donor value differs from the AI range", () => {
      expect(computeEditedFromAi(ai, facts({ servings: 24 }))).toContain("servings");
    });

    it("is listed even when the donor value is the range minimum or maximum", () => {
      expect(computeEditedFromAi(ai, facts({ servings: 18 }))).toContain("servings");
      expect(computeEditedFromAi(ai, facts({ servings: 30 }))).toContain("servings");
    });

    it("is not listed only when min = max = servings", () => {
      const exact = { ...ai, estimated_servings: { min: 24, max: 24 } };
      expect(computeEditedFromAi(exact, facts({ servings: 24 }))).not.toContain("servings");
      expect(computeEditedFromAi(exact, facts({ servings: 25 }))).toContain("servings");
    });

    it("is not listed when the AI gave no estimate", () => {
      expect(computeEditedFromAi({ ...ai, estimated_servings: null }, facts())).not.toContain("servings");
    });
  });

  describe("allergens.<name>", () => {
    const declare = (allergen: (typeof ALLERGENS)[number], status: VerifiedFacts["allergens"][typeof allergen]) =>
      facts({ allergens: { ...scene1_eligible_facts.allergens, [allergen]: status } });

    it("is listed when the AI listed the allergen and the donor declared not_in_listed_ingredients", () => {
      expect(computeEditedFromAi(ai, declare("milk", "not_in_listed_ingredients"))).toContain("allergens.milk");
    });

    it.each(["present", "unknown"] as const)("is not listed when the donor declared %s", (status) => {
      expect(computeEditedFromAi(ai, declare("wheat", status))).not.toContain("allergens.wheat");
    });

    it("is not listed when the AI did not list that allergen", () => {
      expect(computeEditedFromAi(ai, declare("sesame", "not_in_listed_ingredients"))).not.toContain("allergens.sesame");
    });

    it("lists each allergen once, in contract order, even if the AI repeated it", () => {
      const repeated = {
        ...ai,
        possible_allergens: [
          { allergen: "wheat", basis: "bread" },
          { allergen: "milk", basis: "cheese" },
          { allergen: "wheat", basis: "tortilla" },
        ],
      } as typeof ai;
      const all = facts({
        allergens: { ...scene1_eligible_facts.allergens, milk: "not_in_listed_ingredients", wheat: "not_in_listed_ingredients" },
      });
      const edited = computeEditedFromAi(repeated, all).filter((f) => f.startsWith("allergens."));
      expect(edited).toEqual(["allergens.milk", "allergens.wheat"]);
    });
  });

  it("lists nothing when the donor facts match the AI exactly", () => {
    const exact = { ...ai, estimated_servings: { min: 24, max: 24 } };
    expect(computeEditedFromAi(exact, facts({ dish_name: "assorted deli sandwiches and wraps", servings: 24 }))).toEqual([]);
  });

  it("never lists fields outside the three contract rules", () => {
    const edited = computeEditedFromAi(ai, facts({ dish_name: "x", servings: 1, description: "changed", handling_mode: "unknown" }));
    expect(edited.every((f) => f === "dish_name" || f === "servings" || f.startsWith("allergens."))).toBe(true);
  });
});
