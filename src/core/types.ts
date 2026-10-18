import type { PolicyConfig } from "@/contracts";

// The profile, policy and candidate types are the shared contract types (contracts-2, CONTRACTS section 3.1, 3.5, 3.12).
// Only the demo policy values live here.
export type {
  CourierProfile,
  DonorProfile,
  GeoLocation,
  MatchCandidate,
  MatchIdentity,
  MessagingIdentity,
  PolicyConfig,
  RecipientOrg,
} from "@/contracts";

/** CONTRACTS section 3.12 demo values. */
export const DEMO_POLICY: PolicyConfig = {
  policy_id: "annona-prototype-refrigerated",
  policy_version: "2026-10-17.1",
  allowed_handling_modes: ["refrigerated"],
  allowed_preparation_types: ["prepared_cold", "commercially_packaged"],
  require_temperature_log: true,
  min_pickup_lead_minutes: 15,
  response_window_seconds: 60,
  offer_wave_size: 1,
  handoff_buffer_minutes: 10,
  max_transit_minutes: 45,
  average_speed_kmh: 25,
  max_servings: 500,
  demo_accelerated: true,
};
