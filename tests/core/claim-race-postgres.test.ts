import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { DispatchStore } from "@/contracts";
import { claimOffer, createNextOffers, createTestClock, openOfferForSend, recordInboundMessage } from "@/core";
import { createDispatchStore } from "@/db";
import { closeStore, storeInternals } from "@/db/internal";
import { runMigrations } from "@/db/run-migrations";
import { donations, messaging_identities, offers, policy_config } from "@/db/schema";
import { assertDisposableDatabase } from "./helpers/disposable";
import { COURIER_A, COURIER_B, IDENTITY, at, courierActor, makeEligibleDonation, resetWorld, type World } from "./helpers/world";

// T-CO-17 (REQUIRED by D-033 for any race-safety claim; CONTRACTS 8.1 "Verification rule"): independent postgres.js
// clients, one connection each, race the same donation on a disposable real PostgreSQL, through the same connection mode as
// the deployed demo (Supabase transaction pooler, port 6543, prepare: false). PGlite serializes, so it cannot show this.
//
// Runs ONLY when TEST_DATABASE_URL is set; otherwise it is skipped and first-claim-wins stays UNVERIFIED (AC-06 not done).
// The database is migrated, seeded and wiped by this test: point it at a disposable one whose name says so.

vi.setConfig({ testTimeout: 300_000, hookTimeout: 120_000 });

const URL = process.env.TEST_DATABASE_URL;
const CLIENTS = 6;
const ROUNDS = 20;

describe.skipIf(!URL)("T-CO-17: first-claim-wins on real Postgres, independent connections", () => {
  const stores: DispatchStore[] = [];
  let world: World;
  const clock = createTestClock(at(0.2));
  const depsOf = (i: number) => ({ store: stores[i]!, clock });

  beforeAll(async () => {
    assertDisposableDatabase(URL!);
    for (let i = 0; i < CLIENTS; i++) stores.push(createDispatchStore({ kind: "postgres", database_url: URL, pglite_dir: undefined }));
    await runMigrations(stores[0]!);
    world = { store: stores[0]!, db: storeInternals(stores[0]!).db, deps: () => ({ store: stores[0]!, clock: createTestClock(at(0)) }), close: async () => {} };
    await resetWorld(world);
  });
  afterAll(async () => {
    for (const s of stores) await closeStore(s);
  });

  async function setWave(n: number) {
    const [row] = await world.db.select().from(policy_config).where(eq(policy_config.active, true));
    await world.db.update(policy_config).set({ config: { ...(row!.config as object), offer_wave_size: n } }).where(eq(policy_config.policy_id, row!.policy_id));
  }

  it(`${ROUNDS} rounds: ${CLIENTS} connections claim the open offers of one donation at once; exactly one wins every round`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await resetWorld(world);
      await setWave(2);
      const id = await makeEligibleDonation(world);
      const created = await createNextOffers({ donation_id: id }, { store: stores[0]!, clock: createTestClock(at(0)) });
      if (!created.ok) throw new Error(`round ${round}: no offers`);
      for (const o of created.data) await openOfferForSend({ offer_id: o.id }, { store: stores[0]!, clock: createTestClock(at(0)) });
      const [a, b] = created.data;

      const results = await Promise.all(
        Array.from({ length: CLIENTS }, (_, i) => {
          const mine = i % 2 === 0 ? a! : b!;
          return claimOffer({ offer_ref: { offer_id: mine.id }, actor: courierActor(mine.courier_id), source: "messaging", source_event_id: `r${round}c${i}` }, depsOf(i));
        }),
      );

      const winners = results.filter((r) => r.code === "claimed");
      expect(winners, `round ${round}: ${results.map((r) => r.code).join(",")}`).toHaveLength(1);
      for (const r of results) expect(["claimed", "already_claimed", "already_claimed_by_you"], `round ${round}`).toContain(r.code);
      const active = (await world.db.select().from(offers).where(eq(offers.donation_id, id))).filter((o) => o.status === "accepted" && o.close_reason === null);
      expect(active, `round ${round}: active assignments`).toHaveLength(1);
      const [d] = await world.db.select().from(donations).where(eq(donations.id, id));
      expect(d).toMatchObject({ status: "claimed", claimed_offer_id: active[0]!.id });
    }
  });

  it("a replay by the winner from another connection is already_claimed_by_you, never a second assignment", async () => {
    await resetWorld(world);
    const id = await makeEligibleDonation(world);
    const created = await createNextOffers({ donation_id: id }, { store: stores[0]!, clock: createTestClock(at(0)) });
    const o = created.ok ? created.data[0]! : (undefined as never);
    await openOfferForSend({ offer_id: o.id }, { store: stores[0]!, clock: createTestClock(at(0)) });
    const first = await claimOffer({ offer_ref: { offer_id: o.id }, actor: courierActor(o.courier_id), source: "messaging", source_event_id: null }, depsOf(1));
    const replays = await Promise.all([2, 3, 4, 5].map((i) => claimOffer({ offer_ref: { offer_id: o.id }, actor: courierActor(o.courier_id), source: "messaging", source_event_id: null }, depsOf(i))));
    expect(first.code).toBe("claimed");
    expect(replays.every((r) => r.code === "already_claimed_by_you")).toBe(true);
  });

  it("two donations compete for the only joined courier at once: exactly one gets the offer (one live offer per courier)", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await resetWorld(world);
      await world.db.update(messaging_identities).set({ status: "opted_out" }).where(eq(messaging_identities.id, IDENTITY.courier_b));
      const d1 = await makeEligibleDonation(world);
      const d2 = await makeEligibleDonation(world);
      const rs = await Promise.all([
        createNextOffers({ donation_id: d1 }, depsOf(1)),
        createNextOffers({ donation_id: d2 }, depsOf(2)),
      ]);
      expect(rs.every((r) => r.ok), `round ${round}`).toBe(true);
      const live = (await world.db.select().from(offers)).filter((o) => o.status === "pending_send" || o.status === "open");
      expect(live, `round ${round}: live offers`).toHaveLength(1);
      expect(live[0]!.courier_id).toBe(COURIER_A);
    }
  });

  it("the same inbound message delivered to several connections at once is processed first exactly once", async () => {
    await resetWorld(world);
    const payload = { sender_handle: "courier-a@example.invalid", text: "YES", attachments: [] };
    const rs = await Promise.all(Array.from({ length: CLIENTS }, (_, i) => recordInboundMessage("fake", "m-race-1", payload, depsOf(i))));
    expect(rs.filter((r) => r.status === "first")).toHaveLength(1);
    expect(rs.filter((r) => r.status === "duplicate")).toHaveLength(CLIENTS - 1);
    void and;
    void COURIER_B;
  });
});
