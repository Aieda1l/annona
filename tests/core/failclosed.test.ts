import { describe, expect, it } from "vitest";
import { scene1_eligible_facts } from "@/contracts/fixtures/scenes";
import { createTestClock, evaluateEligibility, findCandidates } from "@/core";
import { canTransition } from "@/core/state";
import type { MatchInput } from "@/core/matching";
import { DEMO_POLICY, type CourierProfile, type DonorProfile, type RecipientOrg } from "@/core/types";

// Fail-closed regressions: malformed timestamps or coordinates make NaN comparisons return false,
// which would silently pass a guard. Every one of these must refuse or flag review instead.

const NOW = new Date("2026-10-17T23:10:00.000Z");
const donor = { approval_status: "approved", licensed_food_establishment: true } as unknown as DonorProfile;
const gate = (m: Record<string, unknown>) =>
  evaluateEligibility({ facts: { ...scene1_eligible_facts, ...m } as never, donor, policy: DEMO_POLICY, now: NOW });

describe("gate fails closed on unparseable times", () => {
  it("discard_by that is not a date -> not eligible (DISCARD_BY_MISSING)", () => {
    const d = gate({ discard_by: "garbage" });
    expect(d.outcome).not.toBe("eligible");
    expect(d.reasons.map((r) => r.code)).toContain("DISCARD_BY_MISSING");
  });
  it("donor_pickup_by that is not a date -> rejected (PICKUP_WINDOW_PASSED)", () => {
    const d = gate({ donor_pickup_by: "garbage" });
    expect(d.outcome).toBe("rejected");
    expect(d.reasons.map((r) => r.code)).toContain("PICKUP_WINDOW_PASSED");
  });
  it("an invalid `now` is a programmer error: throws, never returns a decision", () => {
    expect(() => evaluateEligibility({ facts: scene1_eligible_facts, donor, policy: DEMO_POLICY, now: new Date("nope") })).toThrow();
  });
});

describe("matching fails closed on malformed numbers and times", () => {
  const junk = [12345, "1", "12345", "2026", "Oct 18 2026", "2026-10-18T05:00:00+02:00", "2026-10-18", {}, true] as const;
  const loc = (lat: number, lng: number) => ({ lat, lng, area_label: "x", address_line: "a" });
  const iso = (min: number) => new Date(NOW.getTime() + min * 60_000).toISOString();
  const recipient: RecipientOrg = {
    id: "r1", display_name: "R (synthetic)", approval_status: "approved", registered_dfdo: true,
    serves_highly_susceptible_population: false, accepts_handling_modes: ["refrigerated"], excluded_allergens: [],
    capacity_servings_available: 200, receiving_closes_at: iso(600), location: loc(47.65, -122.3), is_synthetic: true,
  };
  const courier: CourierProfile = {
    id: "cA", display_name: "C (synthetic)", approval_status: "approved", affiliated_recipient_ids: ["r1"],
    capabilities: { cold_transport: true }, available_until: iso(600), location: loc(47.62, -122.33), is_synthetic: true,
  };
  const base = (o: Partial<MatchInput> = {}): MatchInput => ({
    donation: { id: "d", donor_location: loc(47.6, -122.32) },
    facts: { ...scene1_eligible_facts, donor_pickup_by: iso(300), discard_by: iso(900) },
    recipients: [recipient],
    couriers: [courier],
    identities: [{ id: "i", actor_role: "courier", actor_id: "cA", status: "joined" }],
    policy: DEMO_POLICY,
    now: NOW,
    excluded_courier_ids: [],
    ...o,
  });

  it("control is a candidate", () => expect(findCandidates(base())).toHaveLength(1));
  it.each(junk)("matching refuses facts with discard_by/donor_pickup_by %j", (v) => {
    const f = { ...scene1_eligible_facts, donor_pickup_by: iso(300), discard_by: iso(900) };
    expect(findCandidates(base({ facts: { ...f, discard_by: v } as never }))).toEqual([]);
    expect(findCandidates(base({ facts: { ...f, donor_pickup_by: v } as never }))).toEqual([]);
  });
  it("NaN or undefined recipient capacity -> no candidate (M-04)", () => {
    expect(findCandidates(base({ recipients: [{ ...recipient, capacity_servings_available: NaN }] }))).toEqual([]);
    expect(findCandidates(base({ recipients: [{ ...recipient, capacity_servings_available: undefined as never }] }))).toEqual([]);
  });
  it("NaN servings -> no candidate (M-04)", () => {
    expect(findCandidates(base({ facts: { ...scene1_eligible_facts, donor_pickup_by: iso(300), discard_by: iso(900), servings: NaN } }))).toEqual([]);
  });
  it.each(["response_window_seconds", "handoff_buffer_minutes", "max_transit_minutes"] as const)("NaN policy.%s -> no candidate, no throw", (k) => {
    expect(findCandidates(base({ policy: { ...DEMO_POLICY, [k]: NaN } }))).toEqual([]);
  });
  it("facts missing allergens or cross_contact_allergens -> no candidate, no throw", () => {
    const f = { ...scene1_eligible_facts, donor_pickup_by: iso(300), discard_by: iso(900) };
    expect(findCandidates(base({ facts: { ...f, allergens: undefined } as never }))).toEqual([]);
    expect(findCandidates(base({ facts: { ...f, cross_contact_allergens: undefined } as never }))).toEqual([]);
  });
  it("ties on dropoff rank by plain courier_id order, independent of locale", () => {
    const ids = ["b", "B", "a"];
    const out = findCandidates(base({
      couriers: ids.map((id) => ({ ...courier, id })),
      identities: ids.map((id) => ({ id: "i" + id, actor_role: "courier" as const, actor_id: id, status: "joined" as const })),
    }));
    expect(out.map((c) => c.courier_id)).toEqual(["B", "a", "b"]);
  });
  it("NaN courier coordinates -> no candidate", () => {
    expect(findCandidates(base({ couriers: [{ ...courier, location: loc(NaN, -122.33) }] }))).toEqual([]);
  });
  it("NaN recipient coordinates -> no candidate", () => {
    expect(findCandidates(base({ recipients: [{ ...recipient, location: loc(47.65, NaN) }] }))).toEqual([]);
  });
  it("unparseable receiving_closes_at / available_until / donor_pickup_by -> no candidate", () => {
    expect(findCandidates(base({ recipients: [{ ...recipient, receiving_closes_at: "garbage" }] }))).toEqual([]);
    expect(findCandidates(base({ couriers: [{ ...courier, available_until: "garbage" }] }))).toEqual([]);
    expect(findCandidates(base({ facts: { ...scene1_eligible_facts, donor_pickup_by: "garbage", discard_by: iso(900) } }))).toEqual([]);
  });
  it("unparseable discard_by (non-null) -> no candidate", () => {
    expect(findCandidates(base({ facts: { ...scene1_eligible_facts, donor_pickup_by: iso(300), discard_by: "garbage" } }))).toEqual([]);
  });
  it("zero or negative speed -> no candidate (never an infinite or negative ETA)", () => {
    expect(findCandidates(base({ policy: { ...DEMO_POLICY, average_speed_kmh: 0 } }))).toEqual([]);
    expect(findCandidates(base({ policy: { ...DEMO_POLICY, average_speed_kmh: -5 } }))).toEqual([]);
  });
  it("invalid `now` -> no candidate", () => {
    expect(findCandidates(base({ now: new Date("nope") }))).toEqual([]);
  });
});

describe("state guards fail closed", () => {
  const ctx = { now: NOW, effective_cutoff_at: "2026-10-18T01:30:00.000Z", collected_at: "2026-10-18T00:00:00.000Z" as string | null, simulated: true };
  it("S-10 with discard_by missing from the context (undefined) -> refused, only explicit null means unset", () => {
    expect(canTransition({ from: "collected", to: "delivered", trigger: "recordHandoff", ctx }).ok).toBe(false);
    expect(canTransition({ from: "collected", to: "delivered", trigger: "recordHandoff", ctx: { ...ctx, discard_by: null } }).ok).toBe(true);
  });
  it("S-10 with an unparseable discard_by -> refused", () => {
    expect(canTransition({ from: "collected", to: "delivered", trigger: "recordHandoff", ctx: { ...ctx, discard_by: "garbage" } }).ok).toBe(false);
  });
  it("an invalid `now` refuses every time-guarded transition", () => {
    const bad = { ...ctx, now: new Date("nope"), collected_at: null, live_offer_count: 0, donor_status: "approved" as const, gate_outcome: "eligible" as const };
    expect(canTransition({ from: "claimed", to: "collected", trigger: "recordHandoff", ctx: bad }).ok).toBe(false);
    expect(canTransition({ from: "unmatched", to: "eligible", trigger: "retryMatching", ctx: bad }).ok).toBe(false);
    expect(canTransition({ from: "claimed", to: "expired", trigger: "expireDue", ctx: bad }).ok).toBe(false);
    expect(canTransition({ from: "eligible", to: "expired", trigger: "expireDue", ctx: bad }).ok).toBe(false);
  });
});

describe("test clock", () => {
  it("rejects an unparseable start instead of producing Invalid Date", () => {
    expect(() => createTestClock(new Date("garbage"))).toThrow();
  });
  it("now() returns a fresh Date each call (callers cannot mutate the clock)", () => {
    const c = createTestClock(new Date("2026-10-17T23:10:00.000Z"));
    c.now().setFullYear(1999);
    expect(c.now().toISOString()).toBe("2026-10-17T23:10:00.000Z");
  });
});

describe("gate treats any unexpected value as unknown, never as a pass", () => {
  const fields = [
    "contains_excluded_category",
    "continuous_cold_holding",
    "temperature_log_available",
    "previously_served",
    "covered_food_grade_containers",
    "cross_contact_status",
    "handling_mode",
    "preparation_type",
  ] as const;
  it.each(fields)("%s = undefined or 'maybe' -> not eligible", (field) => {
    for (const bad of [undefined, "maybe"]) {
      expect(gate({ [field]: bad }).outcome, `${field}=${String(bad)}`).not.toBe("eligible");
    }
  });
  it("an allergen entry that is missing or unrecognized -> not eligible with ALLERGEN_UNKNOWN", () => {
    for (const bad of [undefined, "maybe"]) {
      const d = gate({ allergens: { ...scene1_eligible_facts.allergens, sesame: bad } });
      expect(d.outcome).not.toBe("eligible");
      expect(d.reasons.map((r) => r.code)).toContain("ALLERGEN_UNKNOWN");
    }
  });
  it("the control still passes", () => expect(gate({}).outcome).toBe("eligible"));
});

describe("gate fails closed on a missing ingredients_text", () => {
  it("undefined ingredients_text -> INGREDIENTS_MISSING, no throw", () => {
    const d = gate({ ingredients_text: undefined });
    expect(d.reasons.map((r) => r.code)).toContain("INGREDIENTS_MISSING");
    expect(d.outcome).not.toBe("eligible");
  });
});

describe("times must be UTC ISO strings: Date.parse leniency never passes a rule", () => {
  const junk = [12345, "1", "12345", "2026", "Oct 18 2026", "2026-10-18T05:00:00+02:00", "2026-10-18", {}, true] as const;
  it.each(junk)("discard_by %j is treated as missing, never as a future time", (v) => {
    const d = gate({ discard_by: v });
    expect(d.reasons.map((r) => r.code)).toContain("DISCARD_BY_MISSING");
    expect(d.outcome).not.toBe("eligible");
  });
  it.each(junk)("donor_pickup_by %j is rejected, never as a usable window", (v) => {
    const d = gate({ donor_pickup_by: v });
    expect(d.outcome).toBe("rejected");
  });
  it("a junk effective_cutoff_at never lets a cutoff guard pass", () => {
    const ctx = { now: NOW, effective_cutoff_at: "1", collected_at: null };
    expect(canTransition({ from: "eligible", to: "expired", trigger: "expireDue", ctx }).ok).toBe(false);
    expect(canTransition({ from: "offered", to: "eligible", trigger: "expireDue", ctx: { ...ctx, live_offer_count: 0 } }).ok).toBe(false);
  });
});
