import {
  ALLERGENS,
  type Allergen,
  type CrossContactStatus,
  type DonorAllergenStatus,
  type HandlingMode,
  type PreparationType,
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
};

/** Nothing here comes from the AI suggestion: every fact starts empty or `unknown`. */
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
  };
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
      continuous_cold_holding: state.continuous_cold_holding,
      temperature_log_available: state.temperature_log_available,
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
