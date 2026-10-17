import {
  notImplementedResult,
  type VisionProvider,
  type VisionProviderConfig,
} from "@/contracts";

// Barrel owned by Dev 1 after the baseline (keep exported names stable). CONTRACTS §9.2.

/** Baseline stub: `mode` is `real` only when the selector is gemini; analyzeFoodImage is NOT_IMPLEMENTED. */
export function createVisionProvider(config: VisionProviderConfig): VisionProvider {
  return {
    mode: config.mode === "gemini" ? "real" : "fake",
    model: null,
    status: "ok",
    async analyzeFoodImage() {
      return notImplementedResult("Dev 1", "analyzeFoodImage");
    },
  };
}
