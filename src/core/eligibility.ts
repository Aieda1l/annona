import {
  ALLERGENS,
  REASON_CODE_SEVERITY,
  type EligibilityDecision,
  type EligibilityReason,
  type FieldState,
  type ReasonCode,
  type VerifiedFacts,
} from "@/contracts";
import type { DonorProfile, PolicyConfig } from "./types";

// CONTRACTS §5 gate G-01..G-13. Pure: no I/O, no clock reads, and no VisionSuggestion in the input.
// Every rule runs (no short-circuit). Precedence: any reject -> rejected, else any review -> needs_review.

export type EligibilityInput = {
  facts: VerifiedFacts;
  donor: DonorProfile;
  policy: PolicyConfig;
  now: Date;
};

export function evaluateEligibility({ facts, donor, policy, now }: EligibilityInput): EligibilityDecision {
  // A broken clock is a programmer error (CONTRACTS §1), not a donor-fixable input; never evaluate against it.
  if (!Number.isFinite(now.getTime())) throw new Error("evaluateEligibility: `now` is not a valid Date");
  const reasons: EligibilityReason[] = [];
  const field_states: Record<string, FieldState> = {};

  // Fields without a rule are donor-attested values; mark them verified first, rules override below.
  for (const key of Object.keys(facts)) {
    if (key !== "allergens") field_states[key] = "donor_verified";
  }
  for (const a of ALLERGENS) field_states[`allergens.${a}`] = "donor_verified";

  const add = (code: ReasonCode, message: string, field?: string, state?: FieldState, allergen?: (typeof ALLERGENS)[number]) => {
    reasons.push({
      code,
      severity: REASON_CODE_SEVERITY[code],
      ...(field ? { field } : {}),
      ...(allergen ? { allergen } : {}),
      message,
    });
    if (field && state) field_states[field] = state;
  };

  // G-01 donor approval
  if (donor.approval_status === "approved" && donor.licensed_food_establishment) {
    // ok
  } else if (donor.approval_status === "pending") {
    add("DONOR_APPROVAL_PENDING", "This kitchen's approval is still pending. An operator must approve it before food can be offered.");
  } else {
    add("DONOR_NOT_APPROVED", "This kitchen is not an approved, licensed food source for this prototype.");
  }

  // G-02 handling mode
  if (!policy.allowed_handling_modes.includes(facts.handling_mode)) {
    if (facts.handling_mode === "unknown") {
      add("HANDLING_UNKNOWN", "Please say how the food is being held (for example refrigerated).", "handling_mode", "unknown");
    } else {
      add("HANDLING_OUT_OF_SCOPE", "This prototype only offers refrigerated food. That is a prototype restriction, not a legal rule.", "handling_mode", "rejected");
    }
  }

  // G-03 preparation type
  if (!policy.allowed_preparation_types.includes(facts.preparation_type)) {
    if (facts.preparation_type === "cooked_then_cooled") {
      add("COOLING_HISTORY_REVIEW", "Cooked-then-cooled food needs a verified cooling history, which this prototype can't check. A partner must review it.", "preparation_type", "needs_review");
    } else if (facts.preparation_type === "other") {
      add("PREPARATION_TYPE_REVIEW", "This preparation type needs a person to review it before it can be offered.", "preparation_type", "needs_review");
    } else {
      add("PREPARATION_UNKNOWN", "Please say how the food was prepared.", "preparation_type", "unknown");
    }
  }

  // G-04 excluded category
  if (facts.contains_excluded_category === "yes") {
    add("EXCLUDED_CATEGORY", "This food is in a category the prototype policy excludes.", "contains_excluded_category", "rejected");
  } else if (facts.contains_excluded_category !== "no") {
    add("EXCLUDED_CATEGORY_UNKNOWN", "Please confirm whether the food is in any excluded category.", "contains_excluded_category", "unknown");
  }

  // G-05 continuous cold holding
  if (facts.continuous_cold_holding === "no") {
    add("COLD_HOLDING_NOT_CONFIRMED", "Cold holding was not continuous, so this can't be offered.", "continuous_cold_holding", "rejected");
  } else if (facts.continuous_cold_holding !== "yes") {
    add("COLD_HOLDING_UNKNOWN", "We can't offer this until continuous cold holding is confirmed.", "continuous_cold_holding", "unknown");
  }

  // G-06 temperature log (only when policy requires it)
  if (policy.require_temperature_log && facts.temperature_log_available !== "yes") {
    add(
      "TEMPERATURE_LOG_MISSING",
      "A temperature log is required. Please confirm one is available or ask an operator to review.",
      "temperature_log_available",
      facts.temperature_log_available === "unknown" ? "unknown" : "needs_review",
    );
  }

  // G-07 previously served
  if (facts.previously_served === "yes") {
    add("PREVIOUSLY_SERVED", "Food that was served to or handled by consumers can't be offered.", "previously_served", "rejected");
  } else if (facts.previously_served !== "no") {
    add("PREVIOUSLY_SERVED_UNKNOWN", "Please confirm the food was not previously served.", "previously_served", "unknown");
  }

  // G-08 covered food-grade containers
  if (facts.covered_food_grade_containers === "no") {
    add("PACKAGING_NOT_COVERED", "The food needs covered, food-grade containers. You can repackage and resubmit.", "covered_food_grade_containers", "needs_review");
  } else if (facts.covered_food_grade_containers !== "yes") {
    add("PACKAGING_UNKNOWN", "Please confirm the food is in covered, food-grade containers.", "covered_food_grade_containers", "unknown");
  }

  // G-09 discard-by
  // An unparseable discard-by is treated as missing: never let NaN comparisons pass a rule.
  if (facts.discard_by === null || !Number.isFinite(Date.parse(facts.discard_by))) {
    add("DISCARD_BY_MISSING", "Please enter the kitchen's discard-by time.", "discard_by", "unknown");
  } else if (Date.parse(facts.discard_by) <= now.getTime()) {
    add("DISCARD_BY_PASSED", "The kitchen's discard-by time has passed.", "discard_by", "rejected");
  }

  // G-10 donor pickup cutoff
  const pickupMs = Date.parse(facts.donor_pickup_by);
  // An unparseable pickup time can't prove a usable window, so it fails like a passed window.
  if (!Number.isFinite(pickupMs) || pickupMs <= now.getTime()) {
    add("PICKUP_WINDOW_PASSED", "The donor pickup time has already passed.", "donor_pickup_by", "rejected");
  } else if (pickupMs < now.getTime() + policy.min_pickup_lead_minutes * 60_000) {
    add("PICKUP_WINDOW_TOO_SHORT", `The pickup window is shorter than the ${policy.min_pickup_lead_minutes}-minute minimum lead time.`, "donor_pickup_by", "rejected");
  }

  // G-11 one reason per unknown allergen
  for (const a of ALLERGENS) {
    // Only an explicit donor declaration counts; a missing or unrecognized value is unknown.
    if (facts.allergens?.[a] !== "present" && facts.allergens?.[a] !== "not_in_listed_ingredients") {
      add("ALLERGEN_UNKNOWN", `Please confirm whether ${a.replace("_", " ")} is in the listed ingredients.`, `allergens.${a}`, "unknown", a);
    }
  }

  // G-12 cross-contact
  if (facts.cross_contact_status !== "declared") {
    add("CROSS_CONTACT_UNKNOWN", "Please say whether any allergens could have cross-contacted this food.", "cross_contact_status", "unknown");
  }

  // G-13 ingredients
  if (facts.ingredients_text.trim().length < 3) {
    add("INGREDIENTS_MISSING", "Please list the ingredients.", "ingredients_text", "unknown");
  }

  const outcome = reasons.some((r) => r.severity === "reject")
    ? "rejected"
    : reasons.some((r) => r.severity === "review")
      ? "needs_review"
      : "eligible";

  return {
    outcome,
    reasons,
    field_states,
    policy_id: policy.policy_id,
    policy_version: policy.policy_version,
    evaluated_at: now.toISOString(),
  };
}
