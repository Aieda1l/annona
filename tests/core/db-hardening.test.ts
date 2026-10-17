import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  created_at: NOW, provider_mode: "fake", candidate: {} as never, ...over,
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
    expect(names).toEqual(expect.arrayContaining(["offers_donation_status_idx", "donations_donor_idx", "offers_provider_message_idx"]));
  });
});

describe("upgrading a database that already ran migration 0000 (what every dev's local PGlite folder has)", () => {
  /** A migrations folder holding only the first migration, so a database can be built at the pre-hardening version. */
  function folderWithFirstMigrationOnly(): string {
    const src = join(process.cwd(), "src", "db", "migrations");
    const journal = JSON.parse(readFileSync(join(src, "meta", "_journal.json"), "utf8")) as { entries: Array<{ tag: string }> };
    expect(journal.entries.length).toBeGreaterThanOrEqual(2); // 0000 and the hardening migration
    const dir = mkdtempSync(join(tmpdir(), "annona-mig0-"));
    mkdirSync(join(dir, "meta"));
    const first = journal.entries[0]!;
    copyFileSync(join(src, `${first.tag}.sql`), join(dir, `${first.tag}.sql`));
    writeFileSync(join(dir, "meta", "_journal.json"), JSON.stringify({ ...journal, entries: [first] }));
    return dir;
  }
  const count = async (s: DispatchStore, table: string) =>
    Number((rowsOf(await storeInternals(s).db.execute(sql.raw(`select count(*)::int as n from ${table}`))) as { n: number }[])[0]!.n);

  it("keeps the data, turns RLS on and adds the new constraints, without touching 0000", async () => {
    const old = folderWithFirstMigrationOnly();
    const s = createDispatchStore({ kind: "pglite", database_url: undefined, pglite_dir: undefined });
    try {
      await runMigrations(s, old);
      // Control: at 0000 the protections are not there yet, so the later assertions can really fail.
      const before = rowsOf(await storeInternals(s).db.execute(sql`select relrowsecurity from pg_class where relname = 'donors'`)) as { relrowsecurity: boolean }[];
      expect(before[0]!.relrowsecurity).toBe(false);

      await seedStore(s, { now: NOW, messaging_provider: "fake" });
      const d = donationRow();
      await storeInternals(s).db.insert(donations).values(d);
      await storeInternals(s).db.insert(offers).values(offerRow(d.id!, { status: "open", sent_at: NOW, expires_at: new Date(NOW.getTime() + 60_000) }));
      const counts = { donors: await count(s, "donors"), donations: await count(s, "donations"), offers: await count(s, "offers"), identities: await count(s, "messaging_identities") };

      await runMigrations(s); // applies only the hardening migration
      await runMigrations(s); // and is safe to run again

      expect({ donors: await count(s, "donors"), donations: await count(s, "donations"), offers: await count(s, "offers"), identities: await count(s, "messaging_identities") }).toEqual(counts);
      const after = rowsOf(await storeInternals(s).db.execute(sql`select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'`)) as { relname: string; relrowsecurity: boolean }[];
      expect(after.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
      const bad = await storeInternals(s).db.transaction(async (tx) => {
        const d2 = donationRow();
        await tx.insert(donations).values(d2);
        await tx.insert(offers).values(offerRow(d2.id!, { short_code: "H4M9", status: "open", sent_at: NOW, expires_at: null }));
      }).catch((e: unknown) => e);
      expect(constraintOf(bad)).toBe("offers_open_has_deadline_check");
    } finally {
      await closeStore(s);
      rmSync(old, { recursive: true, force: true });
    }
  });
});
