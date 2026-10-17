import { z } from "zod";
import {
  ALLERGENS,
  AiStatus,
  Allergen,
  ActorRole,
  ClaimResultCode,
  Confidence,
  CrossContactStatus,
  DeclineResultCode,
  DeliveryStatus,
  DonationStatus,
  DonorAllergenStatus,
  EligibilityOutcome,
  FieldState,
  HandlingMode,
  ImageQuality,
  InboundOutcome,
  MessagePurpose,
  MessagingIdentityStatus,
  OfferStatus,
  PreparationType,
  ProviderMode,
  ReasonCode,
  ReasonSeverity,
  SHORT_CODE_REGEX,
  StoreKind,
  YesNoUnknown,
} from "./enums";

// Generated from docs/CONTRACTS.md §3 and §10. snake_case fields (D-015). Captain-controlled.

/** Every instant is a UTC ISO-8601 string ending in Z (§1). */
export const UtcString = z.iso.datetime();
export type UtcString = z.infer<typeof UtcString>;
const Uuid = z.uuid();
const ShortCode = z.string().regex(SHORT_CODE_REGEX);

export const Actor = z.strictObject({ role: ActorRole, id: Uuid.nullable() });
export type Actor = z.infer<typeof Actor>;

// ---------- §3.3 VisionSuggestion (AI output, untrusted) ----------

const visionModelShape = {
  image_quality: ImageQuality,
  dish_suggestions: z
    .array(z.strictObject({ name: z.string().min(1).max(80), confidence: Confidence }))
    .max(3),
  visible_components: z.array(z.string().max(80)).max(20),
  estimated_servings: z
    .strictObject({ min: z.number().int().min(1).max(500), max: z.number().int().min(1).max(500) })
    .refine((s) => s.min <= s.max, { message: "min must be <= max" })
    .nullable(),
  possible_allergens: z.array(z.strictObject({ allergen: Allergen, basis: z.string().max(120) })),
  uncertainty_notes: z.array(z.string().max(160)).max(5),
  questions_for_donor: z.array(z.string().max(160)).max(5),
  ingredients_verified: z.literal(false),
  handling_verified: z.literal(false),
  requires_donor_confirmation: z.literal(true),
};

/** What the model generates: the VisionSuggestion keys minus the five adapter-stamped provenance keys. */
export const VisionModelOutput = z.strictObject(visionModelShape);
export type VisionModelOutput = z.infer<typeof VisionModelOutput>;

export const VisionSuggestion = z.strictObject({
  prompt_id: z.string().min(1),
  prompt_version: z.string().min(1),
  provider: z.enum(["gemini", "fake"]),
  model: z.string().nullable(),
  mode: ProviderMode,
  ...visionModelShape,
});
export type VisionSuggestion = z.infer<typeof VisionSuggestion>;

// ---------- §3.4 VerifiedFacts (donor-submitted) ----------

const AllergenDeclarations = z.strictObject(
  Object.fromEntries(ALLERGENS.map((a) => [a, DonorAllergenStatus])) as Record<Allergen, typeof DonorAllergenStatus>,
);

/** Every key required; uncertainty is an explicit `unknown`, never omission. `.strict()`: unknown keys fail. */
export const VerifiedFacts = z
  .strictObject({
    dish_name: z.string().min(1).max(80),
    description: z.string().max(300),
    servings: z.number().int().min(1).max(500),
    ingredients_text: z.string().max(1000),
    allergens: AllergenDeclarations,
    cross_contact_status: CrossContactStatus,
    cross_contact_allergens: z.array(Allergen),
    handling_mode: HandlingMode,
    preparation_type: PreparationType,
    contains_excluded_category: YesNoUnknown,
    continuous_cold_holding: YesNoUnknown,
    temperature_log_available: YesNoUnknown,
    previously_served: YesNoUnknown,
    covered_food_grade_containers: YesNoUnknown,
    discard_by: UtcString.nullable(),
    donor_pickup_by: UtcString,
    pickup_instructions: z.string().max(200),
    attestation: z.strictObject({
      attested: z.literal(true),
      attested_by_label: z.string().min(1).max(80),
      attested_at: UtcString,
    }),
  })
  .refine((f) => f.cross_contact_status === "declared" || f.cross_contact_allergens.length === 0, {
    message: "cross_contact_allergens is allowed only when cross_contact_status is declared",
    path: ["cross_contact_allergens"],
  });
export type VerifiedFacts = z.infer<typeof VerifiedFacts>;

// ---------- §3.7 EligibilityDecision ----------

export const EligibilityReason = z.strictObject({
  code: ReasonCode,
  severity: ReasonSeverity,
  field: z.string().optional(),
  allergen: Allergen.optional(),
  message: z.string().min(1),
});
export type EligibilityReason = z.infer<typeof EligibilityReason>;

export const EligibilityDecision = z.strictObject({
  outcome: EligibilityOutcome,
  reasons: z.array(EligibilityReason),
  field_states: z.record(z.string(), FieldState),
  policy_id: z.string().min(1),
  policy_version: z.string().min(1),
  evaluated_at: UtcString,
});
export type EligibilityDecision = z.infer<typeof EligibilityDecision>;

// ---------- §3.11 AuditEvent ----------

export const AUDIT_EVENT_TYPES = [
  "donation.created",
  "ai.suggestion_attached",
  "ai.suggestion_failed",
  "donor.verification_submitted",
  "eligibility.evaluated",
  "operator.action",
  "matching.completed",
  "matching.unmatched",
  "offer.created",
  "offer.opened",
  "offer.send_failed",
  "offer.delivery_status",
  "offer.declined",
  "offer.expired",
  "offer.superseded",
  "claim.accepted",
  "claim.rejected",
  "assignment.released",
  "donation.expired",
  "handoff.recorded",
  "donation.canceled",
  "inbound.received",
  "inbound.duplicate",
  "inbound.ignored",
  "intake.failed",
  "link.issued",
  "link.consumed",
  "link.rejected",
  "outbound.sent",
  "identity.joined",
  "identity.opted_out",
  "tick.completed",
  "demo.reset",
] as const;

/** `data` never contains a full handle, message text, address_line or pickup_instructions (§3.11). */
export const AuditEvent = z.strictObject({
  id: Uuid,
  at: UtcString,
  donation_id: Uuid.nullable(),
  offer_id: Uuid.nullable(),
  type: z.enum(AUDIT_EVENT_TYPES),
  actor: z.strictObject({ role: ActorRole, id: Uuid.nullable() }),
  mode: z.strictObject({ vision: ProviderMode.optional(), messaging: ProviderMode.optional() }),
  data: z.record(z.string(), z.unknown()),
});
export type AuditEvent = z.infer<typeof AuditEvent>;

// ---------- §3.13 read models ----------

export const OfferSummary = z.strictObject({
  id: Uuid,
  short_code: ShortCode,
  courier_display_name: z.string(),
  recipient_display_name: z.string(),
  status: OfferStatus,
  wave_no: z.number().int().min(1),
  sent_at: UtcString.nullable(),
  expires_at: UtcString.nullable(),
  responded_at: UtcString.nullable(),
  close_reason: z.string().nullable(),
  provider_mode: ProviderMode,
  provider_message_id: z.string().nullable(),
  delivery_status: DeliveryStatus,
});
export type OfferSummary = z.infer<typeof OfferSummary>;

export const DonationCard = z.strictObject({
  id: Uuid,
  status: DonationStatus,
  version: z.number().int().min(0),
  donor_display_name: z.string(),
  donor_area_label: z.string(),
  image_url: z.string().nullable(),
  ai_status: AiStatus,
  ai_suggestion: VisionSuggestion.nullable(),
  verified_facts: VerifiedFacts.nullable(),
  edited_from_ai: z.array(z.string()),
  decision: EligibilityDecision.nullable(),
  effective_cutoff_at: UtcString.nullable(),
  active_offers: z.array(OfferSummary),
  offer_history: z.array(OfferSummary),
  assignment: z
    .strictObject({ courier_display_name: z.string(), recipient_display_name: z.string() })
    .nullable(),
  handoff: z.strictObject({
    collected_at: UtcString.nullable(),
    delivered_at: UtcString.nullable(),
    simulated: z.literal(true),
  }),
  timeline: z.array(AuditEvent).max(30),
  is_synthetic: z.literal(true),
});
export type DonationCard = z.infer<typeof DonationCard>;

export const IdentitySummary = z.strictObject({
  identity_id: Uuid,
  actor_role: ActorRole,
  actor_id: Uuid,
  actor_display_name: z.string(),
  provider: z.enum(["photon", "fake"]),
  status: MessagingIdentityStatus,
  joined_at: UtcString.nullable(),
  handle_masked: z.string().max(8),
});
export type IdentitySummary = z.infer<typeof IdentitySummary>;

const ProviderStatus = z.enum(["ok", "misconfigured"]);

export const SystemModes = z.strictObject({
  vision: z.strictObject({
    mode: ProviderMode,
    provider: z.string(),
    model: z.string().nullable(),
    status: ProviderStatus,
  }),
  messaging: z.strictObject({
    mode: ProviderMode,
    provider: z.string(),
    channel: z.enum(["imessage", "simulated"]),
    status: ProviderStatus,
  }),
  store: StoreKind,
  demo_accelerated: z.boolean(),
  last_tick_at: UtcString.nullable(),
  policy_version: z.string(),
});
export type SystemModes = z.infer<typeof SystemModes>;

export const DashboardSnapshot = z.strictObject({
  generated_at: UtcString,
  modes: SystemModes,
  counts_by_status: z.record(DonationStatus, z.number().int().min(0)),
  donations: z.array(DonationCard),
  identities: z.array(IdentitySummary),
});
export type DashboardSnapshot = z.infer<typeof DashboardSnapshot>;

// ---------- §3.9 Claim and decline ----------

const OfferRef = z.union([
  z.strictObject({ offer_id: Uuid }),
  z.strictObject({ short_code: ShortCode }),
]);

export const ClaimCommand = z.strictObject({
  offer_ref: OfferRef,
  actor: Actor,
  source: z.enum(["messaging", "simulated_messaging"]),
  source_event_id: z.string().nullable(),
});
export type ClaimCommand = z.infer<typeof ClaimCommand>;

export const DeclineCommand = ClaimCommand;
export type DeclineCommand = ClaimCommand;

/** Populated only for `claimed` and `already_claimed_by_you`; otherwise null and no address is disclosed. */
export const Assignment = z.strictObject({
  donation_id: Uuid,
  recipient: z.strictObject({ display_name: z.string(), address_line: z.string() }),
  pickup: z.strictObject({
    display_name: z.string(),
    address_line: z.string(),
    pickup_instructions: z.string(),
    donor_pickup_by: UtcString,
  }),
});
export type Assignment = z.infer<typeof Assignment>;

export const ClaimResult = z
  .strictObject({
    code: ClaimResultCode,
    offer_id: Uuid.nullable(),
    donation_id: Uuid.nullable(),
    donation_status: DonationStatus.nullable(),
    assignment: Assignment.nullable(),
    message_for_actor: z.string(),
  })
  // Section 3.9: the assignment (with addresses) exists only for `claimed` and `already_claimed_by_you`.
  .refine((r) => (r.code === "claimed" || r.code === "already_claimed_by_you") === (r.assignment !== null), {
    message: "assignment must be present exactly for claimed and already_claimed_by_you",
    path: ["assignment"],
  });
export type ClaimResult = z.infer<typeof ClaimResult>;

export const DeclineResult = z.strictObject({
  code: DeclineResultCode,
  offer_id: Uuid.nullable(),
  donation_id: Uuid.nullable(),
  donation_status: DonationStatus.nullable(),
  assignment: z.null(),
  message_for_actor: z.string(),
});
export type DeclineResult = z.infer<typeof DeclineResult>;

// ---------- §3.10 Messaging payloads ----------

const MessagingProvider = z.enum(["photon", "fake"]);

export const InboundMessage = z.strictObject({
  provider: MessagingProvider,
  provider_message_id: z.string().min(1),
  provider_event_id: z.string().nullable(),
  received_at: UtcString,
  sender_handle: z.string().min(1),
  provider_space_id: z.string().nullable(),
  provider_line_sender_id: z.string().nullable(),
  text: z.string().nullable(),
  attachments: z.array(
    z.strictObject({
      kind: z.literal("image"),
      provider_attachment_id: z.string().optional(),
      mime: z.string().nullable().optional(),
      fixture_id: z.string().optional(),
    }),
  ),
});
export type InboundMessage = z.infer<typeof InboundMessage>;

export const DeliveryStatusEvent = z.strictObject({
  provider: MessagingProvider,
  provider_event_id: z.string().min(1),
  provider_message_id: z.string().min(1),
  status: z.enum(["accepted", "delivered", "failed"]),
  failure_code: z.string().nullable(),
  at: UtcString,
});
export type DeliveryStatusEvent = z.infer<typeof DeliveryStatusEvent>;

export const OutboundMessage = z.strictObject({
  to_identity_id: Uuid,
  text: z.string().min(1),
  purpose: MessagePurpose,
  correlation: z.strictObject({
    donation_id: Uuid.optional(),
    offer_id: Uuid.optional(),
    inbound_message_id: z.string().optional(),
  }),
  idempotency_key: z.string().min(1),
});
export type OutboundMessage = z.infer<typeof OutboundMessage>;

/** `ok: true` means the provider accepted the message, not that it was delivered (§3.10). */
export const SendResult = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), provider_message_id: z.string(), mode: ProviderMode }),
  z.strictObject({
    ok: z.literal(false),
    error_code: z.enum(["PROVIDER_UNAVAILABLE", "RATE_LIMITED", "NOT_JOINED", "INVALID_HANDLE", "NOT_IMPLEMENTED"]),
    retryable: z.boolean(),
    mode: ProviderMode,
  }),
]);
export type SendResult = z.infer<typeof SendResult>;

export const INBOUND_COMMANDS = ["accept", "decline", "join", "stop", "help", "photo", "unknown"] as const;

export const InboundResult = z.strictObject({
  outcome: InboundOutcome,
  command: z.enum(INBOUND_COMMANDS),
  claim_result: ClaimResult.optional(),
  decline_result: DeclineResult.optional(),
  reply: OutboundMessage.nullable(),
});
export type InboundResult = z.infer<typeof InboundResult>;

/** The only input to formatOfferMessage. Never carries address_line, pickup_instructions or a handle. */
export const OfferMessageView = z.strictObject({
  short_code: ShortCode,
  dish_name: z.string(),
  servings: z.number().int().min(1),
  allergens_present: z.array(Allergen),
  cross_contact_status: CrossContactStatus,
  cross_contact_allergens: z.array(Allergen),
  handling_mode: HandlingMode,
  recipient_display_name: z.string(),
  pickup_area_label: z.string(),
  expires_at: UtcString,
  demo_mode: z.boolean(),
});
export type OfferMessageView = z.infer<typeof OfferMessageView>;

/** The only input to formatDraftReadyMessage. */
export const DraftReadyView = z.strictObject({
  ai_status: AiStatus,
  dish_guess: z.string().nullable(),
  possible_allergens: z.array(Allergen),
  link_url: z.string().min(1),
  link_expires_at: UtcString,
  demo_mode: z.boolean(),
});
export type DraftReadyView = z.infer<typeof DraftReadyView>;

/** §3.16: returned to the checklist page. Never a DonationCard, handle, address, offer or courier. */
export const VerificationLinkView = z.strictObject({
  donation_id: Uuid,
  donor_display_name: z.string(),
  status: DonationStatus,
  ai_status: AiStatus,
  ai_suggestion: VisionSuggestion.nullable(),
  verified_facts: VerifiedFacts.nullable(),
  decision: EligibilityDecision.nullable(),
  link_expires_at: UtcString,
  resubmit_token: z.string().nullable(),
  is_synthetic: z.literal(true),
});
export type VerificationLinkView = z.infer<typeof VerificationLinkView>;

// ---------- §10 HTTP request bodies (strict) ----------

export const SessionRequestBody = z.strictObject({ actor_id: Uuid, passcode: z.string().min(1) });
export type SessionRequestBody = z.infer<typeof SessionRequestBody>;

export const IntakeDraftRequestBody = z.union([
  z.strictObject({
    image: z.strictObject({ mime: z.string().min(1), bytes_base64: z.string().min(1) }),
  }),
  z.strictObject({ fixture_id: z.string().min(1) }),
]);
export type IntakeDraftRequestBody = z.infer<typeof IntakeDraftRequestBody>;

export const SimulatedInboundRequestBody = z.strictObject({
  identity_id: Uuid,
  text: z.string(),
  fixture_id: z.string().min(1).optional(),
});
export type SimulatedInboundRequestBody = z.infer<typeof SimulatedInboundRequestBody>;

export const VerifyTokenRequestBody = z.strictObject({ token: z.string().min(1) });
export type VerifyTokenRequestBody = z.infer<typeof VerifyTokenRequestBody>;

/** `facts` is raw: Dev 1 parses it with VerifiedFacts so a bad body leaves the link live (§8.4). */
export const VerifySubmitRequestBody = z.strictObject({ token: z.string().min(1), facts: z.unknown() });
export type VerifySubmitRequestBody = z.infer<typeof VerifySubmitRequestBody>;
