import { describe, expect, it } from "vitest";
import { VisionSuggestion, scene1_vision_suggestion } from "@/contracts";
import { parseVisionOutput } from "@/lib/ai/parse";

// T-IN-02 (adapter side) and T-IN-11: the one validation path shared by the fake and real providers.
const META = { provider: "fake", model: null, mode: "fake" } as const;
const PROVENANCE_KEYS = ["prompt_id", "prompt_version", "provider", "model", "mode"] as const;

function modelOutput(patch: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = { ...scene1_vision_suggestion };
  for (const k of PROVENANCE_KEYS) delete out[k];
  return { ...out, ...patch };
}
const text = (patch: Record<string, unknown> = {}) => JSON.stringify(modelOutput(patch));

function expectInvalid(raw: string) {
  const r = parseVisionOutput(raw, META);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.code).toBe("AI_OUTPUT_INVALID");
}

describe("parseVisionOutput: strict parse", () => {
  it("stamps provenance on valid output and yields a VisionSuggestion", () => {
    const r = parseVisionOutput(text(), { provider: "gemini", model: "gemini-3.5-flash-lite", mode: "real" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({
      prompt_id: "annona-intake",
      prompt_version: "v1",
      provider: "gemini",
      model: "gemini-3.5-flash-lite",
      mode: "real",
      ingredients_verified: false,
      handling_verified: false,
      requires_donor_confirmation: true,
    });
    expect(VisionSuggestion.safeParse(r.data).success).toBe(true);
  });

  it("accepts the clean scene 1 wording without tripping the guard", () => {
    expect(parseVisionOutput(text(), META).ok).toBe(true);
  });

  it.each([
    ["empty string", ""],
    ["plain prose", "This looks like sandwiches."],
    ["truncated JSON", text().slice(0, 40)],
    ["markdown-fenced JSON", "```json\n" + text() + "\n```"],
    ["JSON array", "[]"],
    ["JSON null", "null"],
  ])("rejects non-JSON output: %s", (_label, raw) => expectInvalid(raw));

  it.each([
    ["unknown key", { safe: true }],
    ["provenance key from the model", { provider: "gemini" }],
    ["ingredients_verified=true", { ingredients_verified: true }],
    ["handling_verified=true", { handling_verified: true }],
    ["requires_donor_confirmation=false", { requires_donor_confirmation: false }],
    ["wrong allergen enum", { possible_allergens: [{ allergen: "gluten", basis: "bread" }] }],
    ["wrong image_quality enum", { image_quality: "excellent" }],
    ["servings min > max", { estimated_servings: { min: 30, max: 18 } }],
    ["more than 5 uncertainty notes", { uncertainty_notes: Array(6).fill("unclear") }],
  ])("rejects schema violation: %s", (_label, patch) => expectInvalid(text(patch)));

  it("rejects a model output missing a required key", () => {
    const out = modelOutput();
    delete out.uncertainty_notes;
    expectInvalid(JSON.stringify(out));
  });
});

// T-IN-11: absence or safety claims in any free-text field fail closed (PROMPT_EVAL §6 U3, §8 item 5).
const CLAIMS = [
  "nut-free",
  "This is allergen-free",
  "allergen free",
  "gluten-free",
  "dairy-free",
  "safe to eat",
  "Looks safe",
  "free of nuts",
  "contains no peanuts",
  "does not contain sesame",
  "no allergens",
  "certified kitchen",
  "USDA compliant",
  "shelf life of 3 days",
  "good until Friday",
  "use by tomorrow",
  "held at 41°F",
  "kept at 5 °C",
  "stored at 40 degrees",
  "NUT-FREE",
];

type FieldCase = { field: string; patch: (s: string) => Record<string, unknown> };
const FIELDS: FieldCase[] = [
  { field: "dish_suggestions[].name", patch: (s) => ({ dish_suggestions: [{ name: s, confidence: "low" }] }) },
  { field: "visible_components", patch: (s) => ({ visible_components: [s] }) },
  { field: "possible_allergens[].basis", patch: (s) => ({ possible_allergens: [{ allergen: "wheat", basis: s }] }) },
  { field: "uncertainty_notes", patch: (s) => ({ uncertainty_notes: [s] }) },
  { field: "questions_for_donor", patch: (s) => ({ questions_for_donor: [s] }) },
];

describe("parseVisionOutput: safety-phrase guard (T-IN-11)", () => {
  for (const { field, patch } of FIELDS) {
    describe(field, () => {
      it.each(CLAIMS)("rejects %j", (claim) => expectInvalid(text(patch(claim))));
    });
  }

  it("reports which field tripped, without echoing credentials or the full payload", () => {
    const r = parseVisionOutput(text({ uncertainty_notes: ["Appears nut-free."] }), META);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(JSON.stringify(r.error)).toContain("uncertainty_notes");
  });

  it.each([
    "Fillings and spreads cannot be identified from a photo.",
    "Sauce may contain dairy; please confirm.",
    "Is any sesame, soy or tree nut used in the dressing?",
    "Safety cannot be judged from a photo.",
  ])("does not flag ordinary uncertainty wording: %j", (note) => {
    expect(parseVisionOutput(text({ uncertainty_notes: [note] }), META).ok).toBe(true);
  });
});
