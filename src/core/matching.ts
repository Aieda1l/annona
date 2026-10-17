import { ALLERGENS, type ReasonCode, type VerifiedFacts } from "@/contracts";
import type {
  CourierProfile,
  MatchCandidate,
  MessagingIdentityLite,
  PolicyConfig,
  RecipientOrg,
} from "./types";

// CONTRACTS §6 matching and feasibility (M-01..M-10). Pure: no I/O, no clock reads.

export type MatchInput = {
  donation: { id: string; donor_location: { lat: number; lng: number } };
  facts: VerifiedFacts;
  recipients: RecipientOrg[];
  couriers: CourierProfile[];
  identities: MessagingIdentityLite[];
  policy: PolicyConfig;
  now: Date;
  /** M-08: couriers already offered this donation. */
  excluded_courier_ids: string[];
  /** M-09: couriers holding any pending_send/open offer or a claimed/collected assignment (any donation). */
  busy_courier_ids?: string[];
  /** M-04: derived Σ servings of claimed/collected/delivered donations per recipient (never decremented). */
  committed_servings?: Record<string, number>;
};

const MIN = 60_000;

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const minutesFor = (km: number, speedKmh: number) => Math.ceil((km / speedKmh) * 60);

/** M-01..M-04 for one recipient. */
function recipientEligible(r: RecipientOrg, input: MatchInput): boolean {
  const { facts } = input;
  if (r.approval_status !== "approved") return false; // M-01
  if (!r.registered_dfdo || r.serves_highly_susceptible_population) return false; // M-01
  if (!r.accepts_handling_modes.includes(facts.handling_mode)) return false; // M-02
  const present = new Set<string>([
    ...ALLERGENS.filter((a) => facts.allergens[a] === "present"),
    ...facts.cross_contact_allergens,
  ]);
  if (r.excluded_allergens.some((a) => present.has(a))) return false; // M-03
  const committed = input.committed_servings?.[r.id] ?? 0;
  if (r.capacity_servings_available - committed < facts.servings) return false; // M-04
  return true;
}

export function findCandidates(input: MatchInput): MatchCandidate[] {
  const { facts, policy, now, donation } = input;
  const excluded = new Set(input.excluded_courier_ids);
  const busy = new Set(input.busy_courier_ids ?? []);
  const joined = new Set(
    input.identities.filter((i) => i.actor_role === "courier" && i.status === "joined").map((i) => i.actor_id),
  );

  const pickupBy = Date.parse(facts.donor_pickup_by);
  const discardBy = facts.discard_by === null ? Number.POSITIVE_INFINITY : Date.parse(facts.discard_by);
  const effectiveCutoff = Math.min(pickupBy, discardBy);

  const out: Array<Omit<MatchCandidate, "rank">> = [];
  for (const r of input.recipients) {
    if (!recipientEligible(r, input)) continue;
    const transit = minutesFor(haversineKm(donation.donor_location, r.location), policy.average_speed_kmh);
    if (transit > policy.max_transit_minutes) continue; // M-10

    for (const c of input.couriers) {
      if (c.approval_status !== "approved" || !joined.has(c.id)) continue; // M-05
      if (!c.affiliated_recipient_ids.includes(r.id)) continue; // M-06
      if (facts.handling_mode === "refrigerated" && !c.capabilities.cold_transport) continue; // M-07
      if (excluded.has(c.id)) continue; // M-08
      if (busy.has(c.id)) continue; // M-09

      // M-10 feasibility
      const eta = minutesFor(haversineKm(c.location, donation.donor_location), policy.average_speed_kmh);
      const estPickup = now.getTime() + policy.response_window_seconds * 1000 + eta * MIN;
      const estDropoff = estPickup + (transit + policy.handoff_buffer_minutes) * MIN;
      const closes = Date.parse(r.receiving_closes_at);
      const availableUntil = Date.parse(c.available_until);
      if (estPickup > pickupBy) continue;
      if (estDropoff > Math.min(discardBy, closes, availableUntil)) continue;

      out.push({
        recipient_id: r.id,
        courier_id: c.id,
        eta_to_pickup_minutes: eta,
        transit_minutes: transit,
        estimated_pickup_at: new Date(estPickup).toISOString(),
        estimated_dropoff_at: new Date(estDropoff).toISOString(),
        slack_minutes: Math.floor((Math.min(effectiveCutoff, closes, availableUntil) - estDropoff) / MIN),
      });
    }
  }

  // Deterministic rank: dropoff ascending, then courier_id, then recipient_id (tie-break for stable output).
  out.sort(
    (a, b) =>
      Date.parse(a.estimated_dropoff_at) - Date.parse(b.estimated_dropoff_at) ||
      a.courier_id.localeCompare(b.courier_id) ||
      a.recipient_id.localeCompare(b.recipient_id),
  );
  return out.map((c, i) => ({ ...c, rank: i + 1 }));
}

/**
 * Which dispatch reason (severity `dispatch`) applies when no candidate remains (S-05).
 * CANDIDATES_EXHAUSTED: pairs would be feasible but every such courier was already offered.
 * NO_ELIGIBLE_MATCH: nothing is feasible even without the exclusions.
 */
export function classifyUnmatched(input: MatchInput): Extract<ReasonCode, "NO_ELIGIBLE_MATCH" | "CANDIDATES_EXHAUSTED"> {
  const withoutExclusions = findCandidates({ ...input, excluded_courier_ids: [] });
  return withoutExclusions.length > 0 ? "CANDIDATES_EXHAUSTED" : "NO_ELIGIBLE_MATCH";
}
