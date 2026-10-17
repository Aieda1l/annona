import { describe, expect, it } from "vitest";
import { OFFER_STATUSES } from "@/contracts";
import { scene1_eligible_facts } from "@/contracts/fixtures/scenes";
import { createTestClock, evaluateEligibility, findCandidates } from "@/core";
import { canOfferTransition, canTransition, OFFER_TRANSITIONS, type OfferTrigger } from "@/core/state";
import { DEMO_POLICY, type CourierProfile, type DonorProfile, type PolicyConfig, type RecipientOrg } from "@/core/types";

// Tests that do not take their expected numbers from the implementation (ECC test review, high items).

const NOW = new Date("2026-10-17T23:10:00.000Z");
const at = (min: number) => new Date(NOW.getTime() + min * 60_000);
const iso = (min: number) => at(min).toISOString();
const donor = { approval_status: "approved", licensed_food_establishment: true } as unknown as DonorProfile;
const gate = (facts: Record<string, unknown> = {}, policy: PolicyConfig = DEMO_POLICY) =>
  evaluateEligibility({ facts: { ...scene1_eligible_facts, ...facts } as never, donor, policy, now: NOW });
const codes = (d: ReturnType<typeof gate>) => d.reasons.map((r) => r.code);

describe("G-09 discard-by: the boundary is exactly now", () => {
  it.each([
    ["now - 1 ms", new Date(NOW.getTime() - 1), true],
    ["now", NOW, true],
    ["now + 1 ms", new Date(NOW.getTime() + 1), false],
  ])("%s", (_name, when, rejected) => {
    expect(codes(gate({ discard_by: when.toISOString() })).includes("DISCARD_BY_PASSED")).toBe(rejected);
  });
});

describe("G-10 pickup window: the boundaries are now and now + the policy lead time", () => {
  const lead = DEMO_POLICY.min_pickup_lead_minutes;
  it.each([
    ["now - 1 ms", new Date(NOW.getTime() - 1), "PICKUP_WINDOW_PASSED"],
    ["now", NOW, "PICKUP_WINDOW_PASSED"],
    ["now + 1 ms", new Date(NOW.getTime() + 1), "PICKUP_WINDOW_TOO_SHORT"],
    ["now + lead - 1 ms", new Date(NOW.getTime() + lead * 60_000 - 1), "PICKUP_WINDOW_TOO_SHORT"],
    ["now + lead", at(lead), null],
    ["now + lead + 1 ms", new Date(NOW.getTime() + lead * 60_000 + 1), null],
  ])("%s", (_name, when, expected) => {
    const c = codes(gate({ donor_pickup_by: when.toISOString() })).filter((x) => x.startsWith("PICKUP_WINDOW"));
    expect(c).toEqual(expected ? [expected] : []);
  });
  it("the lead time comes from the policy, not a hard-coded 15", () => {
    const policy = { ...DEMO_POLICY, min_pickup_lead_minutes: 30 };
    expect(codes(gate({ donor_pickup_by: iso(20) }, policy))).toContain("PICKUP_WINDOW_TOO_SHORT");
    expect(codes(gate({ donor_pickup_by: iso(30) }, policy))).not.toContain("PICKUP_WINDOW_TOO_SHORT");
    expect(codes(gate({ donor_pickup_by: iso(5) }, { ...DEMO_POLICY, min_pickup_lead_minutes: 0 }))).not.toContain("PICKUP_WINDOW_TOO_SHORT");
  });
});

describe("gate rules: outcome and field state, not just the reason code (T-CO-04..T-CO-10)", () => {
  const rows: Array<[string, Record<string, unknown>, string, "needs_review" | "rejected", string, string]> = [
    ["handling frozen", { handling_mode: "frozen" }, "HANDLING_OUT_OF_SCOPE", "rejected", "handling_mode", "rejected"],
    ["handling unknown", { handling_mode: "unknown" }, "HANDLING_UNKNOWN", "needs_review", "handling_mode", "unknown"],
    ["cooked then cooled", { preparation_type: "cooked_then_cooled" }, "COOLING_HISTORY_REVIEW", "needs_review", "preparation_type", "needs_review"],
    ["preparation other", { preparation_type: "other" }, "PREPARATION_TYPE_REVIEW", "needs_review", "preparation_type", "needs_review"],
    ["preparation unknown", { preparation_type: "unknown" }, "PREPARATION_UNKNOWN", "needs_review", "preparation_type", "unknown"],
    ["excluded category yes", { contains_excluded_category: "yes" }, "EXCLUDED_CATEGORY", "rejected", "contains_excluded_category", "rejected"],
    ["excluded category unknown", { contains_excluded_category: "unknown" }, "EXCLUDED_CATEGORY_UNKNOWN", "needs_review", "contains_excluded_category", "unknown"],
    ["cold holding no", { continuous_cold_holding: "no" }, "COLD_HOLDING_NOT_CONFIRMED", "rejected", "continuous_cold_holding", "rejected"],
    ["cold holding unknown", { continuous_cold_holding: "unknown" }, "COLD_HOLDING_UNKNOWN", "needs_review", "continuous_cold_holding", "unknown"],
    ["temperature log no", { temperature_log_available: "no" }, "TEMPERATURE_LOG_MISSING", "needs_review", "temperature_log_available", "needs_review"],
    ["temperature log unknown", { temperature_log_available: "unknown" }, "TEMPERATURE_LOG_MISSING", "needs_review", "temperature_log_available", "unknown"],
    ["previously served yes", { previously_served: "yes" }, "PREVIOUSLY_SERVED", "rejected", "previously_served", "rejected"],
    ["previously served unknown", { previously_served: "unknown" }, "PREVIOUSLY_SERVED_UNKNOWN", "needs_review", "previously_served", "unknown"],
    ["containers no", { covered_food_grade_containers: "no" }, "PACKAGING_NOT_COVERED", "needs_review", "covered_food_grade_containers", "needs_review"],
    ["containers unknown", { covered_food_grade_containers: "unknown" }, "PACKAGING_UNKNOWN", "needs_review", "covered_food_grade_containers", "unknown"],
    ["discard-by missing", { discard_by: null }, "DISCARD_BY_MISSING", "needs_review", "discard_by", "unknown"],
    ["discard-by passed", { discard_by: iso(-1) }, "DISCARD_BY_PASSED", "rejected", "discard_by", "rejected"],
    ["pickup passed", { donor_pickup_by: iso(-1) }, "PICKUP_WINDOW_PASSED", "rejected", "donor_pickup_by", "rejected"],
    ["pickup too short", { donor_pickup_by: iso(5) }, "PICKUP_WINDOW_TOO_SHORT", "rejected", "donor_pickup_by", "rejected"],
    ["cross-contact unknown", { cross_contact_status: "unknown" }, "CROSS_CONTACT_UNKNOWN", "needs_review", "cross_contact_status", "unknown"],
    ["ingredients empty", { ingredients_text: "" }, "INGREDIENTS_MISSING", "needs_review", "ingredients_text", "unknown"],
    ["ingredients too short", { ingredients_text: "ab" }, "INGREDIENTS_MISSING", "needs_review", "ingredients_text", "unknown"],
  ];
  it.each(rows)("%s", (_name, facts, code, outcome, field, state) => {
    const d = gate(facts);
    expect(codes(d)).toEqual([code]);
    expect(d.outcome).toBe(outcome);
    expect(d.field_states[field]).toBe(state);
  });
  it("literal severities from CONTRACTS section 2.1 (not read back from the same table the code uses)", () => {
    const severity = (facts: Record<string, unknown>, code: string) => gate(facts).reasons.find((r) => r.code === code)?.severity;
    expect(severity({ previously_served: "yes" }, "PREVIOUSLY_SERVED")).toBe("reject");
    expect(severity({ previously_served: "unknown" }, "PREVIOUSLY_SERVED_UNKNOWN")).toBe("review");
    expect(severity({ donor_pickup_by: iso(5) }, "PICKUP_WINDOW_TOO_SHORT")).toBe("reject");
    expect(severity({ discard_by: null }, "DISCARD_BY_MISSING")).toBe("review");
    expect(severity({ covered_food_grade_containers: "no" }, "PACKAGING_NOT_COVERED")).toBe("review");
    expect(severity({ allergens: { ...scene1_eligible_facts.allergens, sesame: "unknown" } }, "ALLERGEN_UNKNOWN")).toBe("review");
  });
});

describe("S-01: a pending donor may start a draft, a suspended one may not", () => {
  const ctx = (donor_status: "approved" | "pending" | "suspended" | undefined, actor_role = "donor" as const) =>
    ({ now: NOW, effective_cutoff_at: null, collected_at: null, donor_status, actor_role });
  it.each(["approved", "pending"] as const)("%s donor", (s) => {
    expect(canTransition({ from: null, to: "draft", trigger: "createDraft", ctx: ctx(s) }).ok).toBe(true);
  });
  it.each(["suspended", undefined] as const)("%s donor is refused", (s) => {
    expect(canTransition({ from: null, to: "draft", trigger: "createDraft", ctx: ctx(s) }).ok).toBe(false);
  });
});

describe("offer transitions: forbidden moves checked independently of the table's own rows", () => {
  const triggers: OfferTrigger[] = [...new Set(OFFER_TRANSITIONS.map((t) => t.trigger))];
  it("nothing ever returns to pending_send or open once it left, and nothing is created straight into open", () => {
    for (const from of ["declined", "expired", "superseded", "send_failed", "canceled", "accepted"] as const) {
      for (const to of ["pending_send", "open"] as const) {
        for (const trigger of triggers) expect(canOfferTransition({ from, to, trigger }).ok, `${from} -> ${to} via ${trigger}`).toBe(false);
      }
    }
    for (const trigger of triggers) expect(canOfferTransition({ from: null, to: "open", trigger }).ok, `none -> open via ${trigger}`).toBe(false);
  });
  it("an accepted offer only ever stays accepted (its close_reason records why the assignment ended)", () => {
    for (const to of OFFER_STATUSES.filter((s) => s !== "accepted")) {
      for (const trigger of triggers) expect(canOfferTransition({ from: "accepted", to, trigger }).ok, `accepted -> ${to} via ${trigger}`).toBe(false);
    }
  });
  it("a pending_send offer cannot be accepted or declined: it must be opened for send first", () => {
    for (const to of ["accepted", "declined"] as const) {
      for (const trigger of triggers) expect(canOfferTransition({ from: "pending_send", to, trigger }).ok).toBe(false);
    }
  });
  it("the table is pinned at its reviewed size, so adding or dropping a row means changing this number on purpose", () => {
    expect(OFFER_TRANSITIONS).toHaveLength(23);
  });
});

describe("test clock", () => {
  it("advance() moves time forward and each now() is a fresh copy", () => {
    const c = createTestClock(NOW);
    c.advance(90_000);
    expect(c.now().toISOString()).toBe("2026-10-17T23:11:30.000Z");
    c.advance(-30_000);
    expect(c.now().toISOString()).toBe("2026-10-17T23:11:00.000Z");
    expect(c.now()).not.toBe(c.now());
  });
});

describe("matching: numbers worked out by hand", () => {
  // Donor, recipient 1 and courier A sit on the same meridian. 0.1 degree of latitude is 0.1 * pi/180 * 6371 km = 11.1195 km.
  const donorLoc = { lat: 47.6, lng: -122.32 };
  const place = (lat: number) => ({ lat, lng: -122.32, area_label: "x", address_line: "a" });
  const policy: PolicyConfig = { ...DEMO_POLICY, average_speed_kmh: 30, response_window_seconds: 60, handoff_buffer_minutes: 10, max_transit_minutes: 45 };
  const recipient = (id: string, lat: number, over: Partial<RecipientOrg> = {}): RecipientOrg => ({
    id, display_name: id, approval_status: "approved", registered_dfdo: true, serves_highly_susceptible_population: false,
    accepts_handling_modes: ["refrigerated"], excluded_allergens: [], capacity_servings_available: 200, receiving_closes_at: iso(600),
    location: place(lat), is_synthetic: true, ...over,
  });
  const courier = (id: string, lat: number, over: Partial<CourierProfile> = {}): CourierProfile => ({
    id, display_name: id, approval_status: "approved", affiliated_recipient_ids: ["r1", "r2"], capabilities: { cold_transport: true },
    available_until: iso(600), location: place(lat), is_synthetic: true, ...over,
  });
  const joined = (id: string, actor_role: "courier" | "donor" = "courier", status: "joined" | "opted_out" | "awaiting_join" = "joined") =>
    ({ id: `i-${id}-${actor_role}-${status}`, actor_role, actor_id: id, status });
  const run = (over: Record<string, unknown> = {}) =>
    findCandidates({
      donation: { id: "d", donor_location: donorLoc },
      facts: { ...scene1_eligible_facts, donor_pickup_by: iso(120), discard_by: iso(90) } as never,
      recipients: [recipient("r1", 47.6)], couriers: [courier("cA", 47.7)], identities: [joined("cA")],
      policy, now: NOW, excluded_courier_ids: [], busy_courier_ids: [], ...over,
    });

  it("ETA is rounded UP (22.24 min becomes 23, not 22), and every derived time follows from it", () => {
    const [c] = run();
    expect(c).toMatchObject({ recipient_id: "r1", courier_id: "cA", eta_to_pickup_minutes: 23, transit_minutes: 0, rank: 1 });
    // est_pickup = now + 60 s + 23 min = +24 min; est_dropoff = est_pickup + (0 + 10) min = +34 min.
    expect(c!.estimated_pickup_at).toBe(iso(24));
    expect(c!.estimated_dropoff_at).toBe(iso(34));
  });
  it("slack is measured to the EARLIEST of pickup cutoff, discard-by, recipient close and courier shift end", () => {
    expect(run()[0]!.slack_minutes).toBe(56); // discard-by (+90) is earliest: 90 - 34
    expect(run({ facts: { ...scene1_eligible_facts, donor_pickup_by: iso(60), discard_by: iso(90) } })[0]!.slack_minutes).toBe(26); // pickup (+60)
    expect(run({ recipients: [recipient("r1", 47.6, { receiving_closes_at: iso(50) })] })[0]!.slack_minutes).toBe(16); // recipient closes (+50)
    expect(run({ couriers: [courier("cA", 47.7, { available_until: iso(40) })] })[0]!.slack_minutes).toBe(6); // courier ends (+40)
  });
  it("transit is rounded up too: a recipient 0.1 degree away is 23 minutes, so the drop-off is +57", () => {
    const [c] = run({ recipients: [recipient("r1", 47.7)] });
    expect(c).toMatchObject({ transit_minutes: 23, eta_to_pickup_minutes: 23 });
    expect(c!.estimated_pickup_at).toBe(iso(24));
    expect(c!.estimated_dropoff_at).toBe(iso(24 + 23 + 10));
  });
  it("a recipient 0.8 degree away (about 89 km, 178 min) exceeds max_transit_minutes and is skipped", () => {
    expect(run({ recipients: [recipient("r1", 48.4)] })).toEqual([]);
  });
  it("M-05: only a joined COURIER identity for this courier counts (not a donor row with the same id, nor opted-out)", () => {
    expect(run({ identities: [joined("cA", "donor")] })).toEqual([]);
    expect(run({ identities: [joined("cA", "courier", "opted_out")] })).toEqual([]);
    expect(run({ identities: [joined("cA", "courier", "awaiting_join")] })).toEqual([]);
    expect(run({ identities: [joined("other")] })).toEqual([]);
    expect(run({ identities: [joined("cA", "donor"), joined("cA")] })).toHaveLength(1);
  });
  it("two equally good recipients are ordered by recipient_id, whatever order they arrive in", () => {
    const out = run({ recipients: [recipient("r2", 47.6), recipient("r1", 47.6)] });
    expect(out.map((c) => [c.rank, c.recipient_id])).toEqual([[1, "r1"], [2, "r2"]]);
    const flipped = run({ recipients: [recipient("r1", 47.6), recipient("r2", 47.6)] });
    expect(flipped.map((c) => c.recipient_id)).toEqual(["r1", "r2"]);
  });
  it("the nearer drop-off ranks first even when it arrives last", () => {
    const out = run({ recipients: [recipient("r2", 47.7), recipient("r1", 47.6)] });
    expect(out.map((c) => c.recipient_id)).toEqual(["r1", "r2"]);
  });
});
