import type { Clock, DispatchStore, Deps } from "@/contracts";
import type { Db } from "@/db/client";
import { storeInternals } from "@/db/internal";
import { getEnv } from "@/server/env";

// CONTRACTS section 9.0: core functions take an optional trailing `deps`; without it they use the composition root.
// Tests always pass `deps` explicitly. Time comes only from this Clock, never from a caller.

export type Runtime = { store: DispatchStore; clock: Clock; db: Db };

export async function runtime(deps?: Deps): Promise<Runtime> {
  let store = deps?.store;
  let clock = deps?.clock;
  if (!store || !clock) {
    // Imported lazily so tests that inject both never load the providers (and no import cycle with the container).
    const { getServices } = await import("@/server/container");
    const services = getServices();
    store ??= services.store;
    clock ??= services.clock;
  }
  return { store, clock, db: storeInternals(store).db };
}

/** A transaction handle has the same query API as the database, so helpers accept either. */
export type Q = Db;

/**
 * M-05's active_provider: "photon" or "fake" (not the gateway's real/fake mode). An injected gateway decides it in
 * tests; otherwise it is the configured MESSAGING_PROVIDER.
 */
export function activeProvider(deps?: Deps): "photon" | "fake" {
  if (deps?.messaging) return deps.messaging.mode === "real" ? "photon" : "fake";
  return getEnv().messaging_provider;
}

export const providerMode = (provider: "photon" | "fake") => (provider === "photon" ? ("real" as const) : ("fake" as const));

const RETRYABLE_SQLSTATES = new Set(["40P01", "40001"]); // deadlock detected, serialization failure
const sqlState = (e: unknown): string | undefined => {
  const x = e as { code?: string; cause?: { code?: string } } | null;
  return x?.code ?? x?.cause?.code;
};

/**
 * Runs a whole transaction again when Postgres aborts it for a deadlock or serialization failure. Those are safe to
 * retry because the aborted transaction wrote nothing; the retry sees the winner's committed state. Anything else is
 * rethrown at once. PGlite never raises these, but the demo's Postgres can under concurrent ticks.
 */
export async function retryOnConflict<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const code = sqlState(e);
      if (attempt >= retries || code === undefined || !RETRYABLE_SQLSTATES.has(code)) throw e;
    }
  }
}
