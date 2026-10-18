import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ALLERGENS, DEMO_ACTORS, scene1_eligible_facts, scene1_vision_suggestion } from "@/contracts";
import { evaluateEligibility } from "@/core/eligibility";
import { DEMO_POLICY, type DonorProfile } from "@/core/types";
import { createIntakeService } from "@/features/intake/service";
import { createFakeVisionProvider } from "@/lib/ai/fake";
import { createCoreDouble, DONOR } from "./doubles/core";

// T-IN-08 against Dev 2's REAL pure gate (evaluateEligibility), not a double: facts the intake service sends to core
// are the donor's own answers; AI suggestions never populate them, so unknown stays unknown and the gate asks.
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
const gate = (facts: Parameters<typeof evaluateEligibility>[0]["facts"]) =>
  evaluateEligibility({ facts, donor: approvedDonor, policy: DEMO_POLICY, now: NOW });

const platter = {
  mime: "image/jpeg",
  bytes_base64: readFileSync(join(process.cwd(), "fixtures/intake/images/sandwich_platter.jpg")).toString("base64"),
};

async function submitThroughService(raw: unknown) {
  const { core, ...d } = createCoreDouble();
  const service = createIntakeService({ core, vision: createFakeVisionProvider() });
  const draft = await service.createDraftFromImage({ actor: DONOR, image: platter, source: "web_upload" });
  if (!draft.ok) throw new Error("draft failed");
  expect(draft.data.ai_suggestion?.possible_allergens.map((a) => a.allergen)).toEqual(
    expect.arrayContaining(["wheat", "milk", "eggs"]),
  ); // the AI did list allergens, and omitted sesame
  const r = await service.submitDonorVerification({ actor: DONOR, donation_id: draft.data.id, raw });
  expect(r.ok).toBe(true);
  return { sent: core.submitVerification.mock.calls[0]![0], ...d };
}

describe("T-IN-08 against the real eligibility gate", () => {
  it("all-unknown allergens: AI suggestions never fill donor statuses, and the gate returns needs_review for all nine", async () => {
    const allUnknown = Object.fromEntries(ALLERGENS.map((a) => [a, "unknown"]));
    const { sent } = await submitThroughService({ ...scene1_eligible_facts, allergens: allUnknown });
    expect(sent.facts.allergens).toEqual(allUnknown); // wheat, milk, eggs were AI-listed and are still unknown
    const decision = gate(sent.facts);
    expect(decision.outcome).toBe("needs_review");
    const unknown = decision.reasons.filter((r) => r.code === "ALLERGEN_UNKNOWN");
    expect(unknown.map((r) => r.field).sort()).toEqual(ALLERGENS.map((a) => `allergens.${a}`).sort());
    for (const a of ALLERGENS) expect(decision.field_states[`allergens.${a}`]).toBe("unknown");
  });

  it("AI omitted sesame and the donor left it unknown: sesame stays unknown and is the only ALLERGEN_UNKNOWN", async () => {
    const { sent } = await submitThroughService({
      ...scene1_eligible_facts,
      allergens: { ...scene1_eligible_facts.allergens, sesame: "unknown" },
    });
    expect(sent.facts.allergens.sesame).toBe("unknown");
    const decision = gate(sent.facts);
    expect(decision.outcome).toBe("needs_review");
    expect(decision.reasons.filter((r) => r.code === "ALLERGEN_UNKNOWN")).toEqual([
      expect.objectContaining({ field: "allergens.sesame", allergen: "sesame", severity: "review" }),
    ]);
    expect(decision.field_states["allergens.sesame"]).toBe("unknown");
  });

  it("edited_from_ai is provenance only: it never changes the gate outcome", async () => {
    const donorFacts = {
      ...scene1_eligible_facts,
      dish_name: "Family tray",
      servings: 24,
      allergens: { ...scene1_eligible_facts.allergens, wheat: "not_in_listed_ingredients" },
    };
    const { sent } = await submitThroughService(donorFacts);
    expect(sent.edited_from_ai).toEqual(expect.arrayContaining(["dish_name", "servings", "allergens.wheat"]));
    const withProvenance = gate(sent.facts);
    const without = gate({ ...sent.facts }); // same facts; the gate has no parameter for provenance
    expect(withProvenance).toEqual(without);
    expect(withProvenance.outcome).toBe("eligible"); // the donor's own declaration decides, not the AI list
  });

  it("the AI suggestion cannot be passed to the gate at all", () => {
    // The gate input has no suggestion field: passing one is a type error, and extra keys are ignored at runtime.
    const facts = { ...scene1_eligible_facts, allergens: { ...scene1_eligible_facts.allergens, sesame: "unknown" as const } };
    // @ts-expect-error a VisionSuggestion is not part of EligibilityInput
    const decision = evaluateEligibility({ facts, donor: approvedDonor, policy: DEMO_POLICY, now: NOW, suggestion: scene1_vision_suggestion });
    expect(decision.outcome).toBe("needs_review");
  });
});
