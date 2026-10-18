import {
  ALLERGENS,
  type Allergen,
  type CrossContactStatus,
  type DonorAllergenStatus,
  type HandlingMode,
  type PreparationType,
  type VisionSuggestion,
  type YesNoUnknown,
} from "@/contracts";

// Pure form model for VerificationForm. Client-safe: no server imports. It only turns what the donor typed
// into the raw VerifiedFacts payload and reports missing required fields. It makes no safety decision:
// the server parses the payload strictly and the gate decides (AI describes, humans verify, backend enforces).

export type FormState = {
  dish_name: string;
  description: string;
  servings: string;
  ingredients_text: string;
  allergens: Record<Allergen, DonorAllergenStatus>;
  cross_contact_status: CrossContactStatus;
  cross_contact_allergens: Allergen[];
  handling_mode: HandlingMode;
  preparation_type: PreparationType;
  contains_excluded_category: YesNoUnknown;
  continuous_cold_holding: YesNoUnknown;
  temperature_log_available: YesNoUnknown;
  previously_served: YesNoUnknown;
  covered_food_grade_containers: YesNoUnknown;
  discard_by_local: string;
  no_discard_by: boolean;
  donor_pickup_by_local: string;
  pickup_instructions: string;
  attested_by_label: string;
  attested: boolean;
  /** The ingredients text the AI draft filled in, or null. While the field still equals it, the donor must tick `ingredients_checked`. */
  ai_ingredients: string | null;
  ingredients_checked: boolean;
};

/** The empty form: every fact starts empty or `unknown`. `prefillFromSuggestion` may then fill a few descriptive fields. */
export function initialFormState(): FormState {
  return {
    dish_name: "",
    description: "",
    servings: "",
    ingredients_text: "",
    allergens: Object.fromEntries(ALLERGENS.map((a) => [a, "unknown"])) as Record<Allergen, DonorAllergenStatus>,
    cross_contact_status: "unknown",
    cross_contact_allergens: [],
    handling_mode: "unknown",
    preparation_type: "unknown",
    contains_excluded_category: "unknown",
    continuous_cold_holding: "unknown",
    temperature_log_available: "unknown",
    previously_served: "unknown",
    covered_food_grade_containers: "unknown",
    discard_by_local: "",
    no_discard_by: false,
    donor_pickup_by_local: "",
    pickup_instructions: "",
    attested_by_label: "",
    attested: false,
    ai_ingredients: null,
    ingredients_checked: false,
  };
}

/** What `prefillFromSuggestion` filled, so the form can tag those fields and drop the tag when the donor changes them. */
export type AiFilled = { dish_name?: string; servings?: string; ingredients_text?: string; allergens: Allergen[] };

/**
 * D-042: starts the form from the AI draft to save the donor typing. It fills ONLY fields that are still at their
 * default (so it never overwrites what the donor typed or chose):
 * - dish name: the top suggestion;
 * - servings: the LOWER bound of the estimate (never a bigger count than the AI guessed);
 * - ingredients: the visible components (the donor must tick that they checked the list before submitting);
 * - each allergen the AI flagged as possible: pre-selected as `present`, the cautious direction.
 * It NEVER selects `not_in_listed_ingredients` (the AI not mentioning an allergen is not evidence it is absent) and
 * never touches cross-contact, handling, preparation, excluded category, temperatures, holding, previously served,
 * containers, the times, or the attestation. The filled values are the donor's statement only once the donor submits.
 */
export function prefillFromSuggestion(state: FormState, suggestion: VisionSuggestion | null): { state: FormState; filled: AiFilled } {
  const filled: AiFilled = { allergens: [] };
  if (!suggestion) return { state, filled };
  const next: FormState = { ...state, allergens: { ...state.allergens } };

  const dish = suggestion.dish_suggestions[0]?.name.trim().slice(0, 80);
  if (state.dish_name === "" && dish) {
    next.dish_name = dish;
    filled.dish_name = dish;
  }
  const lowest = suggestion.estimated_servings?.min;
  if (state.servings === "" && typeof lowest === "number" && Number.isFinite(lowest)) {
    const servings = String(Math.min(500, Math.max(1, Math.floor(lowest))));
    next.servings = servings;
    filled.servings = servings;
  }
  const ingredients = suggestion.visible_components.map((c) => c.trim()).filter(Boolean).join(", ").slice(0, 1000);
  if (state.ingredients_text === "" && ingredients) {
    next.ingredients_text = ingredients;
    next.ai_ingredients = ingredients;
    filled.ingredients_text = ingredients;
  }
  for (const flagged of suggestion.possible_allergens) {
    if (state.allergens[flagged.allergen] === "unknown") {
      next.allergens[flagged.allergen] = "present";
      filled.allergens.push(flagged.allergen);
    }
  }
  return { state: next, filled };
}

/**
 * The cold-holding and temperature-log questions only matter for refrigerated food: the prototype policy offers
 * refrigerated food only (the gate rejects every other handling mode as out of scope), so once the donor says the
 * food is hot, room temperature or frozen those two questions are hidden. Until the donor has chosen, they show.
 */
export const showsColdQuestions = (handling: HandlingMode): boolean => handling === "refrigerated" || handling === "unknown";

/** `Date` to a `datetime-local` input value (the donor's local time, minutes), for the "+1 h / +2 h / +4 h" buttons. */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `datetime-local` value (the donor's local time) to a UTC ISO string, or null if empty or invalid. */
export function localToUtc(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export type BuildResult = { ok: true; raw: Record<string, unknown> } | { ok: false; errors: string[] };

export function buildFacts(state: FormState, now: Date = new Date()): BuildResult {
  const errors: string[] = [];
  const servings = /^\d+$/.test(state.servings.trim()) ? Number(state.servings.trim()) : NaN;
  const pickup = localToUtc(state.donor_pickup_by_local);
  const discard = state.no_discard_by ? null : localToUtc(state.discard_by_local);

  if (!state.dish_name.trim()) errors.push("Dish name is required.");
  if (!Number.isInteger(servings) || servings < 1 || servings > 500) {
    errors.push("Servings must be a whole number from 1 to 500.");
  }
  if (!pickup) errors.push("Enter the latest time you can hand the food over.");
  if (!state.no_discard_by && !discard) {
    errors.push("Enter a discard-by time, or tick 'My kitchen has no discard-by time'.");
  }
  if (!state.attested_by_label.trim()) errors.push("Enter your name or role for the attestation.");
  if (state.ai_ingredients !== null && state.ingredients_text === state.ai_ingredients && !state.ingredients_checked) {
    errors.push("Tick that you checked the ingredient list against your recipe or label, or edit the list.");
  }
  if (!state.attested) errors.push("Tick the attestation to continue.");
  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    raw: {
      dish_name: state.dish_name.trim(),
      description: state.description.trim(),
      servings,
      ingredients_text: state.ingredients_text.trim(),
      allergens: { ...state.allergens },
      cross_contact_status: state.cross_contact_status,
      // Only meaningful when declared; the schema rejects a list otherwise.
      cross_contact_allergens: state.cross_contact_status === "declared" ? state.cross_contact_allergens : [],
      handling_mode: state.handling_mode,
      preparation_type: state.preparation_type,
      contains_excluded_category: state.contains_excluded_category,
      // Hidden questions are submitted as unknown, never as a stale answer the donor can no longer see.
      continuous_cold_holding: showsColdQuestions(state.handling_mode) ? state.continuous_cold_holding : "unknown",
      temperature_log_available: showsColdQuestions(state.handling_mode) ? state.temperature_log_available : "unknown",
      previously_served: state.previously_served,
      covered_food_grade_containers: state.covered_food_grade_containers,
      discard_by: discard,
      donor_pickup_by: pickup,
      pickup_instructions: state.pickup_instructions.trim(),
      attestation: {
        attested: true,
        attested_by_label: state.attested_by_label.trim(),
        // Required by the schema but ignored: core overwrites it with the server clock (CONTRACTS §3.4).
        attested_at: now.toISOString(),
      },
    },
  };
}
