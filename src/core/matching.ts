import { ALLERGENS, type ReasonCode, type VerifiedFacts } from "@/contracts";
import type {
  CourierProfile,
  MatchCandidate,
  MessagingIdentityLite,
  PolicyConfig,
  RecipientOrg,
} from "./types";
import { parseUtc } from "./time";

// CONTRACTS §6 matching and feasibility (M-01..M-10). Pure: no I/O, no clock reads.
// Input is exactly the §6 list. Not decidable from it, so enforced elsewhere (CONTRACTS §6, §8.1 step 8):
//   M-09 (busy courier): partial unique index + `ON CONFLICT DO NOTHING` in createNextOffers.
//   M-04 net of committed servings: re-checked under the recipient lock at claim. Here M-04 uses the raw capacity.

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
};

const MIN = 60_000;

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// Plain code-unit ordering: locale-independent, matches CONTRACTS §3.5 "ascending".
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

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
  // Positive form: NaN or undefined capacity or servings must refuse, not pass.
  if (![r.capacity_servings_available, facts.servings].every(Number.isFinite)) return false; // M-04
  if (!(r.capacity_servings_available >= facts.servings)) return false; // M-04
  return true;
}

export function findCandidates(input: MatchInput): MatchCandidate[] {
  const { facts, policy, now, donation } = input;
  // Fail closed: NaN comparisons are false, which would otherwise read as "feasible".
  if (!Number.isFinite(now.getTime()) || !(policy.average_speed_kmh > 0)) return [];
  const policyNumbers = [policy.response_window_seconds, policy.handoff_buffer_minutes, policy.max_transit_minutes];
  if (!policyNumbers.every((n) => Number.isFinite(n) && n >= 0)) return [];
  // Malformed facts (callers should pass Zod-parsed facts) cannot be matched.
  if (!facts.allergens || !Array.isArray(facts.cross_contact_allergens)) return [];
  const excluded = new Set(input.excluded_courier_ids);
  const joined = new Set(
    input.identities.filter((i) => i.actor_role === "courier" && i.status === "joined").map((i) => i.actor_id),
  );

  const pickupBy = parseUtc(facts.donor_pickup_by);
  const discardBy = facts.discard_by === null ? Number.POSITIVE_INFINITY : parseUtc(facts.discard_by);
  if (!Number.isFinite(pickupBy) || Number.isNaN(discardBy)) return [];
  const effectiveCutoff = Math.min(pickupBy, discardBy);

  const out: Array<Omit<MatchCandidate, "rank">> = [];
  for (const r of input.recipients) {
    if (!recipientEligible(r, input)) continue;
    const transit = minutesFor(haversineKm(donation.donor_location, r.location), policy.average_speed_kmh);
    const closes = parseUtc(r.receiving_closes_at);
    if (!Number.isFinite(transit) || !Number.isFinite(closes)) continue;
    if (transit > policy.max_transit_minutes) continue; // M-10

    for (const c of input.couriers) {
      if (c.approval_status !== "approved" || !joined.has(c.id)) continue; // M-05
      if (!c.affiliated_recipient_ids.includes(r.id)) continue; // M-06
      if (facts.handling_mode === "refrigerated" && !c.capabilities.cold_transport) continue; // M-07
      if (excluded.has(c.id)) continue; // M-08

      // M-10 feasibility
      const eta = minutesFor(haversineKm(c.location, donation.donor_location), policy.average_speed_kmh);
      const estPickup = now.getTime() + policy.response_window_seconds * 1000 + eta * MIN;
      const estDropoff = estPickup + (transit + policy.handoff_buffer_minutes) * MIN;
      const availableUntil = parseUtc(c.available_until);
      if (!Number.isFinite(eta) || !Number.isFinite(availableUntil)) continue;
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
      cmp(a.courier_id, b.courier_id) ||
      cmp(a.recipient_id, b.recipient_id),
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
