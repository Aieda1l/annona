import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI } from "@google/genai";
import { describe, expect, it } from "vitest";
import { createGeminiProvider } from "@/lib/ai/gemini";

// T-IN-10 (manual, real network). Skipped unless GEMINI_SMOKE=1, so CI and normal runs never call a model.
//   Key client:    GEMINI_SMOKE=1 GEMINI_API_KEY=<key> pnpm vitest run tests/intake/gemini.smoke
//   Vertex / ADC:  GEMINI_SMOKE=1 GOOGLE_CLOUD_PROJECT=<id> GOOGLE_CLOUD_LOCATION=global pnpm vitest run tests/intake/gemini.smoke
// Set GEMINI_SMOKE_OUT=<path> to write the (credential-free) results as JSON. Without a run, T-IN-10 is UNVERIFIED.
const enabled = process.env.GEMINI_SMOKE === "1";
const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

function makeClient(): { client: GoogleGenAI; auth: string } {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) return { client: new GoogleGenAI({ apiKey }), auth: "api_key" };
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  if (!project) throw new Error("Set GEMINI_API_KEY, or GOOGLE_CLOUD_PROJECT for Vertex with ADC.");
  const location = process.env.GOOGLE_CLOUD_LOCATION || "global";
  return { client: new GoogleGenAI({ vertexai: true, project, location }), auth: `vertex_adc:${location}` };
}

describe.skipIf(!enabled)("Gemini adapter smoke (real network)", () => {
  const records: Record<string, unknown>[] = [];

  it.each(["sandwich_platter", "buffet_ambiguous"])("%s: a real call returns a schema-valid, guard-clean suggestion", async (id) => {
    const { client, auth } = makeClient();
    const provider = createGeminiProvider({ client, model });
    // Real photos live in the gitignored eval-local directory (D-040); a manual run without them should say so, not pass on nothing.
    const file = join(process.cwd(), "fixtures/intake/eval-local", `${id}.jpg`);
    if (!existsSync(file)) throw new Error(`${file} is missing. Put the local eval photos in fixtures/intake/eval-local/ (see fixtures/intake/PROVENANCE.md).`);
    const bytes = readFileSync(file);
    const started = performance.now();
    const r = await provider.analyzeFoodImage({ image: { mime: "image/jpeg", bytes_base64: bytes.toString("base64") } });
    const elapsed_ms = Math.round(performance.now() - started);
    records.push({
      fixture: id,
      auth,
      requested_model: model,
      ok: r.ok,
      elapsed_ms,
      ...(r.ok
        ? { model: r.data.model, image_quality: r.data.image_quality, dishes: r.data.dish_suggestions.length, allergens: r.data.possible_allergens.map((a) => a.allergen) }
        : { error_code: r.error.code, retryable: r.error.retryable }),
    });
    if (process.env.GEMINI_SMOKE_OUT) writeFileSync(process.env.GEMINI_SMOKE_OUT, JSON.stringify(records, null, 2));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toMatchObject({ provider: "gemini", mode: "real", ingredients_verified: false });
  }, 30_000);
});
