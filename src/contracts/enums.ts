import { z } from "zod";

// Generated from docs/CONTRACTS.md §2 (exact strings). Captain-controlled: change via contract-change request.

export const ALLERGENS = [
  "milk",
  "eggs",
  "fish",
  "crustacean_shellfish",
  "tree_nuts",
  "peanuts",
  "wheat",
  "soybeans",
  "sesame",
] as const;
export const Allergen = z.enum(ALLERGENS);
export type Allergen = z.infer<typeof Allergen>;

export const DONOR_ALLERGEN_STATUSES = ["present", "not_in_listed_ingredients", "unknown"] as const;
export const DonorAllergenStatus = z.enum(DONOR_ALLERGEN_STATUSES);
export type DonorAllergenStatus = z.infer<typeof DonorAllergenStatus>;

export const CROSS_CONTACT_STATUSES = ["declared", "unknown"] as const;
export const CrossContactStatus = z.enum(CROSS_CONTACT_STATUSES);
export type CrossContactStatus = z.infer<typeof CrossContactStatus>;

export const HANDLING_MODES = ["refrigerated", "hot_held", "ambient", "frozen", "unknown"] as const;
export const HandlingMode = z.enum(HANDLING_MODES);
export type HandlingMode = z.infer<typeof HandlingMode>;

export const PREPARATION_TYPES = [
  "prepared_cold",
  "commercially_packaged",
  "cooked_then_cooled",
  "other",
  "unknown",
] as const;
export const PreparationType = z.enum(PREPARATION_TYPES);
export type PreparationType = z.infer<typeof PreparationType>;

export const YES_NO_UNKNOWN = ["yes", "no", "unknown"] as const;
export const YesNoUnknown = z.enum(YES_NO_UNKNOWN);
export type YesNoUnknown = z.infer<typeof YesNoUnknown>;

export const FIELD_STATES = ["suggested", "donor_verified", "unknown", "needs_review", "rejected"] as const;
export const FieldState = z.enum(FIELD_STATES);
export type FieldState = z.infer<typeof FieldState>;

export const DONATION_STATUSES = [
  "draft",
  "needs_review",
  "eligible",
  "unmatched",
  "offered",
  "claimed",
  "collected",
  "delivered",
  "rejected",
  "canceled",
  "expired",
] as const;
export const DonationStatus = z.enum(DONATION_STATUSES);
export type DonationStatus = z.infer<typeof DonationStatus>;

export const OFFER_STATUSES = [
  "pending_send",
  "open",
  "accepted",
  "declined",
  "expired",
  "superseded",
  "send_failed",
  "canceled",
] as const;
export const OfferStatus = z.enum(OFFER_STATUSES);
export type OfferStatus = z.infer<typeof OfferStatus>;

export const DELIVERY_STATUSES = ["unknown", "accepted", "delivered", "failed"] as const;
export const DeliveryStatus = z.enum(DELIVERY_STATUSES);
export type DeliveryStatus = z.infer<typeof DeliveryStatus>;

export const ELIGIBILITY_OUTCOMES = ["eligible", "needs_review", "rejected"] as const;
export const EligibilityOutcome = z.enum(ELIGIBILITY_OUTCOMES);
export type EligibilityOutcome = z.infer<typeof EligibilityOutcome>;

export const REASON_SEVERITIES = ["review", "reject", "dispatch"] as const;
export const ReasonSeverity = z.enum(REASON_SEVERITIES);
export type ReasonSeverity = z.infer<typeof ReasonSeverity>;

export const AI_STATUSES = ["pending", "succeeded", "failed", "skipped"] as const;
export const AiStatus = z.enum(AI_STATUSES);
export type AiStatus = z.infer<typeof AiStatus>;

export const IMAGE_QUALITIES = ["usable", "poor", "not_food"] as const;
export const ImageQuality = z.enum(IMAGE_QUALITIES);
export type ImageQuality = z.infer<typeof ImageQuality>;

export const CONFIDENCES = ["low", "medium", "high"] as const;
export const Confidence = z.enum(CONFIDENCES);
export type Confidence = z.infer<typeof Confidence>;

export const ACTOR_ROLES = ["donor", "recipient", "courier", "operator", "system"] as const;
export const ActorRole = z.enum(ACTOR_ROLES);
export type ActorRole = z.infer<typeof ActorRole>;

export const PROVIDER_MODES = ["real", "fake"] as const;
export const ProviderMode = z.enum(PROVIDER_MODES);
export type ProviderMode = z.infer<typeof ProviderMode>;

export const STORE_KINDS = ["pglite", "postgres"] as const;
export const StoreKind = z.enum(STORE_KINDS);
export type StoreKind = z.infer<typeof StoreKind>;

export const MESSAGING_IDENTITY_STATUSES = ["awaiting_join", "joined", "opted_out"] as const;
export const MessagingIdentityStatus = z.enum(MESSAGING_IDENTITY_STATUSES);
export type MessagingIdentityStatus = z.infer<typeof MessagingIdentityStatus>;

export const CLAIM_RESULT_CODES = [
  "claimed",
  "already_claimed_by_you",
  "already_claimed",
  "offer_expired",
  "offer_closed",
  "donation_unavailable",
  "not_authorized",
  "offer_not_found",
  "ineligible",
] as const;
export const ClaimResultCode = z.enum(CLAIM_RESULT_CODES);
export type ClaimResultCode = z.infer<typeof ClaimResultCode>;

export const DECLINE_RESULT_CODES = [
  "declined",
  "already_declined",
  "offer_expired",
  "offer_closed",
  "not_authorized",
  "offer_not_found",
] as const;
export const DeclineResultCode = z.enum(DECLINE_RESULT_CODES);
export type DeclineResultCode = z.infer<typeof DeclineResultCode>;

export const INBOUND_OUTCOMES = ["processed", "duplicate", "ignored", "rejected"] as const;
export const InboundOutcome = z.enum(INBOUND_OUTCOMES);
export type InboundOutcome = z.infer<typeof InboundOutcome>;

export const HANDOFF_STEPS = ["collected", "delivered"] as const;
export const HandoffStep = z.enum(HANDOFF_STEPS);
export type HandoffStep = z.infer<typeof HandoffStep>;

export const OPERATOR_ACTIONS = ["reject", "cancel", "return_to_donor", "retry_matching"] as const;
export const OperatorAction = z.enum(OPERATOR_ACTIONS);
export type OperatorAction = z.infer<typeof OperatorAction>;

export const MESSAGE_PURPOSES = [
  "offer",
  "claim_result",
  "decline_ack",
  "offer_closed",
  "join_ack",
  "stop_ack",
  "draft_ready",
  "intake_failed",
  "donor_update",
  "recipient_update",
  "help",
] as const;
export const MessagePurpose = z.enum(MESSAGE_PURPOSES);
export type MessagePurpose = z.infer<typeof MessagePurpose>;

export const INBOUND_IGNORE_REASONS = ["unknown_sender", "not_joined"] as const;
export const InboundIgnoreReason = z.enum(INBOUND_IGNORE_REASONS);
export type InboundIgnoreReason = z.infer<typeof InboundIgnoreReason>;

export const ERROR_CODES = [
  "VALIDATION_FAILED",
  "NOT_FOUND",
  "NOT_AUTHORIZED",
  "INVALID_TRANSITION",
  "CONFLICT",
  "AI_OUTPUT_INVALID",
  "PROVIDER_UNAVAILABLE",
  "RATE_LIMITED",
  "DUPLICATE_EVENT",
  "NOT_IMPLEMENTED",
  "INTERNAL",
] as const;
export const ErrorCode = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** §2.1 ReasonCode catalogue: code → severity. */
export const REASON_CODE_SEVERITY = {
  DONOR_NOT_APPROVED: "reject",
  DONOR_APPROVAL_PENDING: "review",
  HANDLING_OUT_OF_SCOPE: "reject",
  HANDLING_UNKNOWN: "review",
  COOLING_HISTORY_REVIEW: "review",
  PREPARATION_TYPE_REVIEW: "review",
  PREPARATION_UNKNOWN: "review",
  EXCLUDED_CATEGORY: "reject",
  EXCLUDED_CATEGORY_UNKNOWN: "review",
  COLD_HOLDING_NOT_CONFIRMED: "reject",
  COLD_HOLDING_UNKNOWN: "review",
  TEMPERATURE_LOG_MISSING: "review",
  PREVIOUSLY_SERVED: "reject",
  PREVIOUSLY_SERVED_UNKNOWN: "review",
  PACKAGING_NOT_COVERED: "review",
  PACKAGING_UNKNOWN: "review",
  DISCARD_BY_MISSING: "review",
  DISCARD_BY_PASSED: "reject",
  PICKUP_WINDOW_PASSED: "reject",
  PICKUP_WINDOW_TOO_SHORT: "reject",
  ALLERGEN_UNKNOWN: "review",
  CROSS_CONTACT_UNKNOWN: "review",
  INGREDIENTS_MISSING: "review",
  NO_ELIGIBLE_MATCH: "dispatch",
  CANDIDATES_EXHAUSTED: "dispatch",
  CUTOFF_REACHED: "reject",
  PICKUP_NOT_COLLECTED: "reject",
  COURIER_OPTED_OUT: "dispatch",
  COURIER_OPTED_OUT_AFTER_PICKUP: "review",
} as const satisfies Record<string, ReasonSeverity>;
export type ReasonCode = keyof typeof REASON_CODE_SEVERITY;
export const REASON_CODES = Object.keys(REASON_CODE_SEVERITY) as [ReasonCode, ...ReasonCode[]];
export const ReasonCode = z.enum(REASON_CODES);

/** §8.2: an inbound row with no result older than this is reclaimed and reprocessed. */
export const INBOUND_REPROCESS_AFTER_SECONDS = 30;

/** §1: offer short-code alphabet and format (unique across offers, never reused before resetDemo). */
export const SHORT_CODE_ALPHABET = "ACDEFHJKMNPRTUVWXY3479";
export const SHORT_CODE_REGEX = /^[ACDEFHJKMNPRTUVWXY3479]{4}$/;
