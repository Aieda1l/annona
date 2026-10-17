import type { AuditEvent, DonationCard, EligibilityDecision, OfferSummary } from "../entities";
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

// ---------- contracts-2: the other 8 statuses (one card per DonationStatus, 11 total) ----------

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

const event = (
  n: number,
  type: AuditEvent["type"],
  at: string,
  donation_id: string,
  offer_id: string | null = null,
): AuditEvent => ({
  id: id(0x500 + n),
  at,
  donation_id,
  offer_id,
  type,
  actor: { role: "system", id: null },
  mode: { messaging: "fake" },
  data: {},
});

const offerBase: OfferSummary = { ...claimedOffer, id: id(0xa2), short_code: "H4M9" };

export const draftCard: DonationCard = {
  ...eligibleCard,
  id: id(0xd4),
  status: "draft",
  version: 1,
  ai_suggestion: scene1_vision_suggestion,
  verified_facts: null,
  edited_from_ai: [],
  decision: null,
  effective_cutoff_at: null,
};

export const unmatchedCard: DonationCard = {
  ...eligibleCard,
  id: id(0xd5),
  status: "unmatched",
  version: 3,
  decision: {
    ...eligibleDecision,
    reasons: [
      {
        code: "NO_ELIGIBLE_MATCH",
        severity: "dispatch",
        message: "No cold-capable courier and receiving organization pair is available right now.",
      },
    ],
  },
};

export const offeredCard: DonationCard = {
  ...eligibleCard,
  id: id(0xd6),
  status: "offered",
  version: 3,
  active_offers: [
    { ...offerBase, status: "open", responded_at: null, delivery_status: "unknown", provider_message_id: "fake_msg_0002" },
  ],
};

export const collectedCard: DonationCard = {
  ...claimedCard,
  id: id(0xd7),
  status: "collected",
  version: 5,
  handoff: { collected_at: "2026-10-17T23:25:00.000Z", delivered_at: null, simulated: true },
};

export const deliveredCard: DonationCard = {
  ...claimedCard,
  id: id(0xd8),
  status: "delivered",
  version: 6,
  handoff: { collected_at: "2026-10-17T23:25:00.000Z", delivered_at: "2026-10-17T23:40:00.000Z", simulated: true },
};

export const rejectedCard: DonationCard = {
  ...eligibleCard,
  id: id(0xda),
  status: "rejected",
  version: 2,
  verified_facts: { ...scene1_eligible_facts, continuous_cold_holding: "no" },
  decision: {
    outcome: "rejected",
    reasons: [
      {
        code: "COLD_HOLDING_NOT_CONFIRMED",
        severity: "reject",
        field: "continuous_cold_holding",
        message: "Cold holding was not continuous, so this can't be offered.",
      },
    ],
    field_states: { dish_name: "donor_verified", continuous_cold_holding: "rejected" },
    ...POLICY,
    evaluated_at: "2026-10-17T23:09:00.000Z",
  },
};

export const canceledCard: DonationCard = {
  ...eligibleCard,
  id: id(0xdb),
  status: "canceled",
  version: 4,
  offer_history: [
    { ...offerBase, status: "canceled", responded_at: null, close_reason: "donation_canceled", delivery_status: "accepted" },
  ],
  timeline: [event(1, "donation.canceled", "2026-10-17T23:13:00.000Z", id(0xdb), id(0xa2))],
};

export const expiredCard: DonationCard = {
  ...eligibleCard,
  id: id(0xdc),
  status: "expired",
  version: 4,
  offer_history: [
    { ...offerBase, status: "expired", responded_at: null, close_reason: "cutoff_reached", delivery_status: "delivered" },
  ],
  timeline: [event(2, "donation.expired", "2026-10-18T01:30:00.000Z", id(0xdc), id(0xa2))],
};

// needs_review stays first: existing tests index [0].
export const DONATION_CARD_FIXTURES: readonly DonationCard[] = [
  needsReviewCard,
  eligibleCard,
  claimedCard,
  draftCard,
  unmatchedCard,
  offeredCard,
  collectedCard,
  deliveredCard,
  rejectedCard,
  canceledCard,
  expiredCard,
];
