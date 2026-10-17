import { DEMO_ACTORS, type Actor, type Deps, type DispatchStore, type VerifiedFacts } from "@/contracts";
import { scene1_eligible_facts } from "@/contracts/fixtures/scenes";
import { createTestClock } from "@/core";
import { createDispatchStore } from "@/db";
import { closeStore, storeInternals } from "@/db/internal";
import { runMigrations } from "@/db/run-migrations";
import { SEED_IDENTITY_IDS, seedStore } from "@/db/seed/seed";

// A migrated and seeded in-memory store plus a test clock, for the slice 2 service tests. Always passed as `deps`.

export const T0 = new Date("2026-10-17T23:10:00.000Z");
export const at = (min: number, from: Date = T0) => new Date(from.getTime() + min * 60_000);
export const iso = (min: number, from: Date = T0) => at(min, from).toISOString();

export const actorId = (key: string): string => DEMO_ACTORS.find((a) => a.key === key)!.actor_id;
export const DONOR = actorId("donor_rainier");
export const DONOR_PENDING = actorId("donor_pending");
export const DONOR_SUSPENDED = actorId("donor_suspended");
export const EASTLAKE = actorId("recipient_eastlake");
export const YOUTH = actorId("recipient_youth");
export const COURIER_A = actorId("courier_a");
export const COURIER_B = actorId("courier_b");
export const COURIER_C = actorId("courier_c");
export const OPERATOR = actorId("operator");

export const donorActor = (id: string = DONOR): Actor => ({ role: "donor", id });
export const operatorActor: Actor = { role: "operator", id: OPERATOR };
export const courierActor = (id: string = COURIER_A): Actor => ({ role: "courier", id });
export const IDENTITY = SEED_IDENTITY_IDS;

export type World = {
  store: DispatchStore;
  db: ReturnType<typeof storeInternals>["db"];
  /** A fresh test clock starting at T0 (or `start`) wrapped as deps for one test. */
  deps: (start?: Date) => Deps & { clock: ReturnType<typeof createTestClock> };
  close: () => Promise<void>;
};

export async function makeWorld(): Promise<World> {
  const store = createDispatchStore({ kind: "pglite", database_url: undefined, pglite_dir: undefined });
  await runMigrations(store);
  await seedStore(store, { now: T0, messaging_provider: "fake" });
  return {
    store,
    db: storeInternals(store).db,
    deps: (start = T0) => ({ store, clock: createTestClock(start) }),
    close: () => closeStore(store),
  };
}

/** Scene 1 facts with times relative to `from`; the client-sent attested_at is deliberately junk (core overwrites it). */
export function factsAt(from: Date = T0, over: Record<string, unknown> = {}): VerifiedFacts {
  return {
    ...scene1_eligible_facts,
    donor_pickup_by: iso(120, from),
    discard_by: iso(360, from),
    attestation: { ...scene1_eligible_facts.attestation, attested_at: "2020-01-01T00:00:00.000Z" },
    ...over,
  } as VerifiedFacts;
}
