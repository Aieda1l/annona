import type { DonorAllergenStatus, ReasonCode } from "../enums";
import type { EligibilityOutcome } from "../enums";
import type { VerifiedFacts, VisionSuggestion } from "../entities";

// MVP_SCOPE §5 demo scenes. All synthetic. Timestamps are fixed fixture values; the seed and the
// dispatch lane compute real times relative to the server Clock. No fixture name contains the word "safe".

const NONE_LISTED: DonorAllergenStatus = "not_in_listed_ingredients";

/** Scene 1: policy-eligible demo facts for the refrigerated sandwich platter (used by T-CO-01). */
export const scene1_eligible_facts: VerifiedFacts = {
  dish_name: "Assorted deli sandwiches and wraps",
  description: "Refrigerated catering platter, covered, prepared this morning.",
  servings: 24,
  ingredients_text:
    "Sliced wheat bread, flour tortillas, turkey, sliced cheddar, lettuce, tomato, mayonnaise, mustard.",
  allergens: {
    milk: "present",
    eggs: "present",
    fish: NONE_LISTED,
    crustacean_shellfish: NONE_LISTED,
    tree_nuts: NONE_LISTED,
    peanuts: NONE_LISTED,
    wheat: "present",
    soybeans: NONE_LISTED,
    sesame: NONE_LISTED,
  },
  cross_contact_status: "declared",
  cross_contact_allergens: [],
  handling_mode: "refrigerated",
  preparation_type: "prepared_cold",
  contains_excluded_category: "no",
  continuous_cold_holding: "yes",
  temperature_log_available: "yes",
  previously_served: "no",
  covered_food_grade_containers: "yes",
  discard_by: "2026-10-18T05:00:00.000Z",
  donor_pickup_by: "2026-10-18T01:30:00.000Z",
  pickup_instructions: "Rear loading door; ask for the catering lead.",
  attestation: {
    attested: true,
    attested_by_label: "Rainier Catering catering lead (synthetic)",
    attested_at: "2026-10-17T23:10:00.000Z",
  },
};

export const scene1_vision_suggestion: VisionSuggestion = {
  prompt_id: "annona-intake",
  prompt_version: "v1",
  provider: "fake",
  model: null,
  mode: "fake",
  image_quality: "usable",
  dish_suggestions: [{ name: "assorted deli sandwiches and wraps", confidence: "medium" }],
  visible_components: ["sliced bread sandwiches", "tortilla wraps", "lettuce", "sliced cheese"],
  estimated_servings: { min: 18, max: 30 },
  possible_allergens: [
    { allergen: "wheat", basis: "bread and tortillas are typically wheat-based" },
    { allergen: "milk", basis: "visible sliced cheese" },
    { allergen: "eggs", basis: "spreads such as mayonnaise commonly contain egg" },
  ],
  uncertainty_notes: ["Fillings and spreads cannot be identified from a photo."],
  questions_for_donor: ["Which spreads and fillings are used? Do any contain sesame, soy, nuts or fish?"],
  ingredients_verified: false,
  handling_verified: false,
  requires_donor_confirmation: true,
};

/** Scene 3: cooked-then-cooled pasta with unknowns; the gate returns needs_review with four reasons. */
export const scene3_review_facts: VerifiedFacts = {
  ...scene1_eligible_facts,
  dish_name: "Baked pasta tray",
  description: "Cooked yesterday, cooled and stored overnight.",
  servings: 40,
  ingredients_text: "Pasta, tomato sauce, ricotta, mozzarella, parmesan, house seasoning blend.",
  allergens: {
    milk: "present",
    eggs: "present",
    fish: NONE_LISTED,
    crustacean_shellfish: NONE_LISTED,
    tree_nuts: NONE_LISTED,
    peanuts: NONE_LISTED,
    wheat: "present",
    soybeans: NONE_LISTED,
    sesame: "unknown",
  },
  preparation_type: "cooked_then_cooled",
  continuous_cold_holding: "unknown",
  temperature_log_available: "no",
};

export const scene3_vision_suggestion: VisionSuggestion = {
  ...scene1_vision_suggestion,
  dish_suggestions: [{ name: "baked pasta tray", confidence: "medium" }],
  visible_components: ["pasta", "red sauce", "melted cheese"],
  estimated_servings: { min: 30, max: 45 },
  possible_allergens: [
    { allergen: "wheat", basis: "pasta is typically wheat-based" },
    { allergen: "milk", basis: "visible melted cheese" },
  ],
  uncertainty_notes: ["Preparation, cooling and holding history cannot be seen in a photo."],
  questions_for_donor: ["How was this cooled and held? Does the seasoning blend contain sesame?"],
};

export type DemoScene = {
  readonly id: "scene1" | "scene2" | "scene3";
  readonly title: string;
  readonly suggestion: VisionSuggestion;
  readonly facts: VerifiedFacts;
  readonly expected: {
    readonly outcome: EligibilityOutcome;
    readonly reason_codes: readonly ReasonCode[];
    readonly summary: string;
  };
};

export const DEMO_SCENES: readonly DemoScene[] = [
  {
    id: "scene1",
    title: "Success: sandwich platter claimed by Courier A",
    suggestion: scene1_vision_suggestion,
    facts: scene1_eligible_facts,
    expected: {
      outcome: "eligible",
      reason_codes: [],
      summary: "Gate returns eligible; Courier A replies YES K7M3 and the donation is claimed.",
    },
  },
  {
    id: "scene2",
    title: "No response and late reply: Courier A times out, Courier B claims",
    suggestion: scene1_vision_suggestion,
    facts: scene1_eligible_facts,
    expected: {
      outcome: "eligible",
      reason_codes: [],
      summary: "Offer to A expires, B is offered and claims; A's late YES is told the offer expired.",
    },
  },
  {
    id: "scene3",
    title: "Responsible refusal: pasta tray needs review",
    suggestion: scene3_vision_suggestion,
    facts: scene3_review_facts,
    expected: {
      outcome: "needs_review",
      reason_codes: ["COOLING_HISTORY_REVIEW", "COLD_HOLDING_UNKNOWN", "TEMPERATURE_LOG_MISSING", "ALLERGEN_UNKNOWN"],
      summary: "Four plain-language review reasons; no offer is created and there is no dispatch-anyway control.",
    },
  },
];
