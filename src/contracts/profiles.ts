import { z } from "zod";
import { ActorRole, Allergen, HandlingMode, MessagingIdentityStatus, PreparationType } from "./enums";
import { UtcString } from "./entities";

// CONTRACTS section 3.1 (profiles), 3.5 (MatchCandidate), 3.12 (PolicyConfig). Writer: Dev 2. All strict.
// Captain-controlled: change via contract-change request. Added in contracts-2 (spec v0.5).

const Uuid = z.uuid();
const ApprovalStatus = z.enum(["approved", "pending", "suspended"]);

/** `address_line` is disclosed to a courier only after a successful claim (CONTRACTS section 11). */
export const GeoLocation = z.strictObject({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  area_label: z.string(),
  address_line: z.string(),
});
export type GeoLocation = z.infer<typeof GeoLocation>;

export const DonorProfile = z.strictObject({
  id: Uuid,
  display_name: z.string().max(80),
  org_type: z.enum(["restaurant", "caterer", "campus_dining"]),
  licensed_food_establishment: z.boolean(),
  approval_status: ApprovalStatus,
  location: GeoLocation,
  is_synthetic: z.literal(true),
});
export type DonorProfile = z.infer<typeof DonorProfile>;

export const RecipientOrg = z.strictObject({
  id: Uuid,
  display_name: z.string().max(80),
  approval_status: ApprovalStatus,
  location: GeoLocation,
  is_synthetic: z.literal(true),
  registered_dfdo: z.boolean(),
  serves_highly_susceptible_population: z.boolean(),
  accepts_handling_modes: z.array(HandlingMode),
  excluded_allergens: z.array(Allergen),
  capacity_servings_available: z.number().int().min(0),
  receiving_closes_at: UtcString,
});
export type RecipientOrg = z.infer<typeof RecipientOrg>;

export const CourierProfile = z.strictObject({
  id: Uuid,
  display_name: z.string().max(80),
  approval_status: ApprovalStatus,
  location: GeoLocation,
  is_synthetic: z.literal(true),
  affiliated_recipient_ids: z.array(Uuid),
  capabilities: z.strictObject({ cold_transport: z.boolean() }),
  available_until: UtcString,
});
export type CourierProfile = z.infer<typeof CourierProfile>;

/** Server-side only: carries the full `handle`. Never sent to the UI (the UI sees `IdentitySummary`). */
export const MessagingIdentity = z.strictObject({
  id: Uuid,
  actor_role: ActorRole,
  actor_id: Uuid,
  provider: z.enum(["photon", "fake"]),
  handle: z.string().min(1),
  status: MessagingIdentityStatus,
  provider_space_id: z.string().nullable(),
  provider_sender_id: z.string().nullable(),
  joined_at: UtcString.nullable(),
  opted_out_at: UtcString.nullable(),
});
export type MessagingIdentity = z.infer<typeof MessagingIdentity>;

export const PolicyConfig = z.strictObject({
  policy_id: z.string().min(1),
  policy_version: z.string().min(1),
  allowed_handling_modes: z.array(HandlingMode),
  allowed_preparation_types: z.array(PreparationType),
  require_temperature_log: z.boolean(),
  min_pickup_lead_minutes: z.number().int().min(0),
  response_window_seconds: z.number().int().min(1),
  offer_wave_size: z.number().int().min(1),
  handoff_buffer_minutes: z.number().int().min(0),
  max_transit_minutes: z.number().int().min(1),
  average_speed_kmh: z.number().positive(),
  max_servings: z.number().int().min(1),
  demo_accelerated: z.boolean(),
});
export type PolicyConfig = z.infer<typeof PolicyConfig>;

export const MatchCandidate = z.strictObject({
  recipient_id: Uuid,
  courier_id: Uuid,
  eta_to_pickup_minutes: z.number().int(),
  transit_minutes: z.number().int(),
  estimated_pickup_at: UtcString,
  estimated_dropoff_at: UtcString,
  slack_minutes: z.number().int(),
  rank: z.number().int().min(1),
});
export type MatchCandidate = z.infer<typeof MatchCandidate>;
