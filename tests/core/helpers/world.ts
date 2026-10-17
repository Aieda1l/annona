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

// ---- direct row helpers for tests that need a state the public functions would only reach in several steps ----
import { randomUUID } from "node:crypto";
import { donations, offers } from "@/db/schema";

const CODE_ALPHABET = "ACDEFHJKMNPRTUVWXY3479";
let codeCounter = 0;
/** A unique, valid short code for fixture offers. */
export const nextCode = () => {
  const n = codeCounter++;
  return `${CODE_ALPHABET[n % 22]}${CODE_ALPHABET[Math.floor(n / 22) % 22]}${CODE_ALPHABET[Math.floor(n / 484) % 22]}K`;
};

export async function insertDonation(db: World["db"], over: Partial<typeof donations.$inferInsert> = {}) {
  const [row] = await db
    .insert(donations)
    .values({ id: randomUUID(), donor_id: DONOR, status: "eligible", source: "fixture", ai_status: "succeeded", created_at: T0, updated_at: T0, ...over })
    .returning();
  return row!;
}

export async function insertOffer(db: World["db"], donation_id: string, over: Partial<typeof offers.$inferInsert> = {}) {
  const status = over.status ?? "open";
  const [row] = await db
    .insert(offers)
    .values({
      id: randomUUID(), donation_id, recipient_id: EASTLAKE, courier_id: COURIER_A, short_code: nextCode(), status, wave_no: 1,
      created_at: T0, provider_mode: "fake", candidate: { recipient_id: EASTLAKE, courier_id: COURIER_A, eta_to_pickup_minutes: 5, transit_minutes: 5, estimated_pickup_at: iso(10), estimated_dropoff_at: iso(25), slack_minutes: 60, rank: 1 },
      ...(status === "open" ? { sent_at: T0, expires_at: at(1) } : {}),
      ...over,
    })
    .returning();
  return row!;
}

// ---- scenario helpers built on the public functions ----
import { eq } from "drizzle-orm";
import { createDraft, joinIdentity, storeDonationImage, submitVerification } from "@/core";
import { audit_events, messaging_identities, verification_links } from "@/db/schema";

/** Back to the seeded baseline: no offers, links or donations; seed profiles and policy restored; the demo identities joined. */
export async function resetWorld(w: World): Promise<void> {
  await w.db.delete(offers);
  await w.db.delete(verification_links);
  await w.db.delete(donations);
  await w.db.delete(audit_events);
  await seedStore(w.store, { now: T0, messaging_provider: "fake" });
  for (const id of [IDENTITY.donor, IDENTITY.courier_a, IDENTITY.courier_b]) {
    await w.db.update(messaging_identities).set({ status: "joined", joined_at: T0, opted_out_at: null }).where(eq(messaging_identities.id, id));
  }
}

export async function joinIdentityNow(w: World, identity_id: string, deps = w.deps()) {
  return joinIdentity({ identity_id, provider_space_id: null, provider_sender_id: null }, deps);
}

/** A donation that went draft -> eligible through the real functions, with facts relative to `from`. */
export async function makeEligibleDonation(w: World, opts: { from?: Date; facts?: Record<string, unknown>; donor?: string } = {}): Promise<string> {
  const from = opts.from ?? T0;
  const deps = w.deps(from);
  const img = await storeDonationImage({ mime: "image/png", bytes: new Uint8Array([1, 2, 3, 4]) }, deps);
  if (!img.ok) throw new Error("image failed");
  const actor = { role: "donor" as const, id: opts.donor ?? DONOR };
  const draft = await createDraft({ actor, image_id: img.data.image_id, source: "web_upload", source_ref: null }, deps);
  if (!draft.ok) throw new Error(`draft failed: ${draft.error.code}`);
  const sub = await submitVerification({ auth: { actor }, donation_id: draft.data.id, facts: factsAt(from, opts.facts), edited_from_ai: [] }, deps);
  if (!sub.ok) throw new Error(`submit failed: ${sub.error.code}`);
  if (sub.data.card.status !== "eligible") throw new Error(`not eligible: ${sub.data.card.status} ${JSON.stringify(sub.data.card.decision?.reasons.map((r) => r.code))}`);
  return draft.data.id;
}
