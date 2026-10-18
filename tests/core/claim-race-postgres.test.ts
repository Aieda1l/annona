import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ClaimResult, DispatchStore } from "@/contracts";
import { claimOffer, createNextOffers, createTestClock, openOfferForSend, recordInboundMessage } from "@/core";
import { createDispatchStore } from "@/db";
import { closeStore, storeInternals } from "@/db/internal";
import { runMigrations } from "@/db/run-migrations";
import { donations, messaging_identities, offers, policy_config } from "@/db/schema";
import { assertDisposableDatabase, databaseName } from "./helpers/disposable";
import { COURIER_A, IDENTITY, at, courierActor, makeEligibleDonation, resetWorld, type World } from "./helpers/world";

// T-CO-17 (REQUIRED by D-033 for any race-safety claim; CONTRACTS 8.1 "Verification rule"): independent postgres.js
// clients (one per store, each with independent connections from the default pool) race the same donation on a disposable
// real PostgreSQL, through the same connection mode as the deployed demo (Supabase transaction pooler, port 6543,
// prepare: false). PGlite serializes, so it cannot show this.
//
// Runs ONLY when TEST_DATABASE_URL is set; otherwise it is skipped and first-claim-wins stays UNVERIFIED (AC-06 not done).
// The database is migrated, seeded and, in afterAll, emptied by this test: point it at a disposable one whose name says so.
// The Postgres half of T-CO-23 (tests/core/db.test.ts) uses the same database, so run the gated files one at a time:
//   pnpm vitest run --no-file-parallelism tests/core/claim-race-postgres.test.ts tests/core/db.test.ts

// A 20-round test takes about 200 s through the pooler; 600 s leaves room for a slow network.
vi.setConfig({ testTimeout: 600_000, hookTimeout: 120_000 });

const URL = process.env.TEST_DATABASE_URL;
const CLIENTS = 6;
const ROUNDS = 20;
// Overlap: every claim of a round was in flight at the same moment (the latest start came before the earliest finish).
// It is measured on the client, so it shows the requests were concurrent, not that Postgres made one wait on the lock.
// At least 16 of 20 rounds (80%) must overlap; round 0 may not, because its connections were only just opened.
const MIN_OVERLAP_ROUNDS = 16;

type Timed = { client: number; courier_id: string; result: ClaimResult; start: number; end: number };

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
    // Leave the disposable database empty, so the Postgres half of T-CO-23 (which needs an empty database) can run next.
    if (stores.length > 0) {
      const db = storeInternals(stores[0]!).db;
      const [row] = (await db.execute(sql`select current_database() as name`)) as unknown as { name: string }[];
      if (row?.name !== databaseName(URL!)) throw new Error("T-CO-17 cleanup: connected to an unexpected database; nothing was dropped");
      await db.execute(sql.raw("drop schema if exists drizzle cascade"));
      await db.execute(sql.raw("drop schema public cascade"));
      await db.execute(sql.raw("create schema public"));
    }
    for (const s of stores) await closeStore(s);
  });

  async function setWave(n: number) {
    const [row] = await world.db.select().from(policy_config).where(eq(policy_config.active, true));
    await world.db.update(policy_config).set({ config: { ...(row!.config as object), offer_wave_size: n } }).where(eq(policy_config.policy_id, row!.policy_id));
  }

  /** One round trip on every store, so no claim pays for opening its connection during the race. */
  const warm = () => Promise.all(stores.map((s) => storeInternals(s).db.execute(sql`select 1`)));

  it(`${ROUNDS} rounds: ${CLIENTS} connections claim the open offers of one donation at once; exactly one wins every round`, async () => {
    let overlapped = 0;
    for (let round = 0; round < ROUNDS; round++) {
      await resetWorld(world);
      await setWave(2);
      const id = await makeEligibleDonation(world);
      const created = await createNextOffers({ donation_id: id }, { store: stores[0]!, clock: createTestClock(at(0)) });
      if (!created.ok) throw new Error(`round ${round}: no offers`);
      for (const o of created.data) await openOfferForSend({ offer_id: o.id }, { store: stores[0]!, clock: createTestClock(at(0)) });
      const [a, b] = created.data;
      await warm();

      // Half the connections answer offer A (courier A), half offer B (courier B).
      const results: Timed[] = await Promise.all(
        Array.from({ length: CLIENTS }, async (_, i) => {
          const mine = i % 2 === 0 ? a! : b!;
          const start = performance.now();
          const result = await claimOffer({ offer_ref: { offer_id: mine.id }, actor: courierActor(mine.courier_id), source: "messaging", source_event_id: `r${round}c${i}` }, depsOf(i));
          return { client: i, courier_id: mine.courier_id, result, start, end: performance.now() };
        }),
      );

      const count = (code: ClaimResult["code"]) => results.filter((r) => r.result.code === code).length;
      const counts = { claimed: count("claimed"), already_claimed_by_you: count("already_claimed_by_you"), already_claimed: count("already_claimed") };
      const latestStart = Math.max(...results.map((r) => r.start));
      const earliestEnd = Math.min(...results.map((r) => r.end));
      const overlap = latestStart < earliestEnd;
      if (overlap) overlapped++;
      console.log(
        `T-CO-17 round ${round}: claimed=${counts.claimed} already_claimed_by_you=${counts.already_claimed_by_you} already_claimed=${counts.already_claimed}` +
          ` overlap=${overlap} (latest start ${(latestStart - Math.min(...results.map((r) => r.start))).toFixed(1)} ms, earliest finish ${(earliestEnd - Math.min(...results.map((r) => r.start))).toFixed(1)} ms)`,
      );

      // Exact outcome: one winner; the winner's other two connections replay it; the other courier's three lose.
      const detail = `round ${round}: ${results.map((r) => `c${r.client}=${r.result.code}`).join(",")}`;
      expect(counts, detail).toEqual({ claimed: 1, already_claimed_by_you: CLIENTS / 2 - 1, already_claimed: CLIENTS / 2 });
      const winner = results.find((r) => r.result.code === "claimed")!;
      for (const r of results) {
        if (r.result.code === "already_claimed") {
          // A loser never gets the pickup or drop-off address.
          expect(r.result.assignment, `${detail}: c${r.client} lost but got an assignment`).toBeNull();
          expect(r.courier_id, detail).not.toBe(winner.courier_id);
        } else {
          expect(r.courier_id, detail).toBe(winner.courier_id);
        }
      }

      const active = (await world.db.select().from(offers).where(eq(offers.donation_id, id))).filter((o) => o.status === "accepted" && o.close_reason === null);
      expect(active, `round ${round}: active assignments`).toHaveLength(1);
      expect(active[0]!.id).toBe(winner.result.offer_id);
      const [d] = await world.db.select().from(donations).where(eq(donations.id, id));
      expect(d).toMatchObject({ status: "claimed", claimed_offer_id: active[0]!.id });
    }
    console.log(`T-CO-17 overlap: ${overlapped}/${ROUNDS} rounds (threshold ${MIN_OVERLAP_ROUNDS})`);
    expect(overlapped).toBeGreaterThanOrEqual(MIN_OVERLAP_ROUNDS);
  });

  it("a replay by the winner from another connection is already_claimed_by_you, never a second assignment", async () => {
    await resetWorld(world);
    const id = await makeEligibleDonation(world);
    const created = await createNextOffers({ donation_id: id }, { store: stores[0]!, clock: createTestClock(at(0)) });
    if (!created.ok) throw new Error("no offers");
    const o = created.data[0]!;
    await openOfferForSend({ offer_id: o.id }, { store: stores[0]!, clock: createTestClock(at(0)) });
    const first = await claimOffer({ offer_ref: { offer_id: o.id }, actor: courierActor(o.courier_id), source: "messaging", source_event_id: null }, depsOf(1));
    const replays = await Promise.all([2, 3, 4, 5].map((i) => claimOffer({ offer_ref: { offer_id: o.id }, actor: courierActor(o.courier_id), source: "messaging", source_event_id: null }, depsOf(i))));
    expect(first.code).toBe("claimed");
    expect(replays.every((r) => r.code === "already_claimed_by_you")).toBe(true);
    const active = (await world.db.select().from(offers).where(eq(offers.donation_id, id))).filter((x) => x.status === "accepted" && x.close_reason === null);
    expect(active).toHaveLength(1);
    expect(active[0]!.id).toBe(o.id);
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
    // resetWorld keeps the inbound ledger (as resetDemo does), so a fixed id would already be a duplicate on the second
    // run against the same disposable database. A fresh id per run keeps this test repeatable.
    const messageId = `m-race-${randomUUID()}`;
    const payload = { sender_handle: "courier-a@example.invalid", text: "YES", attachments: [] };
    const rs = await Promise.all(Array.from({ length: CLIENTS }, (_, i) => recordInboundMessage("fake", messageId, payload, depsOf(i))));
    expect(rs.filter((r) => r.status === "first")).toHaveLength(1);
    expect(rs.filter((r) => r.status === "duplicate")).toHaveLength(CLIENTS - 1);
  });
});
