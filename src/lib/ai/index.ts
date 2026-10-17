import { GoogleGenAI } from "@google/genai";
import { err, type VisionProvider, type VisionProviderConfig } from "@/contracts";
import { createFakeVisionProvider } from "./fake";
import { createGeminiProvider, resolveEscalationModel } from "./gemini";

// Barrel owned by Dev 1 after the baseline (keep exported names stable). CONTRACTS §9.2.

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

export { createGeminiProvider } from "./gemini";

/**
 * `fake` returns the labeled fake. `gemini` is always `mode: "real"`: without a key it is misconfigured,
 * and every call fails with PROVIDER_UNAVAILABLE. It never falls back to fake output (CONTRACTS §12).
 */
export function createVisionProvider(config: VisionProviderConfig): VisionProvider {
  if (config.mode === "fake") return createFakeVisionProvider();

  const model = config.model?.trim() || DEFAULT_GEMINI_MODEL;
  const apiKey = config.api_key?.trim();
  if (apiKey) {
    // Production path: an explicit API key, no Vertex. Local runs without a key use createGeminiProvider
    // directly with a Vertex/ADC client (see src/lib/ai/gemini.ts).
    // GEMINI_ESCALATION_MODEL: unset = gemini-3.8-flash as a second opinion for unconfident answers; `off` disables.
    return createGeminiProvider({
      client: new GoogleGenAI({ apiKey }),
      model,
      escalation_model: resolveEscalationModel(model, process.env.GEMINI_ESCALATION_MODEL),
    });
  }
  return {
    mode: "real",
    model,
    status: "misconfigured",
    async analyzeFoodImage() {
      return err("PROVIDER_UNAVAILABLE", "Gemini provider is not configured (no API key)", { retryable: false });
    },
  };
}
