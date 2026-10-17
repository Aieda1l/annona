import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VisionSuggestion } from "@/contracts";
import { createFakeVisionProvider } from "@/lib/ai/fake";

// T-IN-01, T-IN-03, T-IN-04: deterministic fake keyed by SHA-256 of the image bytes.
const IMAGES = join(process.cwd(), "fixtures/intake/images");
const load = (id: string) => ({ mime: "image/jpeg", bytes_base64: readFileSync(join(IMAGES, `${id}.jpg`)).toString("base64") });
const fake = createFakeVisionProvider();
const analyze = (image: { mime: string; bytes_base64: string }) => fake.analyzeFoodImage({ image });

describe("fake vision provider", () => {
  it("is labeled fake and ready", () => {
    expect(fake.mode).toBe("fake");
    expect(fake.model).toBeNull();
    expect(fake.status).toBe("ok");
  });

  it("T-IN-01: sandwich_platter is schema-valid with possible wheat, milk, eggs and literal flags", async () => {
    const r = await analyze(load("sandwich_platter"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(VisionSuggestion.safeParse(r.data).success).toBe(true);
    expect(r.data.possible_allergens.map((a) => a.allergen)).toEqual(expect.arrayContaining(["wheat", "milk", "eggs"]));
    expect(r.data.estimated_servings).toEqual({ min: 18, max: 30 });
    expect(r.data).toMatchObject({
      provider: "fake",
      mode: "fake",
      model: null,
      ingredients_verified: false,
      handling_verified: false,
      requires_donor_confirmation: true,
    });
  });

  it("T-IN-03: buffet_ambiguous is low confidence with an uncertainty note and a question", async () => {
    const r = await analyze(load("buffet_ambiguous"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const lowConfidence = r.data.dish_suggestions.every((d) => d.confidence === "low");
    expect(lowConfidence || r.data.image_quality !== "usable").toBe(true);
    expect(r.data.uncertainty_notes.length).toBeGreaterThanOrEqual(1);
    expect(r.data.questions_for_donor.length).toBeGreaterThanOrEqual(1);
  });

  it("pasta_tray suggests pasta with possible wheat and milk", async () => {
    const r = await analyze(load("pasta_tray"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.dish_suggestions[0]?.name).toMatch(/pasta/i);
    expect(r.data.possible_allergens.map((a) => a.allergen)).toEqual(expect.arrayContaining(["wheat", "milk"]));
  });

  it("blurry reports poor quality and no servings estimate", async () => {
    const r = await analyze(load("blurry"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.image_quality).toBe("poor");
    expect(r.data.estimated_servings).toBeNull();
  });

  it("T-IN-04: malformed_output goes through the parser and fails with AI_OUTPUT_INVALID", async () => {
    const r = await analyze(load("malformed_output"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("AI_OUTPUT_INVALID");
  });

  it("unknown bytes get a generic low-confidence suggestion that says the image is not a known fixture", async () => {
    const r = await analyze({ mime: "image/jpeg", bytes_base64: Buffer.from("not a known fixture").toString("base64") });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.dish_suggestions.every((d) => d.confidence === "low")).toBe(true);
    expect(r.data.possible_allergens).toEqual([]);
    expect(r.data.uncertainty_notes.join(" ")).toMatch(/not a known fixture/i);
    expect(r.data.mode).toBe("fake");
  });

  it("is keyed by bytes, not by MIME or donor hint", async () => {
    const img = load("sandwich_platter");
    const a = await analyze(img);
    const b = await fake.analyzeFoodImage({ image: { ...img, mime: "image/png" }, donor_hint: "pasta" });
    expect(b).toEqual(a);
  });

  it("is deterministic across calls and across provider instances", async () => {
    const img = load("pasta_tray");
    expect(await analyze(img)).toEqual(await createFakeVisionProvider().analyzeFoodImage({ image: img }));
  });
});
