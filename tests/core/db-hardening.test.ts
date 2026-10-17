import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DEMO_ACTORS, type DispatchStore } from "@/contracts";
import { createDispatchStore } from "@/db";
import { closeStore, storeInternals } from "@/db/internal";
import { runMigrations } from "@/db/run-migrations";
import { seedStore } from "@/db/seed/seed";
import { donations, offers, verification_links } from "@/db/schema";

// Schema hardening from the ECC database/security review: RLS, deadlines, claim linkage, token format, indexes.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const NOW = new Date("2026-10-17T23:10:00.000Z");
const actor = (key: string) => DEMO_ACTORS.find((a) => a.key === key)!.actor_id;
const DONOR = actor("donor_rainier");
const EASTLAKE = actor("recipient_eastlake");
const COURIER_A = actor("courier_a");

class Rollback extends Error {}
type Tx = Parameters<Parameters<ReturnType<typeof storeInternals>["db"]["transaction"]>[0]>[0];
const constraintOf = (err: unknown): string | undefined => {
  const e = err as { constraint?: string; constraint_name?: string; cause?: { constraint?: string; constraint_name?: string } };
  return e?.constraint ?? e?.constraint_name ?? e?.cause?.constraint ?? e?.cause?.constraint_name;
};

let store: DispatchStore;
beforeAll(async () => {
  store = createDispatchStore({ kind: "pglite", database_url: undefined, pglite_dir: undefined });
  await runMigrations(store);
  await seedStore(store, { now: NOW, messaging_provider: "fake" });
});
afterAll(async () => closeStore(store));

async function inRollback(fn: (tx: Tx) => Promise<void>): Promise<unknown> {
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
const rowsOf = (res: unknown) => (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows);

const donationRow = (over: Partial<typeof donations.$inferInsert> = {}): typeof donations.$inferInsert => ({
  id: randomUUID(), donor_id: DONOR, status: "draft", source: "fixture", ai_status: "pending", created_at: NOW, updated_at: NOW, ...over,
});
const offerRow = (donation_id: string, over: Partial<typeof offers.$inferInsert> = {}): typeof offers.$inferInsert => ({
  id: randomUUID(), donation_id, recipient_id: EASTLAKE, courier_id: COURIER_A, short_code: "K7M3", status: "pending_send", wave_no: 1,
  created_at: NOW, provider_mode: "fake", candidate: {}, ...over,
});

describe("row-level security (Supabase exposes the public schema through a public anon key)", () => {
  it("every table in the public schema has RLS enabled", async () => {
    const res = rowsOf(await storeInternals(store).db.execute(sql`select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by relname`)) as { relname: string; relrowsecurity: boolean }[];
    expect(res.length).toBeGreaterThanOrEqual(13); // positive control: the tables are really listed
    expect(res.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
  });
  it("the owner connection (the backend) still reads and writes normally", async () => {
    expect(await inRollback(async (tx) => void (await tx.insert(donations).values(donationRow())))).toBeUndefined();
  });
});

describe("an open offer always has a deadline", () => {
  it("open without expires_at is refused (lazy expiry would never fire on NULL)", async () => {
    const d = donationRow();
    const err = await inRollback(async (tx) => {
      await tx.insert(donations).values(d);
      await tx.insert(offers).values(offerRow(d.id!, { status: "open", sent_at: NOW, expires_at: null }));
    });
    expect(constraintOf(err)).toBe("offers_open_has_deadline_check");
  });
  it("open with expires_at, and pending_send without one, are fine", async () => {
    const d = donationRow();
    expect(await inRollback(async (tx) => {
      await tx.insert(donations).values(d);
      await tx.insert(offers).values(offerRow(d.id!, { short_code: "K7M3", status: "pending_send" }));
    })).toBeUndefined();
    const d2 = donationRow();
    expect(await inRollback(async (tx) => {
      await tx.insert(donations).values(d2);
      await tx.insert(offers).values(offerRow(d2.id!, { short_code: "H4M9", status: "open", sent_at: NOW, expires_at: new Date(NOW.getTime() + 60_000) }));
    })).toBeUndefined();
  });
});

describe("a claimed or collected donation points at its accepted offer", () => {
  it.each(["claimed", "collected"])("%s without claimed_offer_id is refused", async (status) => {
    const err = await inRollback(async (tx) => void (await tx.insert(donations).values(donationRow({ status, collected_at: status === "collected" ? NOW : null }))));
    expect(constraintOf(err)).toBe("donations_claim_linked_check");
  });
  it.each(["claimed", "collected"])("%s with claimed_offer_id is fine", async (status) => {
    const err = await inRollback(async (tx) => void (await tx.insert(donations).values(donationRow({ status, claimed_offer_id: randomUUID(), collected_at: status === "collected" ? NOW : null }))));
    expect(err).toBeUndefined();
  });
  it("S-17: a collected donation sent back to needs_review has no claimed_offer_id and that is allowed", async () => {
    expect(await inRollback(async (tx) => void (await tx.insert(donations).values(donationRow({ status: "needs_review", collected_at: NOW, claimed_offer_id: null }))))).toBeUndefined();
  });
  it("S-15: a released claim returns to eligible with claimed_offer_id cleared", async () => {
    expect(await inRollback(async (tx) => void (await tx.insert(donations).values(donationRow({ status: "eligible", claimed_offer_id: null }))))).toBeUndefined();
  });
});

describe("verification link tokens are stored only as a hash", () => {
  const link = (donation_id: string, token_hash: string): typeof verification_links.$inferInsert => ({
    id: randomUUID(), donation_id, donor_id: DONOR, token_hash, issued_at: NOW, expires_at: new Date(NOW.getTime() + 60_000),
  });
  it.each(["", "abc", "A".repeat(64), "g".repeat(64), "a".repeat(63), "a".repeat(65), "dGhpcy1pcy1hLXJhdy10b2tlbg"])("%j is not a lowercase hex SHA-256 and is refused", async (hash) => {
    const d = donationRow();
    const err = await inRollback(async (tx) => {
      await tx.insert(donations).values(d);
      await tx.insert(verification_links).values(link(d.id!, hash));
    });
    expect(constraintOf(err)).toBe("verification_links_token_hash_hex_check");
  });
  it("a real SHA-256 hex digest is accepted", async () => {
    const d = donationRow();
    expect(await inRollback(async (tx) => {
      await tx.insert(donations).values(d);
      await tx.insert(verification_links).values(link(d.id!, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"));
    })).toBeUndefined();
  });
});

describe("indexes for the queries the claim, sibling-supersede and dashboard paths run", () => {
  it("exist", async () => {
    const names = (rowsOf(await storeInternals(store).db.execute(sql`select indexname from pg_indexes where schemaname = 'public'`)) as { indexname: string }[]).map((r) => r.indexname);
    expect(names).toEqual(expect.arrayContaining(["offers_donation_status_idx", "donations_donor_idx"]));
  });
});
