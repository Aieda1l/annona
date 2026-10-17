import type { DispatchStore, DispatchStoreConfig } from "@/contracts";

// Barrel owned by Dev 2 after the baseline (keep exported names stable). CONTRACTS §9.1, §9.3.

/** Baseline stub: an opaque handle. Dev 2 replaces it with the Drizzle-backed store (internals stay private). */
export function createDispatchStore(config: DispatchStoreConfig): DispatchStore {
  return { kind: config.kind };
}
