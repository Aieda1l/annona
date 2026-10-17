import type { Allergen, HandlingMode, PreparationType } from "@/contracts";

// Lane-local mirrors of CONTRACTS §3.1 / §3.12 until the captain's contracts-2 PR types them.
// Replace with imports from "@/contracts" when they land; do not diverge from the spec.

export type DonorProfile = {
  id: string;
  display_name: string;
  org_type: "restaurant" | "caterer" | "campus_dining";
  licensed_food_establishment: boolean;
  approval_status: "approved" | "pending" | "suspended";
  location: { lat: number; lng: number; area_label: string; address_line: string };
  is_synthetic: true;
};

export type PolicyConfig = {
  policy_id: string;
  policy_version: string;
  allowed_handling_modes: HandlingMode[];
  allowed_preparation_types: PreparationType[];
  require_temperature_log: boolean;
  min_pickup_lead_minutes: number;
  response_window_seconds: number;
  offer_wave_size: number;
  handoff_buffer_minutes: number;
  max_transit_minutes: number;
  average_speed_kmh: number;
  max_servings: number;
  demo_accelerated: boolean;
};

/** CONTRACTS §3.12 demo values. */
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

export type { Allergen };

// ----- matching inputs (CONTRACTS §3.1, §3.5), lane-local until contracts-2 -----
export type GeoLocation = { lat: number; lng: number; area_label: string; address_line: string };

export type RecipientOrg = {
  id: string;
  display_name: string;
  approval_status: "approved" | "pending" | "suspended";
  registered_dfdo: boolean;
  serves_highly_susceptible_population: boolean;
  accepts_handling_modes: HandlingMode[];
  excluded_allergens: Allergen[];
  capacity_servings_available: number;
  receiving_closes_at: string;
  location: GeoLocation;
  is_synthetic: true;
};

export type CourierProfile = {
  id: string;
  display_name: string;
  approval_status: "approved" | "pending" | "suspended";
  affiliated_recipient_ids: string[];
  capabilities: { cold_transport: boolean };
  available_until: string;
  location: GeoLocation;
  is_synthetic: true;
};

export type MessagingIdentityLite = {
  id: string;
  actor_role: "courier" | "donor" | "recipient";
  actor_id: string;
  status: "awaiting_join" | "joined" | "opted_out";
};

export type MatchCandidate = {
  recipient_id: string;
  courier_id: string;
  eta_to_pickup_minutes: number;
  transit_minutes: number;
  estimated_pickup_at: string;
  estimated_dropoff_at: string;
  slack_minutes: number;
  rank: number;
};
