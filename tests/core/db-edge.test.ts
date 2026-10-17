import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_ACTORS, type DispatchStore } from "@/contracts";
import { createDispatchStore } from "@/db";
import { closeStore, storeInternals } from "@/db/internal";
import { runMigrations } from "@/db/run-migrations";
import { SEED_IDENTITY_IDS, buildSeed, seedStore } from "@/db/seed/seed";
import {
  audit_events,
  couriers,
  donation_images,
  donations,
  donors,
  messaging_identities,
  offers,
  outbound_messages,
  recipients,
  system_status,
  verification_links,
} from "@/db/schema";

// Edge cases beyond T-CO-23: foreign keys, NOT NULL, value CHECKs, round trips, persistence, and refusal paths.

const NOW = new Date("2026-10-17T23:10:00.123Z");
const actor = (key: string) => DEMO_ACTORS.find((a) => a.key === key)!.actor_id;
const DONOR = actor("donor_rainier");
const EASTLAKE = actor("recipient_eastlake");
const COURIER_A = actor("courier_a");

class Rollback extends Error {}
type Tx = Parameters<Parameters<ReturnType<typeof storeInternals>["db"]["transaction"]>[0]>[0];
const sqlState = (err: unknown): string | undefined => {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
};
async function inRollback(store: DispatchStore, fn: (tx: Tx) => Promise<void>): Promise<unknown> {
  try {
    await storeInternals(store).db.transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    });
  } catch (err) {
    return err instanceof Rollback ? undefined : err;
  }
  return undefined;
}

const fresh = async () => {
  const s = createDispatchStore({ kind: "pglite", database_url: undefined, pglite_dir: undefined });
  await runMigrations(s);
  await seedStore(s, { now: NOW, messaging_provider: "fake" });
  return s;
};

const donationRow = (over: Partial<typeof donations.$inferInsert> = {}): typeof donations.$inferInsert => ({
  id: randomUUID(),
  donor_id: DONOR,
  status: "draft",
  source: "fixture",
  ai_status: "pending",
  created_at: NOW,
  updated_at: NOW,
  ...over,
});
const offerRow = (donation_id: string, over: Partial<typeof offers.$inferInsert> = {}): typeof offers.$inferInsert => ({
  id: randomUUID(),
  donation_id,
  recipient_id: EASTLAKE,
  courier_id: COURIER_A,
  short_code: "K7M3",
  status: "expired",
  wave_no: 1,
  created_at: NOW,
  provider_mode: "fake",
  candidate: {},
  ...over,
});

describe("db edge: the injected Clock is the only time source", () => {
  let store: DispatchStore;
  beforeAll(async () => {
    store = await fresh();
  });
  afterAll(async () => closeStore(store));

  it("no table fills a timestamp from the database clock", async () => {
    const res = await storeInternals(store).db.execute(
      sql`select table_name, column_name, column_default from information_schema.columns
          where table_schema = 'public' and data_type like 'timestamp%' and column_default is not null`,
    );
    const rows = (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as { table_name: string; column_name: string; column_default: string }[];
    expect(rows).toEqual([]);
  });

  it.each([
    ["donations.created_at", () => ({ ...donationRow(), created_at: undefined })],
    ["donations.updated_at", () => ({ ...donationRow(), updated_at: undefined })],
  ])("%s must be supplied by the caller", async (_name, make) => {
    const err = await inRollback(store, async (tx) => void (await tx.insert(donations).values(make() as never)));
    expect(sqlState(err) ?? String(err)).toMatch(/23502|null|not-null/i);
  });

  it("offers.created_at, images.created_at, outbound.created_at and system_status.updated_at must be supplied", async () => {
    const d = donationRow();
    const e1 = await inRollback(store, async (tx) => {
      await tx.insert(donations).values(d);
      await tx.insert(offers).values({ ...offerRow(d.id!), created_at: undefined } as never);
    });
    expect(sqlState(e1)).toBe("23502");
    const e2 = await inRollback(store, async (tx) => void (await tx.insert(donation_images).values({ mime: "image/png", bytes: new Uint8Array(1), sha256: "a" } as never)));
    expect(sqlState(e2)).toBe("23502");
    const e3 = await inRollback(store, async (tx) => void (await tx.insert(outbound_messages).values({ identity_id: SEED_IDENTITY_IDS.courier_a, purpose: "offer", text: "x", idempotency_key: "k", provider_mode: "fake" } as never)));
    expect(sqlState(e3)).toBe("23502");
    const e4 = await inRollback(store, async (tx) => void (await tx.insert(system_status).values({ key: "last_tick_at", value: {} } as never)));
    expect(sqlState(e4)).toBe("23502");
  });
});

describe("db edge: allergen and handling values are validated (an unknown value must not silently never match)", () => {
  let store: DispatchStore;
  beforeAll(async () => {
    store = await fresh();
  });
  afterAll(async () => closeStore(store));
  const base = () => buildSeed({ now: NOW, messaging_provider: "fake" }).recipientRows[0]!;

  it("rejects a misspelled excluded allergen", async () => {
    for (const bad of [["peanut"], ["Peanuts"], ["tree nuts"], ["peanuts", "nuts"], [""]]) {
      const err = await inRollback(store, async (tx) => void (await tx.insert(recipients).values({ ...base(), id: randomUUID(), excluded_allergens: bad })));
      expect(sqlState(err), JSON.stringify(bad)).toBe("23514");
    }
  });
  it("accepts every one of the nine allergens, and an empty list", async () => {
    const all = ["milk", "eggs", "fish", "crustacean_shellfish", "tree_nuts", "peanuts", "wheat", "soybeans", "sesame"];
    for (const ok of [all, [], ["sesame"]]) {
      expect(await inRollback(store, async (tx) => void (await tx.insert(recipients).values({ ...base(), id: randomUUID(), excluded_allergens: ok })))).toBeUndefined();
    }
  });
  it("rejects an unknown handling mode in accepts_handling_modes", async () => {
    for (const bad of [["fridge"], ["Refrigerated"], ["refrigerated", "cold"]]) {
      const err = await inRollback(store, async (tx) => void (await tx.insert(recipients).values({ ...base(), id: randomUUID(), accepts_handling_modes: bad })));
      expect(sqlState(err), JSON.stringify(bad)).toBe("23514");
    }
  });
});

describe("db edge: foreign keys and required columns", () => {
  let store: DispatchStore;
  beforeAll(async () => {
    store = await fresh();
  });
  afterAll(async () => closeStore(store));

  it("an offer needs a real donation, recipient and courier", async () => {
    const d = donationRow();
    expect(sqlState(await inRollback(store, async (tx) => void (await tx.insert(offers).values(offerRow(randomUUID()))))) ).toBe("23503");
    expect(sqlState(await inRollback(store, async (tx) => { await tx.insert(donations).values(d); await tx.insert(offers).values(offerRow(d.id!, { recipient_id: randomUUID() })); }))).toBe("23503");
    expect(sqlState(await inRollback(store, async (tx) => { await tx.insert(donations).values(d); await tx.insert(offers).values(offerRow(d.id!, { courier_id: randomUUID() })); }))).toBe("23503");
  });
  it("a verification link needs a real donation and donor", async () => {
    const d = donationRow();
    const link = { id: randomUUID(), donation_id: d.id!, donor_id: DONOR, token_hash: "h1", issued_at: NOW, expires_at: NOW };
    expect(sqlState(await inRollback(store, async (tx) => void (await tx.insert(verification_links).values({ ...link, donation_id: randomUUID() }))))).toBe("23503");
    expect(sqlState(await inRollback(store, async (tx) => { await tx.insert(donations).values(d); await tx.insert(verification_links).values({ ...link, donor_id: randomUUID() }); }))).toBe("23503");
  });
  it("an outbound message needs a real identity", async () => {
    const err = await inRollback(store, async (tx) => void (await tx.insert(outbound_messages).values({ identity_id: randomUUID(), purpose: "offer", text: "x", idempotency_key: "z", provider_mode: "fake", created_at: NOW })));
    expect(sqlState(err)).toBe("23503");
  });
  it("a donor with donations cannot be deleted (history is kept)", async () => {
    const d = donationRow();
    const err = await inRollback(store, async (tx) => {
      await tx.insert(donations).values(d);
      await tx.execute(sql`delete from donors where id = ${DONOR}`);
    });
    expect(sqlState(err)).toBe("23503");
  });
  it("audit events survive when their donation is gone (no foreign keys)", async () => {
    const err = await inRollback(store, async (tx) => {
      await tx.insert(audit_events).values({ at: NOW, donation_id: randomUUID(), offer_id: randomUUID(), type: "demo.reset", actor_role: "system" });
    });
    expect(err).toBeUndefined();
  });
  it("audit actor_role is checked", async () => {
    const err = await inRollback(store, async (tx) => void (await tx.insert(audit_events).values({ at: NOW, type: "demo.reset", actor_role: "admin" })));
    expect(sqlState(err)).toBe("23514");
  });
  it("is_synthetic cannot be false anywhere it exists", async () => {
    for (const make of [
      (tx: Tx) => tx.insert(donations).values({ ...donationRow(), is_synthetic: false } as never),
      (tx: Tx) => tx.update(couriers).set({ is_synthetic: false } as never),
      (tx: Tx) => tx.update(recipients).set({ is_synthetic: false } as never),
    ]) {
      expect(sqlState(await inRollback(store, async (tx) => void (await make(tx))))).toBe("23514");
    }
  });
  it("negative capacity is refused", async () => {
    const err = await inRollback(store, async (tx) => void (await tx.update(recipients).set({ capacity_servings_available: -1 }).where(eq(recipients.id, EASTLAKE))));
    expect(sqlState(err)).toBe("23514");
  });
  it("offers.wave_no must be at least 1 and delivery_status is checked", async () => {
    const d = donationRow();
    expect(sqlState(await inRollback(store, async (tx) => { await tx.insert(donations).values(d); await tx.insert(offers).values(offerRow(d.id!, { wave_no: 0 })); }))).toBe("23514");
    expect(sqlState(await inRollback(store, async (tx) => { await tx.insert(donations).values(d); await tx.insert(offers).values(offerRow(d.id!, { delivery_status: "seen" })); }))).toBe("23514");
  });
});

describe("db edge: values survive a round trip exactly", () => {
  let store: DispatchStore;
  beforeAll(async () => {
    store = await fresh();
  });
  afterAll(async () => closeStore(store));

  it("timestamps keep millisecond precision and read back as the same instant", async () => {
    const d = donationRow({ effective_cutoff_at: NOW, collected_at: new Date("2026-10-18T01:30:00.999Z") });
    let back: typeof donations.$inferSelect | undefined;
    await inRollback(store, async (tx) => {
      await tx.insert(donations).values(d);
      back = (await tx.select().from(donations).where(eq(donations.id, d.id!)))[0];
    });
    expect(back?.created_at.toISOString()).toBe("2026-10-17T23:10:00.123Z");
    expect(back?.collected_at?.toISOString()).toBe("2026-10-18T01:30:00.999Z");
    expect(back?.effective_cutoff_at?.getTime()).toBe(NOW.getTime());
  });
  it("jsonb keeps nested values, nulls and unicode; arrays keep order and empties", async () => {
    const facts = { dish_name: "Crème brûlée 🍮", n: 1.5, deep: { a: [1, null, { b: "c" }] }, empty: {}, no: null };
    const d = donationRow({ verified_facts: facts, edited_from_ai: ["dish_name", "allergens.sesame"], latest_decision: null });
    let back: typeof donations.$inferSelect | undefined;
    await inRollback(store, async (tx) => {
      await tx.insert(donations).values(d);
      back = (await tx.select().from(donations).where(eq(donations.id, d.id!)))[0];
    });
    expect(back?.verified_facts).toEqual(facts);
    expect(back?.edited_from_ai).toEqual(["dish_name", "allergens.sesame"]);
    expect(back?.latest_decision).toBeNull();
  });
  it("edited_from_ai defaults to an empty array, never null", async () => {
    const d = donationRow();
    let back: typeof donations.$inferSelect | undefined;
    await inRollback(store, async (tx) => {
      await tx.insert(donations).values(d);
      back = (await tx.select().from(donations).where(eq(donations.id, d.id!)))[0];
    });
    expect(back?.edited_from_ai).toEqual([]);
    expect(back?.version).toBe(1);
  });
  it("image bytes round trip byte for byte", async () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    let got: Uint8Array | undefined;
    await inRollback(store, async (tx) => {
      const id = randomUUID();
      await tx.insert(donation_images).values({ id, mime: "image/png", bytes, sha256: "abc", created_at: NOW });
      got = (await tx.select().from(donation_images).where(eq(donation_images.id, id)))[0]?.bytes;
    });
    expect(got && Array.from(got)).toEqual(Array.from(bytes));
  });
  it("an affiliated_recipient_ids array of uuids reads back as strings in order", async () => {
    const ids = [EASTLAKE, actor("recipient_youth")];
    let back: string[] | undefined;
    await inRollback(store, async (tx) => {
      await tx.update(couriers).set({ affiliated_recipient_ids: ids }).where(eq(couriers.id, COURIER_A));
      back = (await tx.select().from(couriers).where(eq(couriers.id, COURIER_A)))[0]?.affiliated_recipient_ids;
    });
    expect(back).toEqual(ids);
  });
});

describe("db edge: store lifecycle and refusal paths", () => {
  it("an unknown store kind is refused, never treated as pglite", () => {
    expect(() => createDispatchStore({ kind: "sqlite" as never, database_url: undefined, pglite_dir: undefined })).toThrow(/kind/);
    expect(() => createDispatchStore({ kind: undefined as never, database_url: undefined, pglite_dir: undefined })).toThrow(/kind/);
  });
  it("postgres with an empty or blank database_url fails loudly", () => {
    for (const url of ["", "   "]) {
      expect(() => createDispatchStore({ kind: "postgres", database_url: url, pglite_dir: undefined })).toThrow(/database_url/);
    }
  });
  it("using a store after close, or a store we never made, throws a clear error", async () => {
    const s = createDispatchStore({ kind: "pglite", database_url: undefined, pglite_dir: undefined });
    await closeStore(s);
    expect(() => storeInternals(s)).toThrow(/Unknown DispatchStore/);
    await expect(closeStore(s)).resolves.toBeUndefined();
    expect(() => storeInternals({ kind: "pglite" })).toThrow(/Unknown DispatchStore/);
    await expect(runMigrations({ kind: "pglite" })).rejects.toThrow(/Unknown DispatchStore/);
    await expect(seedStore({ kind: "pglite" }, { now: NOW, messaging_provider: "fake" })).rejects.toThrow(/Unknown DispatchStore/);
  });
  it("two stores are independent databases", async () => {
    const a = await fresh();
    const b = await fresh();
    try {
      await storeInternals(a).db.update(recipients).set({ capacity_servings_available: 1 }).where(eq(recipients.id, EASTLAKE));
      const rowB = (await storeInternals(b).db.select().from(recipients).where(eq(recipients.id, EASTLAKE)))[0];
      expect(rowB?.capacity_servings_available).toBe(200);
    } finally {
      await closeStore(a);
      await closeStore(b);
    }
  });
  it("a PGlite directory persists data across close and reopen, and migrations stay a no-op", async () => {
    const dir = mkdtempSync(join(tmpdir(), "annona-pglite-"));
    try {
      const s1 = createDispatchStore({ kind: "pglite", database_url: undefined, pglite_dir: dir });
      await runMigrations(s1);
      await seedStore(s1, { now: NOW, messaging_provider: "fake" });
      await storeInternals(s1).db.update(messaging_identities).set({ status: "joined", joined_at: NOW }).where(eq(messaging_identities.id, SEED_IDENTITY_IDS.courier_a));
      await closeStore(s1);

      const s2 = createDispatchStore({ kind: "pglite", database_url: undefined, pglite_dir: dir });
      await runMigrations(s2);
      await runMigrations(s2);
      const ident = (await storeInternals(s2).db.select().from(messaging_identities).where(eq(messaging_identities.id, SEED_IDENTITY_IDS.courier_a)))[0];
      expect(ident?.status).toBe("joined");
      await closeStore(s2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("duplicate handles are refused before any SQL runs", async () => {
    const s = createDispatchStore({ kind: "pglite", database_url: undefined, pglite_dir: undefined });
    await runMigrations(s);
    try {
      // resolveHandles rejects this in buildSeed, ahead of the transaction.
      await expect(
        seedStore(s, { now: NOW, messaging_provider: "fake", handles: { donor: "same@example.invalid", courier_a: "same@example.invalid", courier_b: "b@example.invalid" } }),
      ).rejects.toThrow(/must differ/);
      const { db } = storeInternals(s);
      expect(await db.select().from(recipients)).toEqual([]);
      expect(await db.select().from(messaging_identities)).toEqual([]);
    } finally {
      await closeStore(s);
    }
  });
  it("a seed that fails inside its transaction leaves nothing half written", async () => {
    const s = createDispatchStore({ kind: "pglite", database_url: undefined, pglite_dir: undefined });
    await runMigrations(s);
    try {
      const { db } = storeInternals(s);
      // Another identity already holds the donor's (provider, handle). The seed's identity insert (after donors,
      // recipients and couriers were written) hits UNIQUE (provider, handle), so the whole transaction must roll back.
      await db.insert(messaging_identities).values({
        id: randomUUID(),
        actor_role: "donor",
        actor_id: randomUUID(),
        provider: "fake",
        handle: "donor@example.invalid",
        status: "awaiting_join",
        provider_space_id: null,
        provider_sender_id: null,
        joined_at: null,
        opted_out_at: null,
      });
      await expect(seedStore(s, { now: NOW, messaging_provider: "fake" })).rejects.toThrow();
      expect(await db.select().from(donors)).toEqual([]);
      expect(await db.select().from(recipients)).toEqual([]);
      expect(await db.select().from(couriers)).toEqual([]);
      expect(await db.select().from(messaging_identities)).toHaveLength(1);
    } finally {
      await closeStore(s);
    }
  });
});

describe("db edge: seed input validation", () => {
  it("blank or whitespace handles count as unset (fake falls back to synthetic, photon refuses)", () => {
    const fake = buildSeed({ now: NOW, messaging_provider: "fake", handles: { donor: "", courier_a: "   ", courier_b: undefined } });
    for (const r of fake.identityRows) expect(r.handle).toMatch(/@example\.invalid$/);
    expect(() => buildSeed({ now: NOW, messaging_provider: "photon", handles: { donor: "d@t.test", courier_a: "  ", courier_b: "b@t.test" } })).toThrow(/courier_a/);
  });
  it("handles are trimmed", () => {
    const { identityRows } = buildSeed({ now: NOW, messaging_provider: "photon", handles: { donor: " d@t.test ", courier_a: "a@t.test\n", courier_b: "b@t.test" } });
    expect(identityRows.map((r) => r.handle)).toEqual(["d@t.test", "a@t.test", "b@t.test"]);
  });
  it("the same handle for two personas is refused with a clear message", () => {
    expect(() => buildSeed({ now: NOW, messaging_provider: "photon", handles: { donor: "x@t.test", courier_a: "x@t.test", courier_b: "b@t.test" } })).toThrow(/must differ/);
    expect(() => buildSeed({ now: NOW, messaging_provider: "photon", handles: { donor: "X@t.test", courier_a: "x@t.test", courier_b: "b@t.test" } })).toThrow(/must differ/);
  });
  it("an invalid now is refused", () => {
    expect(() => buildSeed({ now: new Date("nope"), messaging_provider: "fake" })).toThrow(/now/);
  });
  it("an unknown messaging provider is refused", () => {
    expect(() => buildSeed({ now: NOW, messaging_provider: "sms" as never })).toThrow(/messaging_provider/);
  });
  it("every seeded profile is synthetic and the seed contains no phone-number literal", () => {
    const { donorRows, recipientRows, courierRows, identityRows } = buildSeed({ now: NOW, messaging_provider: "fake" });
    const phone = /\+?\d[\d ().-]{8,}\d/;
    for (const h of identityRows.map((r) => r.handle)) expect(h).not.toMatch(phone);
    for (const r of [...donorRows, ...recipientRows, ...courierRows]) {
      expect(r.location.address_line).not.toMatch(phone);
      expect(r.display_name).not.toMatch(phone);
    }
    for (const r of [...donorRows, ...recipientRows, ...courierRows]) {
      expect(r.is_synthetic).toBe(true);
      expect(r.display_name).toMatch(/synthetic/i);
    }
  });
  it("seed ids are unique and Eastlake is the only recipient the couriers are affiliated with", () => {
    const { donorRows, recipientRows, courierRows, identityRows } = buildSeed({ now: NOW, messaging_provider: "fake" });
    const ids = [...donorRows, ...recipientRows, ...courierRows, ...identityRows].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of courierRows) expect(c.affiliated_recipient_ids).toEqual([EASTLAKE]);
  });
  it("seed profiles are consistent with what matching needs: usable before they close, every demo scene fits capacity", () => {
    const { recipientRows, courierRows } = buildSeed({ now: NOW, messaging_provider: "fake" });
    for (const r of recipientRows) {
      expect(r.receiving_closes_at.getTime()).toBeGreaterThan(NOW.getTime());
      expect(r.capacity_servings_available).toBeGreaterThanOrEqual(200);
    }
    for (const c of courierRows) expect(c.available_until.getTime()).toBeGreaterThan(NOW.getTime());
  });
});
