import { describe, expect, it } from "vitest";
import { z } from "zod";
import { scene1_eligible_facts } from "@/contracts/fixtures/scenes";
import { evaluateEligibility, findCandidates } from "@/core";
import { canTransition } from "@/core/state";
import { parseUtc } from "@/core/time";
import { DEMO_POLICY, type CourierProfile, type DonorProfile, type RecipientOrg } from "@/core/types";

// Regression tests for the ECC review of Dev 2's lane (third round). Each test failed before its fix.

const NOW = new Date("2026-10-17T23:10:00.000Z");
const iso = (min: number) => new Date(NOW.getTime() + min * 60_000).toISOString();
const donor = { approval_status: "approved", licensed_food_establishment: true } as unknown as DonorProfile;
const gate = (facts: Record<string, unknown> = {}, policy = DEMO_POLICY) =>
  evaluateEligibility({ facts: { ...scene1_eligible_facts, ...facts } as never, donor, policy, now: NOW });

describe("S-11: a donor can never cancel food that was already collected", () => {
  const ctx = { now: NOW, effective_cutoff_at: iso(60), collected_at: iso(-10), authorized_owner: true };
  it("needs_review after a post-pickup courier STOP (S-17): donor cancel is refused", () => {
    expect(canTransition({ from: "needs_review", to: "canceled", trigger: "donorCancel", ctx }).ok).toBe(false);
  });
  it("the operator can still cancel it with a note", () => {
    expect(canTransition({ from: "needs_review", to: "canceled", trigger: "operatorCancel", ctx: { ...ctx, actor_role: "operator", note: "followed up" } }).ok).toBe(true);
  });
  it("a donor can still cancel an uncollected needs_review donation they own", () => {
    expect(canTransition({ from: "needs_review", to: "canceled", trigger: "donorCancel", ctx: { ...ctx, collected_at: null } }).ok).toBe(true);
  });
});

describe("field_states: an unknown value is never shown as donor_verified", () => {
  it("temperature_log_available = unknown with the log not required reads as unknown", () => {
    const d = gate({ temperature_log_available: "unknown" }, { ...DEMO_POLICY, require_temperature_log: false });
    expect(d.field_states.temperature_log_available).toBe("unknown");
    expect(d.outcome).toBe("eligible"); // the policy does not require it, so no reason is raised
  });
  it("every field whose value is unknown or null reads as unknown, whatever the policy", () => {
    const d = gate({ temperature_log_available: "unknown", discard_by: "2026-10-18T05:00:00.000Z" }, { ...DEMO_POLICY, require_temperature_log: false });
    for (const [field, state] of Object.entries(d.field_states)) {
      const value = field.startsWith("allergens.") ? (scene1_eligible_facts.allergens as Record<string, string>)[field.slice(10)] : (scene1_eligible_facts as Record<string, unknown>)[field];
      if (value === "unknown") expect(state, field).toBe("unknown");
    }
  });
});

describe("G-10: a broken minimum lead time fails closed", () => {
  it.each([NaN, -1, Infinity, undefined as never])("min_pickup_lead_minutes %s throws instead of letting the check pass", (lead) => {
    expect(() => gate({}, { ...DEMO_POLICY, min_pickup_lead_minutes: lead })).toThrow(/min_pickup_lead_minutes/);
  });
  it("0 is a valid lead time", () => {
    expect(() => gate({ donor_pickup_by: iso(1) }, { ...DEMO_POLICY, min_pickup_lead_minutes: 0 })).not.toThrow();
  });
});

describe("parseUtc matches z.iso.datetime(): only real calendar instants count", () => {
  const zod = z.iso.datetime();
  const cases = [
    "2026-10-17T10:00:00Z", "2026-10-17T10:00:00.5Z", "2026-10-17T10:00:00.123456Z", "2028-02-29T00:00:00Z", "2026-12-31T23:59:59Z",
    "2026-10-17T10:00Z", "2026-02-30T10:00:00Z", "2026-02-29T00:00:00Z", "2026-10-17T24:00:00Z", "2026-10-17T10:60:00Z",
    "2026-10-17T10:00:60Z", "2026-13-01T00:00:00Z", "2026-00-10T00:00:00Z", "2026-04-31T00:00:00Z", "2026-10-17T10:00:00+00:00",
    "2026-10-17", "1", "12345", "", " 2026-10-17T10:00:00Z", "2026-10-17T10:00:00Z ",
  ];
  it.each(cases)("%j agrees with Zod", (s) => {
    expect(Number.isFinite(parseUtc(s)), s).toBe(zod.safeParse(s).success);
  });
  it("a valid string parses to the right instant", () => {
    expect(parseUtc("2026-10-17T23:10:00.000Z")).toBe(NOW.getTime());
  });
});

describe("M-03/M-04 do not rely on the gate having run first (findCandidates is public)", () => {
  const loc = { lat: 47.6, lng: -122.32, area_label: "x", address_line: "a" };
  const recipient = (over: Partial<RecipientOrg> = {}): RecipientOrg => ({
    id: "r1", display_name: "R (synthetic)", approval_status: "approved", registered_dfdo: true, serves_highly_susceptible_population: false,
    accepts_handling_modes: ["refrigerated"], excluded_allergens: [], capacity_servings_available: 200, receiving_closes_at: iso(600),
    location: { ...loc, lat: 47.62 }, is_synthetic: true, ...over,
  });
  const courier: CourierProfile = {
    id: "cA", display_name: "C (synthetic)", approval_status: "approved", affiliated_recipient_ids: ["r1", "r2"], capabilities: { cold_transport: true },
    available_until: iso(600), location: { ...loc, lat: 47.61 }, is_synthetic: true,
  };
  const run = (facts: Record<string, unknown>, recipients = [recipient()], policy = DEMO_POLICY) =>
    findCandidates({
      donation: { id: "d", donor_location: { lat: 47.6, lng: -122.32 } },
      facts: { ...scene1_eligible_facts, donor_pickup_by: iso(300), discard_by: iso(900), ...facts } as never,
      recipients, couriers: [courier], identities: [{ actor_role: "courier", actor_id: "cA", status: "joined", provider: "fake" }],
      policy, now: NOW, excluded_courier_ids: [], busy_courier_ids: [], committed_servings: {}, active_provider: "fake",
    });
  const peanutsExcluded = () => recipient({ excluded_allergens: ["peanuts"] });
  const allergens = (peanuts: string) => ({ allergens: { ...scene1_eligible_facts.allergens, peanuts } });

  it("control: an excluded allergen declared absent matches", () => {
    expect(run(allergens("not_in_listed_ingredients"), [peanutsExcluded()])).toHaveLength(1);
  });
  it.each(["present", "unknown", "maybe", undefined, null])("an excluded allergen with value %j is treated as present", (v) => {
    expect(run(allergens(v as never), [peanutsExcluded()])).toEqual([]);
  });
  it("undeclared cross-contact keeps out every recipient that excludes any allergen, but not one that excludes none", () => {
    const out = run({ cross_contact_status: "unknown" }, [peanutsExcluded(), recipient({ id: "r2" })]);
    expect(out.map((c) => c.recipient_id)).toEqual(["r2"]);
  });
  it.each([0, -1, 2.5, NaN, 501, Infinity, "24", null, undefined])("servings %j is refused (integer from 1 to max_servings)", (servings) => {
    expect(run({ servings })).toEqual([]);
  });
  it("servings at the limits are accepted", () => {
    expect(run({ servings: 1 })).toHaveLength(1);
    expect(run({ servings: DEMO_POLICY.max_servings }, [recipient({ capacity_servings_available: 1000 })])).toHaveLength(1);
  });
});

describe("cutoff resolution (CONTRACTS section 7, D-038): stored cutoff, else min(pickup, discard) from the facts, else due", () => {
  const base = { now: NOW, collected_at: null as string | null };
  const expires = (extra: Record<string, unknown>) => canTransition({ from: "eligible", to: "expired", trigger: "expireDue", ctx: { ...base, effective_cutoff_at: null, ...extra } as never }).ok;
  const backToEligible = (extra: Record<string, unknown>) =>
    canTransition({ from: "offered", to: "eligible", trigger: "expireDue", ctx: { ...base, effective_cutoff_at: null, live_offer_count: 0, ...extra } as never }).ok;

  it("a stored cutoff wins over the facts", () => {
    expect(expires({ effective_cutoff_at: iso(30), donor_pickup_by: iso(-60) })).toBe(false);
    expect(expires({ effective_cutoff_at: iso(-1), donor_pickup_by: iso(600) })).toBe(true);
  });
  it("with no stored cutoff, the earlier of pickup and discard-by decides", () => {
    expect(expires({ donor_pickup_by: iso(60), discard_by: iso(-5) })).toBe(true); // discard-by already passed
    expect(expires({ donor_pickup_by: iso(-5), discard_by: iso(600) })).toBe(true); // pickup already passed
    expect(expires({ donor_pickup_by: iso(60), discard_by: iso(120) })).toBe(false);
    expect(backToEligible({ donor_pickup_by: iso(60), discard_by: iso(120) })).toBe(true);
    expect(backToEligible({ donor_pickup_by: iso(60), discard_by: iso(-5) })).toBe(false);
  });
  it("a null, missing or unparseable discard-by is ignored, the pickup time still counts", () => {
    for (const discard_by of [null, undefined, "junk", "1"]) {
      expect(expires({ donor_pickup_by: iso(60), discard_by }), String(discard_by)).toBe(false);
      expect(expires({ donor_pickup_by: iso(-1), discard_by }), String(discard_by)).toBe(true);
    }
  });
  it("no cutoff can be resolved at all: the donation is due, and the guards that need time left refuse", () => {
    expect(expires({})).toBe(true);
    expect(expires({ donor_pickup_by: "junk", discard_by: iso(60) })).toBe(true);
    expect(backToEligible({})).toBe(false);
  });
  it("an invalid clock is neither before nor after any cutoff", () => {
    const now = new Date("nope");
    expect(canTransition({ from: "eligible", to: "expired", trigger: "expireDue", ctx: { now, effective_cutoff_at: iso(-60), collected_at: null } }).ok).toBe(false);
    expect(canTransition({ from: "eligible", to: "expired", trigger: "expireDue", ctx: { now, effective_cutoff_at: null, collected_at: null } }).ok).toBe(false);
    expect(canTransition({ from: "offered", to: "eligible", trigger: "expireDue", ctx: { now, effective_cutoff_at: iso(60), collected_at: null, live_offer_count: 0 } }).ok).toBe(false);
  });
});

describe("v0.5 matching inputs: committed servings and the active provider", () => {
  const loc = { lat: 47.6, lng: -122.32, area_label: "x", address_line: "a" };
  const rec: RecipientOrg = {
    id: "r1", display_name: "R", approval_status: "approved", registered_dfdo: true, serves_highly_susceptible_population: false,
    accepts_handling_modes: ["refrigerated"], excluded_allergens: [], capacity_servings_available: 40, receiving_closes_at: iso(600),
    location: { ...loc, lat: 47.62 }, is_synthetic: true,
  };
  const cou: CourierProfile = {
    id: "cA", display_name: "C", approval_status: "approved", affiliated_recipient_ids: ["r1"], capabilities: { cold_transport: true },
    available_until: iso(600), location: { ...loc, lat: 47.61 }, is_synthetic: true,
  };
  const run = (over: Record<string, unknown> = {}) =>
    findCandidates({
      donation: { id: "d", donor_location: { lat: 47.6, lng: -122.32 } },
      facts: { ...scene1_eligible_facts, servings: 24, donor_pickup_by: iso(300), discard_by: iso(900) } as never,
      recipients: [rec], couriers: [cou], identities: [{ actor_role: "courier", actor_id: "cA", status: "joined", provider: "fake" }],
      policy: DEMO_POLICY, now: NOW, excluded_courier_ids: [], busy_courier_ids: [], committed_servings: {}, active_provider: "fake", ...over,
    } as never);

  it("M-04 subtracts what the recipient has already committed to (24 needed, 40 free)", () => {
    expect(run()).toHaveLength(1);
    expect(run({ committed_servings: { r1: 16 } })).toHaveLength(1); // 24 left, 24 needed: exactly enough
    expect(run({ committed_servings: { r1: 17 } })).toEqual([]); // 23 left
    expect(run({ committed_servings: { other: 999 } })).toHaveLength(1); // a missing key means 0
  });
  it.each([null, [], "x", { r1: -1 }, { r1: NaN }, { r1: "5" }, undefined])("a malformed committed_servings %j returns no candidates at all", (v) => {
    expect(run({ committed_servings: v })).toEqual([]);
  });
  it("M-05 only counts identities of the active provider", () => {
    const photonOnly = [{ actor_role: "courier", actor_id: "cA", status: "joined", provider: "photon" }];
    expect(run({ identities: photonOnly })).toEqual([]); // fake mode, courier only joined on photon
    expect(run({ identities: photonOnly, active_provider: "photon" })).toHaveLength(1);
    expect(run({ identities: [...photonOnly, { actor_role: "courier", actor_id: "cA", status: "opted_out", provider: "fake" }] })).toEqual([]);
  });
  it.each(["real", "sms", "", null, undefined])("an active_provider of %j returns no candidates (a gateway mode is not a provider)", (v) => {
    expect(run({ active_provider: v })).toEqual([]);
  });
  it("an identity with an unknown provider poisons the whole call: [] never a partial list", () => {
    expect(run({ identities: [{ actor_role: "courier", actor_id: "cA", status: "joined", provider: "fake" }, { actor_role: "courier", actor_id: "zz", status: "joined", provider: "sms" }] })).toEqual([]);
  });
  it("non-array busy or excluded lists return [] (M-08 and M-09 cannot be skipped)", () => {
    for (const k of ["busy_courier_ids", "excluded_courier_ids"]) {
      expect(run({ [k]: "cA" })).toEqual([]);
      expect(run({ [k]: [1] })).toEqual([]);
      expect(run({ [k]: undefined })).toEqual([]);
    }
  });
});
