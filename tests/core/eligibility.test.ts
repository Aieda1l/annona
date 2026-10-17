import { describe, expect, it } from "vitest";
import { ALLERGENS, REASON_CODE_SEVERITY, type VerifiedFacts, type VisionSuggestion } from "@/contracts";
import { scene1_eligible_facts, scene1_vision_suggestion } from "@/contracts/fixtures/scenes";
import { DEMO_ACTORS } from "@/contracts/fixtures/demo-actors";
import { evaluateEligibility } from "@/core";
import { DEMO_POLICY, type DonorProfile, type PolicyConfig } from "@/core/types";

const NOW = new Date("2026-10-17T23:10:00.000Z");

const approvedDonor: DonorProfile = {
  id: DEMO_ACTORS.find((a) => a.key === "donor_rainier")!.actor_id,
  display_name: "Rainier Catering (synthetic)",
  org_type: "caterer",
  licensed_food_establishment: true,
  approval_status: "approved",
  location: { lat: 47.6, lng: -122.3, area_label: "Capitol Hill", address_line: "1 Synthetic Way" },
  is_synthetic: true,
};

function run(
  mut: Partial<VerifiedFacts> = {},
  donor: DonorProfile = approvedDonor,
  policy: PolicyConfig = DEMO_POLICY,
  now: Date = NOW,
) {
  return evaluateEligibility({ facts: { ...scene1_eligible_facts, ...mut }, donor, policy, now });
}
const codes = (d: ReturnType<typeof run>) => d.reasons.map((r) => r.code);

describe("T-CO-01 policy-eligible demo facts", () => {
  it("T-CO-01 scene1_eligible_facts + approved donor -> eligible, zero reasons", () => {
    const d = run();
    expect(d.outcome).toBe("eligible");
    expect(d.reasons).toEqual([]);
    expect(d.policy_id).toBe(DEMO_POLICY.policy_id);
    expect(d.policy_version).toBe(DEMO_POLICY.policy_version);
    expect(d.evaluated_at).toBe(NOW.toISOString());
  });
});

describe("T-CO-02 non-approved donor (G-01)", () => {
  it("T-CO-02 suspended donor -> rejected DONOR_NOT_APPROVED", () => {
    const d = run({}, { ...approvedDonor, approval_status: "suspended" });
    expect(d.outcome).toBe("rejected");
    expect(d.reasons).toMatchObject([{ code: "DONOR_NOT_APPROVED", severity: "reject" }]);
  });
  it("T-CO-02 approved but not a licensed food establishment -> rejected DONOR_NOT_APPROVED", () => {
    const d = run({}, { ...approvedDonor, licensed_food_establishment: false });
    expect(d.outcome).toBe("rejected");
    expect(codes(d)).toEqual(["DONOR_NOT_APPROVED"]);
  });
  it("T-CO-02 pending donor -> needs_review DONOR_APPROVAL_PENDING, no reject reasons", () => {
    const d = run({}, { ...approvedDonor, approval_status: "pending" });
    expect(d.outcome).toBe("needs_review");
    expect(d.reasons).toMatchObject([{ code: "DONOR_APPROVAL_PENDING", severity: "review" }]);
  });
  it("T-CO-02 reject beats review and all rules still run (no short-circuit)", () => {
    const d = run({ continuous_cold_holding: "unknown" }, { ...approvedDonor, approval_status: "suspended" });
    expect(d.outcome).toBe("rejected");
    expect(codes(d)).toEqual(expect.arrayContaining(["DONOR_NOT_APPROVED", "COLD_HOLDING_UNKNOWN"]));
  });
});

describe("T-CO-03 handling / preparation / excluded category", () => {
  it.each([
    [{ handling_mode: "hot_held" }, "rejected", "HANDLING_OUT_OF_SCOPE"],
    [{ handling_mode: "ambient" }, "rejected", "HANDLING_OUT_OF_SCOPE"],
    [{ handling_mode: "frozen" }, "rejected", "HANDLING_OUT_OF_SCOPE"],
    [{ handling_mode: "unknown" }, "needs_review", "HANDLING_UNKNOWN"],
    [{ preparation_type: "cooked_then_cooled" }, "needs_review", "COOLING_HISTORY_REVIEW"],
    [{ preparation_type: "other" }, "needs_review", "PREPARATION_TYPE_REVIEW"],
    [{ preparation_type: "unknown" }, "needs_review", "PREPARATION_UNKNOWN"],
    [{ contains_excluded_category: "yes" }, "rejected", "EXCLUDED_CATEGORY"],
    [{ contains_excluded_category: "unknown" }, "needs_review", "EXCLUDED_CATEGORY_UNKNOWN"],
  ] as const)("T-CO-03 %j -> %s %s", (mut, outcome, code) => {
    const d = run(mut as Partial<VerifiedFacts>);
    expect(d.outcome).toBe(outcome);
    expect(codes(d)).toEqual([code]);
  });
});

describe("T-CO-04 missing holding history (G-05, G-06)", () => {
  it("T-CO-04 continuous_cold_holding unknown -> needs_review COLD_HOLDING_UNKNOWN", () => {
    const d = run({ continuous_cold_holding: "unknown" });
    expect(d.outcome).toBe("needs_review");
    expect(d.reasons).toMatchObject([
      { code: "COLD_HOLDING_UNKNOWN", severity: "review", field: "continuous_cold_holding" },
    ]);
    expect(d.field_states.continuous_cold_holding).toBe("unknown");
  });
  it("T-CO-04 continuous_cold_holding no -> rejected COLD_HOLDING_NOT_CONFIRMED", () => {
    const d = run({ continuous_cold_holding: "no" });
    expect(d.outcome).toBe("rejected");
    expect(d.reasons).toMatchObject([{ code: "COLD_HOLDING_NOT_CONFIRMED", severity: "reject" }]);
    expect(d.field_states.continuous_cold_holding).toBe("rejected");
  });
  it.each(["no", "unknown"] as const)("T-CO-04 temperature_log_available %s -> needs_review TEMPERATURE_LOG_MISSING", (v) => {
    const d = run({ temperature_log_available: v });
    expect(d.outcome).toBe("needs_review");
    expect(d.reasons).toMatchObject([
      { code: "TEMPERATURE_LOG_MISSING", severity: "review", field: "temperature_log_available" },
    ]);
  });
  it("T-CO-04 log rule is conditional on policy.require_temperature_log", () => {
    const d = run({ temperature_log_available: "unknown" }, approvedDonor, { ...DEMO_POLICY, require_temperature_log: false });
    expect(d.outcome).toBe("eligible");
  });
  it("T-CO-04 cold holding no + log no -> rejected with both reasons", () => {
    const d = run({ continuous_cold_holding: "no", temperature_log_available: "no" });
    expect(d.outcome).toBe("rejected");
    expect(codes(d)).toEqual(expect.arrayContaining(["COLD_HOLDING_NOT_CONFIRMED", "TEMPERATURE_LOG_MISSING"]));
  });
});

describe("T-CO-05..T-CO-08 remaining rules", () => {
  it("T-CO-05 previously_served yes -> rejected; unknown -> review", () => {
    expect(codes(run({ previously_served: "yes" }))).toEqual(["PREVIOUSLY_SERVED"]);
    expect(run({ previously_served: "yes" }).outcome).toBe("rejected");
    expect(codes(run({ previously_served: "unknown" }))).toEqual(["PREVIOUSLY_SERVED_UNKNOWN"]);
  });
  it("T-CO-06 containers no/unknown -> review PACKAGING_NOT_COVERED / PACKAGING_UNKNOWN", () => {
    expect(codes(run({ covered_food_grade_containers: "no" }))).toEqual(["PACKAGING_NOT_COVERED"]);
    expect(codes(run({ covered_food_grade_containers: "unknown" }))).toEqual(["PACKAGING_UNKNOWN"]);
    expect(run({ covered_food_grade_containers: "no" }).outcome).toBe("needs_review");
  });
  it("T-CO-07 discard_by null -> review; discard_by <= now -> reject", () => {
    expect(codes(run({ discard_by: null }))).toEqual(["DISCARD_BY_MISSING"]);
    expect(codes(run({ discard_by: NOW.toISOString() }))).toEqual(["DISCARD_BY_PASSED"]);
    expect(run({ discard_by: "2026-10-17T22:00:00.000Z" }).outcome).toBe("rejected");
  });
  it("T-CO-08 pickup window: passed, too short, exactly 15 min passes", () => {
    const at = (min: number) => new Date(NOW.getTime() + min * 60_000).toISOString();
    expect(codes(run({ donor_pickup_by: NOW.toISOString() }))).toEqual(["PICKUP_WINDOW_PASSED"]);
    expect(codes(run({ donor_pickup_by: at(-5) }))).toEqual(["PICKUP_WINDOW_PASSED"]);
    expect(codes(run({ donor_pickup_by: at(14) }))).toEqual(["PICKUP_WINDOW_TOO_SHORT"]);
    expect(run({ donor_pickup_by: at(15) }).reasons).toEqual([]);
    expect(run({ donor_pickup_by: at(15) }).outcome).toBe("eligible");
  });
  it("T-CO-10 cross-contact unknown and short ingredients -> review", () => {
    expect(codes(run({ cross_contact_status: "unknown", cross_contact_allergens: [] }))).toEqual(["CROSS_CONTACT_UNKNOWN"]);
    expect(codes(run({ ingredients_text: "" }))).toEqual(["INGREDIENTS_MISSING"]);
    expect(codes(run({ ingredients_text: "ab" }))).toEqual(["INGREDIENTS_MISSING"]);
    expect(codes(run({ ingredients_text: "  ab  " }))).toEqual(["INGREDIENTS_MISSING"]);
    expect(run({ ingredients_text: "oat" }).outcome).toBe("eligible");
  });
});

describe("T-CO-09 unknown allergens (G-11)", () => {
  it.each([1, 3, 9])("T-CO-09 k=%i unknown allergens -> needs_review with exactly k ALLERGEN_UNKNOWN", (k) => {
    const chosen = ALLERGENS.slice(0, k);
    const allergens = { ...scene1_eligible_facts.allergens };
    for (const a of chosen) allergens[a] = "unknown";
    const d = run({ allergens });
    expect(d.outcome).toBe("needs_review");
    expect(d.reasons).toHaveLength(k);
    expect(d.reasons.every((r) => r.code === "ALLERGEN_UNKNOWN" && r.severity === "review")).toBe(true);
    expect(d.reasons.map((r) => r.allergen).sort()).toEqual([...chosen].sort());
    for (const r of d.reasons) {
      expect(r.field).toBe(`allergens.${r.allergen}`);
      expect(d.field_states[`allergens.${r.allergen}`]).toBe("unknown");
    }
  });
  it("T-CO-09 not_in_listed_ingredients and present raise no gate reason", () => {
    const d = run();
    expect(d.reasons.filter((r) => r.code === "ALLERGEN_UNKNOWN")).toEqual([]);
    expect(d.field_states["allergens.milk"]).toBe("donor_verified");
  });
});

describe("T-CO-11 AI output can never cause eligibility", () => {
  it("T-CO-11 control: unmutated facts are eligible (property is not vacuous)", () => {
    expect(run().outcome).toBe("eligible");
  });

  const mutations: Array<[string, Partial<VerifiedFacts>, string]> = [
    ["handling_mode", { handling_mode: "unknown" }, "HANDLING_UNKNOWN"],
    ["preparation_type", { preparation_type: "unknown" }, "PREPARATION_UNKNOWN"],
    ["contains_excluded_category", { contains_excluded_category: "unknown" }, "EXCLUDED_CATEGORY_UNKNOWN"],
    ["continuous_cold_holding", { continuous_cold_holding: "unknown" }, "COLD_HOLDING_UNKNOWN"],
    ["temperature_log_available", { temperature_log_available: "unknown" }, "TEMPERATURE_LOG_MISSING"],
    ["previously_served", { previously_served: "unknown" }, "PREVIOUSLY_SERVED_UNKNOWN"],
    ["covered_food_grade_containers", { covered_food_grade_containers: "unknown" }, "PACKAGING_UNKNOWN"],
    ["discard_by", { discard_by: null }, "DISCARD_BY_MISSING"],
    ["cross_contact_status", { cross_contact_status: "unknown", cross_contact_allergens: [] }, "CROSS_CONTACT_UNKNOWN"],
    ["ingredients_text", { ingredients_text: "" }, "INGREDIENTS_MISSING"],
  ];
  it.each(mutations)("T-CO-11 %s unknown/null -> not eligible with %s", (_field, mut, code) => {
    const d = run(mut);
    expect(d.outcome).not.toBe("eligible");
    expect(codes(d)).toContain(code);
  });
  it.each(ALLERGENS)("T-CO-11 allergens.%s unknown -> not eligible", (a) => {
    const d = run({ allergens: { ...scene1_eligible_facts.allergens, [a]: "unknown" } });
    expect(d.outcome).not.toBe("eligible");
    expect(codes(d)).toContain("ALLERGEN_UNKNOWN");
  });

  it("T-CO-11 every produced code is in the §2.1 catalogue with the catalogued severity", () => {
    const d = run({
      handling_mode: "unknown",
      continuous_cold_holding: "no",
      allergens: { ...scene1_eligible_facts.allergens, sesame: "unknown" },
    });
    for (const r of d.reasons) expect(r.severity).toBe(REASON_CODE_SEVERITY[r.code]);
    expect(d.reasons.every((r) => r.severity !== "dispatch")).toBe(true);
  });

  it("T-CO-11 type level: evaluateEligibility does not accept a VisionSuggestion", () => {
    const suggestion: VisionSuggestion = scene1_vision_suggestion;
    // @ts-expect-error a VisionSuggestion is not VerifiedFacts
    const call = () => evaluateEligibility({ facts: suggestion, donor: approvedDonor, policy: DEMO_POLICY, now: NOW });
    // @ts-expect-error extra key `suggestion` is not part of the input
    const call2 = () => evaluateEligibility({ facts: scene1_eligible_facts, suggestion, donor: approvedDonor, policy: DEMO_POLICY, now: NOW });
    expect(typeof call).toBe("function");
    expect(typeof call2).toBe("function");
  });

  it("T-CO-11 the gate is pure: same input, same output; input not mutated", () => {
    const facts = structuredClone(scene1_eligible_facts);
    const a = evaluateEligibility({ facts, donor: approvedDonor, policy: DEMO_POLICY, now: NOW });
    const b = evaluateEligibility({ facts, donor: approvedDonor, policy: DEMO_POLICY, now: NOW });
    expect(a).toEqual(b);
    expect(facts).toEqual(scene1_eligible_facts);
  });
});

describe("scene 3 (responsible refusal)", () => {
  it("scene3_review_facts -> needs_review with exactly the four expected reasons", async () => {
    const { scene3_review_facts } = await import("@/contracts/fixtures/scenes");
    const d = evaluateEligibility({ facts: scene3_review_facts, donor: approvedDonor, policy: DEMO_POLICY, now: NOW });
    expect(d.outcome).toBe("needs_review");
    expect(codes(d).sort()).toEqual(
      ["ALLERGEN_UNKNOWN", "COLD_HOLDING_UNKNOWN", "COOLING_HISTORY_REVIEW", "TEMPERATURE_LOG_MISSING"].sort(),
    );
  });
});
