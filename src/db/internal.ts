import type { DispatchStore } from "@/contracts";
import type { OpenedDb } from "./client";

// The contract's DispatchStore is an opaque { kind }. The Drizzle handle lives here, private to Dev 2's code
// (reach it by path, never through the barrel).

const registry = new WeakMap<DispatchStore, OpenedDb>();

export function registerStore(store: DispatchStore, opened: OpenedDb): void {
  registry.set(store, opened);
}

export function storeInternals(store: DispatchStore): OpenedDb {
  const opened = registry.get(store);
  if (!opened) throw new Error("Unknown DispatchStore: create it with createDispatchStore().");
  return opened;
}

export async function closeStore(store: DispatchStore): Promise<void> {
  const opened = registry.get(store);
  registry.delete(store);
  await opened?.close();
}
