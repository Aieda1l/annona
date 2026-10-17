import type { DispatchStore, DispatchStoreConfig } from "@/contracts";
import { openDb } from "./client";
import { registerStore } from "./internal";

// Barrel owned by Dev 2 after the baseline (keep exported names stable). CONTRACTS §9.1, §9.3.

/** Opaque handle. The Drizzle client stays private to Dev 2 (see ./internal). Migrations run explicitly (db:migrate). */
export function createDispatchStore(config: DispatchStoreConfig): DispatchStore {
  const opened = openDb(config);
  const store: DispatchStore = { kind: opened.kind };
  registerStore(store, opened);
  return store;
}
