import { describe, expect, it } from "vitest";
import { VisionModelOutput, VisionSuggestion, scene1_vision_suggestion } from "@/contracts";

// T-IN-02: strict contract schemas for AI output (CONTRACTS §3.3).
const PROVENANCE_KEYS = ["prompt_id", "prompt_version", "provider", "model", "mode"] as const;

function modelOutput(): Record<string, unknown> {
  const out: Record<string, unknown> = { ...scene1_vision_suggestion };
  for (const k of PROVENANCE_KEYS) delete out[k];
  return out;
}

describe("VisionSuggestion / VisionModelOutput (T-IN-02)", () => {
  it("accepts the scene 1 fixture and its provenance-free model output", () => {
    expect(VisionSuggestion.safeParse(scene1_vision_suggestion).success).toBe(true);
    expect(VisionModelOutput.safeParse(modelOutput()).success).toBe(true);
  });

  it.each([
    ["ingredients_verified=true", { ingredients_verified: true }],
    ["handling_verified=true", { handling_verified: true }],
    ["requires_donor_confirmation=false", { requires_donor_confirmation: false }],
    ["unknown key `safe`", { safe: true }],
    ["unknown key `allergen_free`", { allergen_free: true }],
    ["allergen outside the enum", { possible_allergens: [{ allergen: "gluten", basis: "bread" }] }],
    ["servings min > max", { estimated_servings: { min: 30, max: 18 } }],
    [
      "more than 3 dish suggestions",
      {
        dish_suggestions: ["a", "b", "c", "d"].map((name) => ({ name, confidence: "low" })),
      },
    ],
  ])("rejects %s", (_label, patch) => {
    expect(VisionModelOutput.safeParse({ ...modelOutput(), ...patch }).success).toBe(false);
  });

  it.each(PROVENANCE_KEYS)("rejects a model output carrying provenance key %s", (key) => {
    expect(VisionModelOutput.safeParse({ ...modelOutput(), [key]: "x" }).success).toBe(false);
  });
});
