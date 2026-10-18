import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DEMO_ACTORS, type DispatchStore } from "@/contracts";
import { createDispatchStore } from "@/db";
import { closeStore, storeInternals } from "@/db/internal";
import { runMigrations } from "@/db/run-migrations";
import { buildSeed, SEED_IDENTITY_IDS, seedStore } from "@/db/seed/seed";
import {
  couriers,
  donation_images,
  donations,
  donors,
  inbound_messages,
  messaging_identities,
  offers,
  outbound_messages,
  policy_config,
  provider_status_events,
  recipients,
  verification_links,
} from "@/db/schema";
import { assertDisposableDatabase, emptyDisposableDatabase } from "./helpers/disposable";

// Each test file starts one or more WASM Postgres instances. Under the parallel full run that can exceed the 5 s default.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

// T-CO-23: empty DB -> migrate -> seed applies cleanly; seed is deterministic and uses DEMO_ACTORS ids;
// the partial unique indexes and CHECKs from ARCHITECTURE §7 hold. PGlite always; Postgres only if TEST_DATABASE_URL
// is set. The schema checks below roll back, but the Postgres setup (migrate + seed) COMMITS and overwrites demo rows
// and the active policy, so TEST_DATABASE_URL must be an empty, disposable database (the name must say so; see the guard).

const NOW = new Date("2026-10-17T23:10:00.000Z");
const actor = (key: string) => DEMO_ACTORS.find((a) => a.key === key)!.actor_id;
const DONOR = actor("donor_rainier");
const EASTLAKE = actor("recipient_eastlake");
const COURIER_A = actor("courier_a");
const COURIER_B = actor("courier_b");

class Rollback extends Error {}

type Tx = Parameters<Parameters<ReturnType<typeof storeInternals>["db"]["transaction"]>[0]>[0];

function sqlState(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

/** Runs `fn` in a transaction that always rolls back, so nothing persists (safe on any database). */
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

const expectOk = async (store: DispatchStore, fn: (tx: Tx) => Promise<void>) => expect(await inRollback(store, fn)).toBeUndefined();
const expectCode = async (store: DispatchStore, code: string, fn: (tx: Tx) => Promise<void>) =>
  expect(sqlState(await inRollback(store, fn))).toBe(code);

const UNIQUE = "23505";
const CHECK = "23514";

let n = 0;
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
const ALPHABET = "ACDEFHJKMNPRTUVWXY3479";
const code = () => `${ALPHABET[n++ % 22]}${ALPHABET[(n * 7) % 22]}KM`;
const offerRow = (donation_id: string, courier_id: string, over: Partial<typeof offers.$inferInsert> = {}): typeof offers.$inferInsert => ({
  id: randomUUID(),
  donation_id,
  recipient_id: EASTLAKE,
  courier_id,
  short_code: code(),
  status: "pending_send",
  wave_no: 1,
  created_at: NOW,
  provider_mode: "fake",
  candidate: {} as never,
  // An open offer always carries a deadline (offers_open_has_deadline_check).
  ...(over.status === "open" ? { sent_at: NOW, expires_at: new Date(NOW.getTime() + 60_000) } : {}),
  ...over,
});
const linkRow = (donation_id: string, over: Partial<typeof verification_links.$inferInsert> = {}): typeof verification_links.$inferInsert => ({
  id: randomUUID(),
  donation_id,
  donor_id: DONOR,
  token_hash: randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", ""),
  issued_at: NOW,
  expires_at: new Date(NOW.getTime() + 30 * 60_000),
  ...over,
});

function schemaChecks(getStore: () => DispatchStore) {
  it("seed: personas use the DEMO_ACTORS ids and the spec's cast", async () => {
    const { db } = storeInternals(getStore());
    const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();
    const ofRole = (role: string) => DEMO_ACTORS.filter((a) => a.role === role).map((a) => a.actor_id).sort();
    expect(ids(await db.select().from(donors))).toEqual(ofRole("donor"));
    expect(ids(await db.select().from(recipients))).toEqual(ofRole("recipient"));
    expect(ids(await db.select().from(couriers))).toEqual(ofRole("courier"));
    const byId = new Map((await db.select().from(donors)).map((d) => [d.id, d]));
    expect(byId.get(DONOR)?.approval_status).toBe("approved");
    expect(byId.get(actor("donor_pending"))?.approval_status).toBe("pending");
    expect(byId.get(actor("donor_suspended"))?.approval_status).toBe("suspended");
    const rec = new Map((await db.select().from(recipients)).map((r) => [r.id, r]));
    expect(rec.get(actor("recipient_youth"))?.excluded_allergens).toEqual(["peanuts", "tree_nuts"]);
    expect(rec.get(actor("recipient_unregistered"))?.registered_dfdo).toBe(false);
    expect(rec.get(actor("recipient_hsp"))?.serves_highly_susceptible_population).toBe(true);
    expect(rec.get(EASTLAKE)?.capacity_servings_available).toBeGreaterThanOrEqual(200);
    const cou = new Map((await db.select().from(couriers)).map((c) => [c.id, c]));
    expect(cou.get(COURIER_A)?.capabilities.cold_transport).toBe(true);
    expect(cou.get(COURIER_B)?.capabilities.cold_transport).toBe(true);
    expect(cou.get(actor("courier_c"))?.capabilities.cold_transport).toBe(false);
    for (const c of cou.values()) expect(c.affiliated_recipient_ids).toContain(EASTLAKE);
  });

  it("seed: includes the donor messaging identity and both courier identities, awaiting JOIN", async () => {
    const rows = await storeInternals(getStore()).db.select().from(messaging_identities);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(SEED_IDENTITY_IDS.donor)).toMatchObject({ actor_role: "donor", actor_id: DONOR, status: "awaiting_join" });
    expect(byId.get(SEED_IDENTITY_IDS.courier_a)).toMatchObject({ actor_role: "courier", actor_id: COURIER_A, status: "awaiting_join" });
    expect(byId.get(SEED_IDENTITY_IDS.courier_b)).toMatchObject({ actor_role: "courier", actor_id: COURIER_B, status: "awaiting_join" });
  });

  it("seed: exactly one active policy row with the demo values", async () => {
    const rows = await storeInternals(getStore()).db.select().from(policy_config);
    const active = rows.filter((r) => r.active);
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ policy_id: "annona-prototype-refrigerated", policy_version: "2026-10-17.1" });
  });

  it("verification_links has no raw token column (only token_hash)", async () => {
    const res = await storeInternals(getStore()).db.execute(
      sql`select column_name from information_schema.columns where table_name = 'verification_links'`,
    );
    const rows = (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as { column_name: string }[];
    const names = rows.map((r) => r.column_name);
    expect(names).toContain("token_hash");
    expect(names).not.toContain("token");
    expect(names.some((c) => c === "raw_token" || c === "token_raw")).toBe(false);
  });

  describe("one active assignment per donation (F1)", () => {
    it("a second active accepted offer for one donation violates the partial unique index", async () => {
      await expectCode(getStore(), UNIQUE, async (tx) => {
        const d = donationRow();
        await tx.insert(donations).values(d);
        await tx.insert(offers).values(offerRow(d.id!, COURIER_A, { status: "accepted" }));
        await tx.insert(offers).values(offerRow(d.id!, COURIER_B, { status: "accepted" }));
      });
    });
    it("an accepted offer with a close_reason is history and does not block a new assignment", async () => {
      await expectOk(getStore(), async (tx) => {
        const d = donationRow();
        await tx.insert(donations).values(d);
        await tx.insert(offers).values(offerRow(d.id!, COURIER_A, { status: "accepted", close_reason: "courier_opted_out" }));
        await tx.insert(offers).values(offerRow(d.id!, COURIER_B, { status: "accepted" }));
      });
    });
  });

  describe("one live offer per courier (M-09)", () => {
    it("a second pending_send or open offer for one courier violates the courier index", async () => {
      await expectCode(getStore(), UNIQUE, async (tx) => {
        const d1 = donationRow();
        const d2 = donationRow();
        await tx.insert(donations).values([d1, d2]);
        await tx.insert(offers).values(offerRow(d1.id!, COURIER_A, { status: "pending_send" }));
        await tx.insert(offers).values(offerRow(d2.id!, COURIER_A, { status: "open" }));
      });
    });
    it("expired, declined and accepted offers do not count as live", async () => {
      await expectOk(getStore(), async (tx) => {
        const donationsList = [donationRow(), donationRow(), donationRow(), donationRow()];
        await tx.insert(donations).values(donationsList);
        const [a, b, c, d] = donationsList.map((x) => x.id!) as [string, string, string, string];
        await tx.insert(offers).values(offerRow(a, COURIER_A, { status: "expired" }));
        await tx.insert(offers).values(offerRow(b, COURIER_A, { status: "declined" }));
        await tx.insert(offers).values(offerRow(c, COURIER_A, { status: "accepted" }));
        await tx.insert(offers).values(offerRow(d, COURIER_A, { status: "open" }));
      });
    });
  });

  describe("short codes (D-026)", () => {
    it("a short_code is never reused, even after its offer expired", async () => {
      await expectCode(getStore(), UNIQUE, async (tx) => {
        const d = donationRow();
        await tx.insert(donations).values(d);
        await tx.insert(offers).values(offerRow(d.id!, COURIER_A, { short_code: "K7M3", status: "expired" }));
        await tx.insert(offers).values(offerRow(d.id!, COURIER_B, { short_code: "K7M3", status: "open" }));
      });
    });
    it("a short_code outside the alphabet or length fails the CHECK", async () => {
      for (const bad of ["k7m3", "K7M", "K7M33", "B0O1", "I1L0"]) {
        await expectCode(getStore(), CHECK, async (tx) => {
          const d = donationRow();
          await tx.insert(donations).values(d);
          await tx.insert(offers).values(offerRow(d.id!, COURIER_A, { short_code: bad }));
        });
      }
    });
  });

  describe("verification links (D-031)", () => {
    it("a second live link for one donation violates the unique index", async () => {
      await expectCode(getStore(), UNIQUE, async (tx) => {
        const d = donationRow();
        await tx.insert(donations).values(d);
        await tx.insert(verification_links).values(linkRow(d.id!));
        await tx.insert(verification_links).values(linkRow(d.id!));
      });
    });
    it("a new link is allowed once the old one is consumed or revoked", async () => {
      await expectOk(getStore(), async (tx) => {
        const d = donationRow();
        await tx.insert(donations).values(d);
        await tx.insert(verification_links).values(linkRow(d.id!, { consumed_at: NOW }));
        await tx.insert(verification_links).values(linkRow(d.id!, { revoked_at: NOW }));
        await tx.insert(verification_links).values(linkRow(d.id!));
      });
    });
    it("token_hash is unique", async () => {
      await expectCode(getStore(), UNIQUE, async (tx) => {
        const d1 = donationRow();
        const d2 = donationRow();
        await tx.insert(donations).values([d1, d2]);
        await tx.insert(verification_links).values(linkRow(d1.id!, { token_hash: "a".repeat(64) }));
        await tx.insert(verification_links).values(linkRow(d2.id!, { token_hash: "a".repeat(64) }));
      });
    });
  });

  describe("donations", () => {
    it("a duplicate (source, source_ref) violates the unique index", async () => {
      await expectCode(getStore(), UNIQUE, async (tx) => {
        await tx.insert(donations).values(donationRow({ source: "messaging", source_ref: "fake:msg-1" }));
        await tx.insert(donations).values(donationRow({ source: "messaging", source_ref: "fake:msg-1" }));
      });
    });
    it("the same source_ref under another source, and null source_refs, are allowed", async () => {
      await expectOk(getStore(), async (tx) => {
        await tx.insert(donations).values(donationRow({ source: "messaging", source_ref: "fake:msg-2" }));
        await tx.insert(donations).values(donationRow({ source: "web_upload", source_ref: "fake:msg-2" }));
        await tx.insert(donations).values([donationRow({ source_ref: null }), donationRow({ source_ref: null })]);
      });
    });
    it("status, source and version are checked", async () => {
      await expectCode(getStore(), CHECK, async (tx) => void (await tx.insert(donations).values(donationRow({ status: "safe" }))));
      await expectCode(getStore(), CHECK, async (tx) => void (await tx.insert(donations).values(donationRow({ source: "email" }))));
      await expectCode(getStore(), CHECK, async (tx) => void (await tx.insert(donations).values(donationRow({ version: 0 }))));
      for (const status of ["unmatched", "needs_review", "delivered"]) {
        await expectOk(getStore(), async (tx) => void (await tx.insert(donations).values(donationRow({ status }))));
      }
    });
    it("a donation must belong to a real donor", async () => {
      await expectCode(getStore(), "23503", async (tx) => void (await tx.insert(donations).values(donationRow({ donor_id: randomUUID() }))));
    });
  });

  describe("messages and events", () => {
    it("inbound messages are unique per (provider, provider_message_id)", async () => {
      await expectCode(getStore(), UNIQUE, async (tx) => {
        const row = { provider: "fake", provider_message_id: "m-1", received_at: NOW };
        await tx.insert(inbound_messages).values(row);
        await tx.insert(inbound_messages).values(row);
      });
      await expectOk(getStore(), async (tx) => {
        await tx.insert(inbound_messages).values({ provider: "fake", provider_message_id: "m-1", received_at: NOW });
        await tx.insert(inbound_messages).values({ provider: "photon", provider_message_id: "m-1", received_at: NOW });
      });
    });
    it("an ignored sender can be stored with sender_handle and payload null", async () => {
      await expectOk(getStore(), async (tx) => {
        await tx.insert(inbound_messages).values({ provider: "fake", provider_message_id: "m-2", received_at: NOW, handle_masked: "***1234", ignore_reason: "unknown_sender", sender_handle: null, payload: null });
      });
    });
    it("provider status events are unique per (provider, provider_event_id)", async () => {
      await expectCode(getStore(), UNIQUE, async (tx) => {
        const row = { provider: "fake", provider_event_id: "e-1", provider_message_id: "m-1", status: "delivered", at: NOW };
        await tx.insert(provider_status_events).values(row);
        await tx.insert(provider_status_events).values(row);
      });
    });
    it("outbound messages are unique per idempotency_key", async () => {
      await expectCode(getStore(), UNIQUE, async (tx) => {
        const row = { identity_id: SEED_IDENTITY_IDS.courier_a, purpose: "offer", text: "hi", idempotency_key: "k-1", provider_mode: "fake", created_at: NOW };
        await tx.insert(outbound_messages).values(row);
        await tx.insert(outbound_messages).values(row);
      });
    });
    it("outbound purpose is checked", async () => {
      await expectCode(getStore(), CHECK, async (tx) => {
        await tx.insert(outbound_messages).values({ identity_id: SEED_IDENTITY_IDS.courier_a, purpose: "spam", text: "x", idempotency_key: "k-2", provider_mode: "fake", created_at: NOW });
      });
    });
    it("messaging identities are unique per (provider, handle)", async () => {
      await expectCode(getStore(), UNIQUE, async (tx) => {
        const row = { actor_role: "courier", actor_id: COURIER_A, provider: "fake", handle: "dup@example.invalid", status: "awaiting_join" };
        await tx.insert(messaging_identities).values(row);
        await tx.insert(messaging_identities).values(row);
      });
    });
    it("a recipient identity is not allowed in P0", async () => {
      await expectCode(getStore(), CHECK, async (tx) => {
        await tx.insert(messaging_identities).values({ actor_role: "recipient", actor_id: EASTLAKE, provider: "fake", handle: "r@example.invalid", status: "awaiting_join" });
      });
    });
  });

  describe("images and policy", () => {
    it("an image over 5 MB violates the size CHECK; one at the limit is stored", async () => {
      const limit = 5 * 1024 * 1024;
      await expectCode(getStore(), CHECK, async (tx) => {
        await tx.insert(donation_images).values({ mime: "image/jpeg", bytes: new Uint8Array(limit + 1), sha256: "x", created_at: NOW });
      });
      await expectOk(getStore(), async (tx) => {
        await tx.insert(donation_images).values({ mime: "image/jpeg", bytes: new Uint8Array(limit), sha256: "y", created_at: NOW });
      });
    });
    it("only one policy row can be active", async () => {
      await expectCode(getStore(), UNIQUE, async (tx) => {
        await tx.insert(policy_config).values({ policy_id: "other", policy_version: "1", config: {}, active: true });
      });
    });
  });
}

describe("T-CO-23 migrate + seed on PGlite (in memory)", () => {
  let store: DispatchStore;
  beforeAll(async () => {
    store = createDispatchStore({ kind: "pglite", database_url: undefined, pglite_dir: undefined });
    await runMigrations(store);
    await seedStore(store, { now: NOW, messaging_provider: "fake" });
  });
  afterAll(async () => closeStore(store));

  it("migrations replay cleanly from empty and are safe to run twice", async () => {
    await expect(runMigrations(store)).resolves.toBeUndefined();
  });
  schemaChecks(() => store);
});

describe("T-CO-23 seed behavior", () => {
  const dump = async (s: DispatchStore) => {
    const { db } = storeInternals(s);
    return JSON.stringify([
      await db.select().from(donors).orderBy(donors.id),
      await db.select().from(recipients).orderBy(recipients.id),
      await db.select().from(couriers).orderBy(couriers.id),
      await db.select().from(messaging_identities).orderBy(messaging_identities.id),
      await db.select().from(policy_config),
    ]);
  };
  const fresh = async () => {
    const s = createDispatchStore({ kind: "pglite", database_url: undefined, pglite_dir: undefined });
    await runMigrations(s);
    return s;
  };

  it("is deterministic: the same time and handles produce identical rows on two fresh databases", async () => {
    const a = await fresh();
    const b = await fresh();
    try {
      await seedStore(a, { now: NOW, messaging_provider: "fake" });
      await seedStore(b, { now: NOW, messaging_provider: "fake" });
      expect(await dump(a)).toBe(await dump(b));
      expect(JSON.stringify(buildSeed({ now: NOW, messaging_provider: "fake" }))).toBe(JSON.stringify(buildSeed({ now: NOW, messaging_provider: "fake" })));
    } finally {
      await closeStore(a);
      await closeStore(b);
    }
  });

  it("times are relative to now", () => {
    const early = buildSeed({ now: NOW, messaging_provider: "fake" });
    const later = buildSeed({ now: new Date(NOW.getTime() + 3_600_000), messaging_provider: "fake" });
    expect(later.recipientRows[0]!.receiving_closes_at.getTime() - early.recipientRows[0]!.receiving_closes_at.getTime()).toBe(3_600_000);
    expect(early.recipientRows[0]!.receiving_closes_at.getTime()).toBeGreaterThan(NOW.getTime());
    expect(early.courierRows[0]!.available_until.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("running the seed again refreshes times but keeps a joined phone joined", async () => {
    const s = await fresh();
    try {
      await seedStore(s, { now: NOW, messaging_provider: "fake" });
      const { db } = storeInternals(s);
      await db.update(messaging_identities).set({ status: "joined", joined_at: NOW }).where(sql`id = ${SEED_IDENTITY_IDS.courier_a}`);
      const later = new Date(NOW.getTime() + 3_600_000);
      await seedStore(s, { now: later, messaging_provider: "fake" });
      const ident = (await db.select().from(messaging_identities)).find((i) => i.id === SEED_IDENTITY_IDS.courier_a);
      expect(ident?.status).toBe("joined");
      const east = (await db.select().from(recipients)).find((r) => r.id === EASTLAKE);
      expect(east?.receiving_closes_at.getTime()).toBe(later.getTime() + 8 * 3_600_000);
      expect((await db.select().from(policy_config)).filter((p) => p.active)).toHaveLength(1);
    } finally {
      await closeStore(s);
    }
  });

  it("switching to photon with real handles updates identities awaiting JOIN but never a joined one", async () => {
    const s = await fresh();
    try {
      await seedStore(s, { now: NOW, messaging_provider: "fake" });
      const { db } = storeInternals(s);
      await db.update(messaging_identities).set({ status: "joined", joined_at: NOW }).where(sql`id = ${SEED_IDENTITY_IDS.courier_a}`);
      await seedStore(s, { now: NOW, messaging_provider: "photon", handles: { donor: "d@t.test", courier_a: "a@t.test", courier_b: "b@t.test" } });
      const rows = new Map((await db.select().from(messaging_identities)).map((i) => [i.id, i]));
      expect(rows.get(SEED_IDENTITY_IDS.donor)).toMatchObject({ provider: "photon", handle: "d@t.test" });
      expect(rows.get(SEED_IDENTITY_IDS.courier_b)).toMatchObject({ provider: "photon", handle: "b@t.test" });
      expect(rows.get(SEED_IDENTITY_IDS.courier_a)).toMatchObject({ provider: "fake", handle: "courier-a@example.invalid", status: "joined" });
    } finally {
      await closeStore(s);
    }
  });

  it("without handles the fake provider gets obviously synthetic .invalid handles", () => {
    const { identityRows } = buildSeed({ now: NOW, messaging_provider: "fake" });
    expect(new Set(identityRows.map((r) => r.provider))).toEqual(new Set(["fake"]));
    for (const r of identityRows) expect(r.handle.endsWith("@example.invalid")).toBe(true);
    expect(new Set(identityRows.map((r) => r.handle)).size).toBe(identityRows.length);
  });

  it("photon without every handle stops with a clear error and never uses a fake handle", () => {
    expect(() => buildSeed({ now: NOW, messaging_provider: "photon" })).toThrow(/DEMO_DONOR_HANDLE/);
    expect(() => buildSeed({ now: NOW, messaging_provider: "photon", handles: { donor: "a@b.c", courier_a: "b@b.c" } })).toThrow(/courier_b/);
  });

  it("photon with handles uses them for the photon provider", () => {
    const { identityRows } = buildSeed({ now: NOW, messaging_provider: "photon", handles: { donor: "d@t.test", courier_a: "a@t.test", courier_b: "b@t.test" } });
    expect(identityRows.map((r) => [r.provider, r.handle])).toEqual([["photon", "d@t.test"], ["photon", "a@t.test"], ["photon", "b@t.test"]]);
  });

  it("createDispatchStore: postgres without database_url fails loudly and never falls back to pglite", () => {
    expect(() => createDispatchStore({ kind: "postgres", database_url: undefined, pglite_dir: undefined })).toThrow(/database_url/);
  });

  it("the store handle is opaque: only the contract's kind is visible", () => {
    const s = createDispatchStore({ kind: "pglite", database_url: undefined, pglite_dir: undefined });
    expect(Object.keys(s)).toEqual(["kind"]);
    void closeStore(s);
  });
});

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

/** The database name in a Postgres URL, or undefined if it cannot be read. */
describe("assertDisposableDatabase", () => {
  it("accepts names that say they are disposable and refuses everything else", () => {
    expect(() => assertDisposableDatabase("postgres://u@localhost:5432/annona_test")).not.toThrow();
    expect(() => assertDisposableDatabase("postgres://u@localhost:5432/disposable-1")).not.toThrow();
    expect(() => assertDisposableDatabase("postgres://u@db.example.invalid/postgres")).toThrow(/disposable/);
    expect(() => assertDisposableDatabase("postgres://u@db.example.invalid/annona")).toThrow(/disposable/);
    expect(() => assertDisposableDatabase("postgres://u@db.example.invalid/contest")).toThrow(/disposable/);
    expect(() => assertDisposableDatabase("postgres://u@db.example.invalid")).toThrow(/disposable/);
    expect(() => assertDisposableDatabase("not a url")).toThrow(/disposable/);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("T-CO-23 migrate + seed on Postgres (TEST_DATABASE_URL; disposable DB)", () => {
  let store: DispatchStore;
  beforeAll(async () => {
    assertDisposableDatabase(TEST_DATABASE_URL!);
    store = createDispatchStore({ kind: "postgres", database_url: TEST_DATABASE_URL, pglite_dir: undefined });
    // T-CO-23 starts from an empty database; T-CO-17 (or an earlier run) may have left rows behind.
    await emptyDisposableDatabase(storeInternals(store).db, TEST_DATABASE_URL!);
    await runMigrations(store);
    await seedStore(store, { now: NOW, messaging_provider: "fake" });
  });
  afterAll(async () => closeStore(store));
  schemaChecks(() => store);
});
