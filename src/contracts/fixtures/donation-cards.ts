import type { DonationCard, EligibilityDecision, OfferSummary } from "../entities";
import {
  scene1_eligible_facts,
  scene1_vision_suggestion,
  scene3_review_facts,
  scene3_vision_suggestion,
} from "./scenes";

// Baseline: 3 cards (needs_review = scene 3, eligible, claimed). The other 8 statuses land in contracts-2.
// Synthetic names, fixed timestamps, example short code K7M3 only.

const POLICY = { policy_id: "annona-prototype-refrigerated", policy_version: "2026-10-17.1" } as const;

const eligibleDecision: EligibilityDecision = {
  outcome: "eligible",
  reasons: [],
  field_states: { dish_name: "donor_verified", handling_mode: "donor_verified" },
  ...POLICY,
  evaluated_at: "2026-10-17T23:10:00.000Z",
};

const needsReviewDecision: EligibilityDecision = {
  outcome: "needs_review",
  reasons: [
    {
      code: "COOLING_HISTORY_REVIEW",
      severity: "review",
      field: "preparation_type",
      message:
        "Cooked-then-cooled food needs a verified cooling history, which this prototype can't check. A partner must review it.",
    },
    {
      code: "COLD_HOLDING_UNKNOWN",
      severity: "review",
      field: "continuous_cold_holding",
      message: "We can't offer this until continuous cold holding is confirmed.",
    },
    {
      code: "TEMPERATURE_LOG_MISSING",
      severity: "review",
      field: "temperature_log_available",
      message: "A temperature log is required before this can be offered.",
    },
    {
      code: "ALLERGEN_UNKNOWN",
      severity: "review",
      field: "allergens.sesame",
      allergen: "sesame",
      message: "Please confirm whether sesame is in the listed ingredients.",
    },
  ],
  field_states: {
    preparation_type: "needs_review",
    continuous_cold_holding: "unknown",
    temperature_log_available: "needs_review",
    "allergens.sesame": "unknown",
    dish_name: "donor_verified",
  },
  ...POLICY,
  evaluated_at: "2026-10-17T23:12:00.000Z",
};

const claimedOffer: OfferSummary = {
  id: "00000000-0000-4000-8000-0000000000a1",
  short_code: "K7M3",
  courier_display_name: "Courier A (synthetic, cold transport)",
  recipient_display_name: "Eastlake Community Pantry (synthetic)",
  status: "accepted",
  wave_no: 1,
  sent_at: "2026-10-17T23:11:00.000Z",
  expires_at: "2026-10-17T23:12:00.000Z",
  responded_at: "2026-10-17T23:11:20.000Z",
  close_reason: null,
  provider_mode: "fake",
  provider_message_id: "fake_msg_0001",
  delivery_status: "unknown",
};

const handoffPending = { collected_at: null, delivered_at: null, simulated: true } as const;

export const needsReviewCard: DonationCard = {
  id: "00000000-0000-4000-8000-0000000000d3",
  status: "needs_review",
  version: 2,
  donor_display_name: "Rainier Catering (synthetic)",
  donor_area_label: "South Lake Union",
  image_url: null,
  ai_status: "succeeded",
  ai_suggestion: scene3_vision_suggestion,
  verified_facts: scene3_review_facts,
  edited_from_ai: ["servings"],
  decision: needsReviewDecision,
  effective_cutoff_at: "2026-10-18T01:30:00.000Z",
  active_offers: [],
  offer_history: [],
  assignment: null,
  handoff: handoffPending,
  timeline: [],
  is_synthetic: true,
};

export const eligibleCard: DonationCard = {
  id: "00000000-0000-4000-8000-0000000000d1",
  status: "eligible",
  version: 2,
  donor_display_name: "Rainier Catering (synthetic)",
  donor_area_label: "South Lake Union",
  image_url: null,
  ai_status: "succeeded",
  ai_suggestion: scene1_vision_suggestion,
  verified_facts: scene1_eligible_facts,
  edited_from_ai: [],
  decision: eligibleDecision,
  effective_cutoff_at: "2026-10-18T01:30:00.000Z",
  active_offers: [],
  offer_history: [],
  assignment: null,
  handoff: handoffPending,
  timeline: [],
  is_synthetic: true,
};

export const claimedCard: DonationCard = {
  ...eligibleCard,
  id: "00000000-0000-4000-8000-0000000000d2",
  status: "claimed",
  version: 4,
  active_offers: [claimedOffer],
  assignment: {
    courier_display_name: claimedOffer.courier_display_name,
    recipient_display_name: claimedOffer.recipient_display_name,
  },
};

export const DONATION_CARD_FIXTURES: readonly DonationCard[] = [needsReviewCard, eligibleCard, claimedCard];
