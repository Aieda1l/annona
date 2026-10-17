import { err, type VisionProvider, type VisionProviderConfig } from "@/contracts";
import { createFakeVisionProvider } from "./fake";

// Barrel owned by Dev 1 after the baseline (keep exported names stable). CONTRACTS §9.2.

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

/**
 * `fake` returns the labeled fake. `gemini` is always `mode: "real"`: without a key it is misconfigured,
 * and every call fails with PROVIDER_UNAVAILABLE. It never falls back to fake output (CONTRACTS §12).
 */
export function createVisionProvider(config: VisionProviderConfig): VisionProvider {
  if (config.mode === "fake") return createFakeVisionProvider();

  const model = config.model?.trim() || DEFAULT_GEMINI_MODEL;
  const configured = Boolean(config.api_key?.trim());
  // Slice 2 replaces the stub below with the real adapter (src/lib/ai/gemini.ts).
  return {
    mode: "real",
    model,
    status: configured ? "ok" : "misconfigured",
    async analyzeFoodImage() {
      return err(
        "PROVIDER_UNAVAILABLE",
        configured ? "Gemini adapter is not implemented yet" : "Gemini provider is not configured (no API key)",
        { retryable: false },
      );
    },
  };
}
