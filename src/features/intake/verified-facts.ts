import { ALLERGENS, VerifiedFacts, err, ok, type Result, type VisionSuggestion } from "@/contracts";

// Donor-submitted facts are the only source of verified ingredients and handling (AI describes, humans verify).
// `attestation.attested_at` is accepted as sent and never trusted: core overwrites it server-side.

/**
 * Strict parse with the contract schema. Missing keys (including any of the nine allergens), unknown keys
 * and invalid enums fail with VALIDATION_FAILED; explicit `unknown` is accepted. Errors name field paths
 * only, never submitted values.
 */
export function parseVerifiedFacts(raw: unknown): Result<VerifiedFacts> {
  const parsed = VerifiedFacts.safeParse(raw);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((i) => i.path.join(".") || "(root)"))];
    return err("VALIDATION_FAILED", "Verified facts failed validation", { details: { fields } });
  }
  return ok(parsed.data);
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * CONTRACTS §3.2 `edited_from_ai`: where the donor's value departs from the AI suggestion. Pure.
 * Order: dish_name, servings, then allergens.<name> in contract order. Empty when there is no suggestion.
 */
export function computeEditedFromAi(suggestion: VisionSuggestion | null, facts: VerifiedFacts): string[] {
  if (!suggestion) return [];
  const edited: string[] = [];

  const dish = norm(facts.dish_name);
  if (!suggestion.dish_suggestions.some((d) => norm(d.name) === dish)) edited.push("dish_name");

  const est = suggestion.estimated_servings;
  // The form fills the LOWER bound of the estimate (D-042), so a donor who keeps it has not departed from the AI.
  if (est && facts.servings !== est.min) edited.push("servings");

  const aiListed = new Set(suggestion.possible_allergens.map((a) => a.allergen));
  for (const allergen of ALLERGENS) {
    if (aiListed.has(allergen) && facts.allergens[allergen] === "not_in_listed_ingredients") {
      edited.push(`allergens.${allergen}`);
    }
  }
  return edited;
}
