import { describe, expect, it } from "vitest";
import { REASON_CODE_SEVERITY } from "@/contracts";
import { scene1_eligible_facts } from "@/contracts/fixtures/scenes";
import { classifyUnmatched, findCandidates, type MatchInput } from "@/core";
import { DEMO_POLICY, type CourierProfile, type MessagingIdentityLite, type RecipientOrg } from "@/core/types";

const NOW = new Date("2026-10-17T23:10:00.000Z");
const iso = (min: number) => new Date(NOW.getTime() + min * 60_000).toISOString();
const loc = (lat: number, lng: number) => ({ lat, lng, area_label: "x", address_line: "addr" });

const mkRecipient = (id: string, over: Partial<RecipientOrg> = {}): RecipientOrg => ({
  id,
  display_name: `Recipient ${id} (synthetic)`,
  approval_status: "approved",
  registered_dfdo: true,
  serves_highly_susceptible_population: false,
  accepts_handling_modes: ["refrigerated"],
  excluded_allergens: [],
  capacity_servings_available: 200,
  receiving_closes_at: iso(600),
  location: loc(47.65, -122.3),
  is_synthetic: true,
  ...over,
});
const mkCourier = (id: string, recips: string[], over: Partial<CourierProfile> = {}): CourierProfile => ({
  id,
  display_name: `Courier ${id} (synthetic)`,
  approval_status: "approved",
  affiliated_recipient_ids: recips,
  capabilities: { cold_transport: true },
  available_until: iso(600),
  location: loc(47.62, -122.33),
  is_synthetic: true,
  ...over,
});
const joined = (courierId: string): MessagingIdentityLite => ({
  id: `i-${courierId}`,
  actor_role: "courier",
  actor_id: courierId,
  status: "joined",
});

type Facts = typeof scene1_eligible_facts;
const facts = (m: Partial<Facts>): Facts => ({ ...scene1_eligible_facts, ...m });
// Pickup/discard far enough out that M-10 never limits unless a test says so.
const LOOSE: Partial<Facts> = { donor_pickup_by: iso(300), discard_by: iso(900) };

const base = (over: Partial<MatchInput> = {}): MatchInput => ({
  donation: { id: "d1", donor_location: { lat: 47.6, lng: -122.32 } },
  facts: facts(LOOSE),
  recipients: [mkRecipient("r1")],
  couriers: [mkCourier("cA", ["r1"])],
  identities: [joined("cA")],
  policy: DEMO_POLICY,
  now: NOW,
  excluded_courier_ids: [],
  ...over,
});

describe("T-CO-12 ineligible recipients are excluded (M-01..M-04)", () => {
  it("control: a valid recipient/courier pair is a candidate with rank 1", () => {
    const c = findCandidates(base());
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ recipient_id: "r1", courier_id: "cA", rank: 1 });
  });

  const cases: Array<[string, Partial<RecipientOrg>]> = [
    ["M-01 pending", { approval_status: "pending" }],
    ["M-01 suspended", { approval_status: "suspended" }],
    ["M-01 registered_dfdo=false", { registered_dfdo: false }],
    ["M-01 serves highly susceptible population", { serves_highly_susceptible_population: true }],
    ["M-02 handling mismatch", { accepts_handling_modes: ["ambient"] }],
    ["M-03 excluded allergen present", { excluded_allergens: ["milk"] }],
    ["M-04 insufficient capacity", { capacity_servings_available: 23 }],
  ];
  it.each(cases)("T-CO-12 %s -> recipient excluded", (_name, over) => {
    expect(findCandidates(base({ recipients: [mkRecipient("r1", over)] }))).toEqual([]);
  });

  it("T-CO-12 M-03 excluded allergen present only via cross-contact -> excluded", () => {
    const f = facts({ ...LOOSE, cross_contact_status: "declared", cross_contact_allergens: ["peanuts"] });
    const r = mkRecipient("r1", { excluded_allergens: ["peanuts", "tree_nuts"] });
    expect(findCandidates(base({ facts: f, recipients: [r] }))).toEqual([]);
  });
  it("T-CO-12 M-03 not_in_listed_ingredients does not trigger an exclusion", () => {
    const r = mkRecipient("r1", { excluded_allergens: ["peanuts", "tree_nuts"] });
    expect(findCandidates(base({ recipients: [r] }))).toHaveLength(1);
  });
  it("T-CO-12 M-04 capacity used up by committed_servings of another donation (F5)", () => {
    const r = mkRecipient("r1", { capacity_servings_available: 30 });
    expect(findCandidates(base({ recipients: [r], committed_servings: { r1: 10 } }))).toEqual([]); // 20 < 24
    expect(findCandidates(base({ recipients: [r], committed_servings: { r1: 6 } }))).toHaveLength(1); // 24 >= 24
  });
  it("T-CO-12 an excluded recipient does not hide a valid one", () => {
    const bad = mkRecipient("r0", { serves_highly_susceptible_population: true });
    const good = mkRecipient("r1");
    const c = findCandidates(base({ recipients: [bad, good], couriers: [mkCourier("cA", ["r0", "r1"])] }));
    expect(c.map((x) => x.recipient_id)).toEqual(["r1"]);
  });
});

describe("T-CO-13 courier rules and ranking (M-05..M-10)", () => {
  it("M-05 awaiting_join / opted_out / missing identity excluded", () => {
    for (const status of ["awaiting_join", "opted_out"] as const) {
      expect(findCandidates(base({ identities: [{ ...joined("cA"), status }] }))).toEqual([]);
    }
    expect(findCandidates(base({ identities: [] }))).toEqual([]);
  });
  it("M-05 courier not approved excluded", () => {
    expect(findCandidates(base({ couriers: [mkCourier("cA", ["r1"], { approval_status: "suspended" })] }))).toEqual([]);
  });
  it("M-06 not affiliated with the recipient excluded", () => {
    expect(findCandidates(base({ couriers: [mkCourier("cA", ["other"])] }))).toEqual([]);
  });
  it("M-07 refrigerated needs cold transport", () => {
    const c = mkCourier("cA", ["r1"], { capabilities: { cold_transport: false } });
    expect(findCandidates(base({ couriers: [c] }))).toEqual([]);
  });
  it("M-08 already offered couriers excluded", () => {
    expect(findCandidates(base({ excluded_courier_ids: ["cA"] }))).toEqual([]);
  });
  it("M-09 courier with another live offer or active assignment excluded", () => {
    expect(findCandidates(base({ busy_courier_ids: ["cA"] }))).toEqual([]);
  });
  it("ranking: dropoff ascending, then courier_id ascending; ranks are 1..n", () => {
    const near = mkCourier("cB", ["r1"], { location: loc(47.61, -122.32) });
    const tie = mkCourier("cD", ["r1"], { location: loc(47.61, -122.32) });
    const far = mkCourier("cA", ["r1"], { location: loc(47.75, -122.2) });
    const c = findCandidates(base({ couriers: [far, tie, near], identities: ["cA", "cB", "cD"].map(joined) }));
    expect(c.map((x) => x.courier_id)).toEqual(["cB", "cD", "cA"]);
    expect(c.map((x) => x.rank)).toEqual([1, 2, 3]);
  });
  it("is deterministic regardless of input order", () => {
    const cs = [mkCourier("cA", ["r1"]), mkCourier("cB", ["r1"])];
    const ids = ["cA", "cB"].map(joined);
    const a = findCandidates(base({ couriers: cs, identities: ids }));
    const b = findCandidates(base({ couriers: [...cs].reverse(), identities: [...ids].reverse() }));
    expect(a).toEqual(b);
  });
  it("candidate fields: whole-minute ETA/transit (rounded up), ISO times, slack", () => {
    const [c] = findCandidates(base());
    expect(Number.isInteger(c!.eta_to_pickup_minutes)).toBe(true);
    expect(Number.isInteger(c!.transit_minutes)).toBe(true);
    const pickup = NOW.getTime() + DEMO_POLICY.response_window_seconds * 1000 + c!.eta_to_pickup_minutes * 60_000;
    expect(c!.estimated_pickup_at).toBe(new Date(pickup).toISOString());
    const dropoff = pickup + (c!.transit_minutes + DEMO_POLICY.handoff_buffer_minutes) * 60_000;
    expect(c!.estimated_dropoff_at).toBe(new Date(dropoff).toISOString());
    expect(c!.slack_minutes).toBeGreaterThan(0);
  });

  describe("M-10 feasibility boundaries", () => {
    const probe = () => findCandidates(base())[0]!;
    it("est_pickup == donor_pickup_by passes; one second earlier fails", () => {
      const at = Date.parse(probe().estimated_pickup_at);
      const ok = base({ facts: facts({ donor_pickup_by: new Date(at).toISOString(), discard_by: iso(900) }) });
      const no = base({ facts: facts({ donor_pickup_by: new Date(at - 1000).toISOString(), discard_by: iso(900) }) });
      expect(findCandidates(ok)).toHaveLength(1);
      expect(findCandidates(no)).toEqual([]);
    });
    it("est_dropoff == discard_by passes; one second earlier fails", () => {
      const at = Date.parse(probe().estimated_dropoff_at);
      const ok = base({ facts: facts({ donor_pickup_by: iso(300), discard_by: new Date(at).toISOString() }) });
      const no = base({ facts: facts({ donor_pickup_by: iso(300), discard_by: new Date(at - 1000).toISOString() }) });
      expect(findCandidates(ok)).toHaveLength(1);
      expect(findCandidates(no)).toEqual([]);
    });
    it("est_dropoff vs recipient.receiving_closes_at and courier.available_until", () => {
      const at = Date.parse(probe().estimated_dropoff_at);
      const rec = (ms: number) => [mkRecipient("r1", { receiving_closes_at: new Date(ms).toISOString() })];
      const cou = (ms: number) => [mkCourier("cA", ["r1"], { available_until: new Date(ms).toISOString() })];
      expect(findCandidates(base({ recipients: rec(at) }))).toHaveLength(1);
      expect(findCandidates(base({ recipients: rec(at - 1000) }))).toEqual([]);
      expect(findCandidates(base({ couriers: cou(at) }))).toHaveLength(1);
      expect(findCandidates(base({ couriers: cou(at - 1000) }))).toEqual([]);
    });
    it("transit_minutes > max_transit_minutes fails; equal passes", () => {
      const t = probe().transit_minutes;
      expect(findCandidates(base({ policy: { ...DEMO_POLICY, max_transit_minutes: t - 1 } }))).toEqual([]);
      expect(findCandidates(base({ policy: { ...DEMO_POLICY, max_transit_minutes: t } }))).toHaveLength(1);
    });
    it("discard_by null is no feasibility limit (the gate handles the missing value)", () => {
      expect(findCandidates(base({ facts: facts({ donor_pickup_by: iso(300), discard_by: null }) }))).toHaveLength(1);
    });
  });
});

describe("T-CO-14 (pure part) unmatched reason selection", () => {
  it("no feasible pair even without exclusions -> NO_ELIGIBLE_MATCH", () => {
    expect(classifyUnmatched(base({ identities: [] }))).toBe("NO_ELIGIBLE_MATCH");
  });
  it("feasible couriers exist but all were already offered -> CANDIDATES_EXHAUSTED", () => {
    expect(classifyUnmatched(base({ excluded_courier_ids: ["cA"] }))).toBe("CANDIDATES_EXHAUSTED");
  });
  it("excluded couriers that are not feasible anyway -> NO_ELIGIBLE_MATCH", () => {
    expect(classifyUnmatched(base({ excluded_courier_ids: ["cA"], identities: [] }))).toBe("NO_ELIGIBLE_MATCH");
  });
  it("both reasons are severity dispatch", () => {
    expect(REASON_CODE_SEVERITY.NO_ELIGIBLE_MATCH).toBe("dispatch");
    expect(REASON_CODE_SEVERITY.CANDIDATES_EXHAUSTED).toBe("dispatch");
  });
});
