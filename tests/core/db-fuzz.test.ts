import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DEMO_ACTORS, OFFER_STATUSES, type DispatchStore } from "@/contracts";
import { createDispatchStore } from "@/db";
import { closeStore, storeInternals } from "@/db/internal";
import { runMigrations } from "@/db/run-migrations";
import { seedStore } from "@/db/seed/seed";
import { donations, offers, verification_links } from "@/db/schema";

// Each test file starts one or more WASM Postgres instances. Under the parallel full run that can exceed the 5 s default.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

// Model-based test. Random operations are applied to the database and to a tiny JavaScript model of the
// rules in ARCHITECTURE section 7; the database must accept exactly what the model accepts.

const NOW = new Date("2026-10-17T23:10:00.000Z");
const actor = (key: string) => DEMO_ACTORS.find((a) => a.key === key)!.actor_id;
const DONOR = actor("donor_rainier");
const COURIERS = [actor("courier_a"), actor("courier_b"), actor("courier_c")];
const RECIPIENTS = [actor("recipient_eastlake"), actor("recipient_youth")];
const ALPHABET = "ACDEFHJKMNPRTUVWXY3479";

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let store: DispatchStore;
beforeAll(async () => {
  store = createDispatchStore({ kind: "pglite", database_url: undefined, pglite_dir: undefined });
  await runMigrations(store);
  await seedStore(store, { now: NOW, messaging_provider: "fake" });
});
afterAll(async () => closeStore(store));

class Rollback extends Error {}
const sqlState = (err: unknown): string | undefined => {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
};

describe("model-based: unique indexes accept exactly what the rules allow", () => {
  for (let seed = 1; seed <= 30; seed++) {
    it(`seed ${seed}`, async () => {
      const r = rng(seed);
      const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
      const { db } = storeInternals(store);

      // model state
      const donationIds: string[] = [];
      const activeAssignment = new Set<string>(); // donation ids with an accepted offer and no close_reason
      const liveCourier = new Set<string>(); // courier ids with a pending_send/open offer
      const liveLink = new Set<string>(); // donation ids with a live link
      const sourceRefs = new Set<string>();
      const codes = new Set<string>();
      const hashes = new Set<string>();

      try {
        await db.transaction(async (tx) => {
          const attempt = async (expectViolation: boolean, label: string, fn: (sp: typeof tx) => Promise<void>, commit: () => void) => {
            let err: unknown;
            try {
              await tx.transaction(async (sp) => {
                await fn(sp as unknown as typeof tx);
              });
            } catch (e) {
              err = e;
            }
            if (expectViolation) expect(sqlState(err), `${label}: model says this must be refused`).toBe("23505");
            else expect(err, `${label}: model says this is allowed (${String((err as { cause?: { message?: string } })?.cause?.message ?? err)})`).toBeUndefined();
            if (!expectViolation) commit();
          };

          for (let i = 0; i < 70; i++) {
            const op = r();
            if (op < 0.2 || donationIds.length === 0) {
              const withRef = r() < 0.6;
              const source = pick(["web_upload", "messaging", "fixture"] as const);
              const ref = withRef ? `ref-${Math.floor(r() * 6)}` : null;
              const key = `${source}|${ref}`;
              const id = randomUUID();
              await attempt(ref !== null && sourceRefs.has(key), `donation ${key}`, async (sp) => {
                await sp.insert(donations).values({ id, donor_id: DONOR, status: "draft", source, source_ref: ref, ai_status: "pending", created_at: NOW, updated_at: NOW });
              }, () => {
                donationIds.push(id);
                if (ref !== null) sourceRefs.add(key);
              });
            } else if (op < 0.65) {
              const donation = pick(donationIds);
              const courier = pick(COURIERS);
              const status = pick(OFFER_STATUSES);
              const accepted = status === "accepted";
              const closeReason = accepted && r() < 0.4 ? "courier_opted_out" : r() < 0.2 ? "cutoff_reached" : null;
              const code = pick([...codes, null, null])
                ?? `${ALPHABET[Math.floor(r() * 22)]}${ALPHABET[Math.floor(r() * 22)]}${ALPHABET[Math.floor(r() * 22)]}${ALPHABET[Math.floor(r() * 22)]}`;
              const live = status === "pending_send" || status === "open";
              const activeAccepted = accepted && closeReason === null;
              const violation = codes.has(code) || (activeAccepted && activeAssignment.has(donation)) || (live && liveCourier.has(courier));
              await attempt(violation, `offer ${status}/${closeReason} courier ${courier.slice(-2)} code ${code}`, async (sp) => {
                await sp.insert(offers).values({
                  id: randomUUID(), donation_id: donation, recipient_id: pick(RECIPIENTS), courier_id: courier, short_code: code,
                  status, wave_no: 1, created_at: NOW, close_reason: closeReason, provider_mode: "fake", candidate: {},
                  sent_at: status === "open" ? NOW : null, expires_at: status === "open" ? NOW : null,
                });
              }, () => {
                codes.add(code);
                if (activeAccepted) activeAssignment.add(donation);
                if (live) liveCourier.add(courier);
              });
            } else {
              const donation = pick(donationIds);
              const state = pick(["live", "consumed", "revoked"] as const);
              const hash = r() < 0.15 && hashes.size > 0 ? pick([...hashes]) : randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
              const live = state === "live";
              const violation = hashes.has(hash) || (live && liveLink.has(donation));
              await attempt(violation, `link ${state}`, async (sp) => {
                await sp.insert(verification_links).values({
                  id: randomUUID(), donation_id: donation, donor_id: DONOR, token_hash: hash, issued_at: NOW, expires_at: NOW,
                  consumed_at: state === "consumed" ? NOW : null, revoked_at: state === "revoked" ? NOW : null,
                });
              }, () => {
                hashes.add(hash);
                if (live) liveLink.add(donation);
              });
            }
          }
          throw new Rollback();
        });
      } catch (e) {
        if (!(e instanceof Rollback)) throw e;
      }
    });
  }
});

// NOT a race test: PGlite is a single connection, so these ten writes are queued and run one after another. They show
// the unique index admits exactly one of ten competing rows; they say nothing about interleaved transactions. Real
// claim-race safety (T-CO-16 / T-CO-17) needs separate connections to Postgres and is still UNVERIFIED.
describe("ten competing writes, run serially on one connection: the index lets exactly one through", () => {
  // Cleanup runs even when an assertion fails, so one failure cannot poison the tests after it.
  afterEach(async () => {
    const { db } = storeInternals(store);
    await db.delete(offers);
    await db.delete(donations);
  });

  const settle = async <T,>(jobs: Promise<T>[]) => {
    const res = await Promise.allSettled(jobs);
    return { ok: res.filter((x) => x.status === "fulfilled").length, bad: res.filter((x) => x.status === "rejected") as PromiseRejectedResult[] };
  };

  it("10 live offers for one courier: exactly one is stored, the rest are unique violations", async () => {
    const { db } = storeInternals(store);
    const ids = Array.from({ length: 10 }, () => randomUUID());
    await db.insert(donations).values(ids.map((id) => ({ id, donor_id: DONOR, status: "eligible", source: "fixture", ai_status: "succeeded", created_at: NOW, updated_at: NOW })));
    const mk = (donation_id: string, i: number) => ({
      id: randomUUID(), donation_id, recipient_id: RECIPIENTS[0]!, courier_id: COURIERS[0]!, short_code: `${ALPHABET[i]}${ALPHABET[i]}KM`,
      status: i % 2 ? "open" : "pending_send", expires_at: i % 2 ? NOW : null, wave_no: 1, created_at: NOW, provider_mode: "fake" as const, candidate: {},
    });
    const { ok, bad } = await settle(ids.map((id, i) => db.insert(offers).values(mk(id, i))));
    expect(ok).toBe(1);
    expect(bad).toHaveLength(9);
    for (const b of bad) expect(sqlState(b.reason)).toBe("23505");
    const live = await db.select().from(offers).where(eq(offers.courier_id, COURIERS[0]!));
    expect(live.filter((o) => o.status === "open" || o.status === "pending_send")).toHaveLength(1);
  });

  it("10 accepted offers for one donation: exactly one active assignment", async () => {
    const { db } = storeInternals(store);
    const donation = randomUUID();
    await db.insert(donations).values({ id: donation, donor_id: DONOR, status: "offered", source: "fixture", ai_status: "succeeded", created_at: NOW, updated_at: NOW });
    const jobs = Array.from({ length: 10 }, (_, i) =>
      db.insert(offers).values({
        id: randomUUID(), donation_id: donation, recipient_id: RECIPIENTS[0]!, courier_id: COURIERS[i % 3]!, short_code: `${ALPHABET[i + 3]}${ALPHABET[i + 3]}KM`,
        status: "accepted", wave_no: 1, created_at: NOW, provider_mode: "fake", candidate: {},
      }),
    );
    const { ok, bad } = await settle(jobs);
    expect(ok).toBe(1);
    expect(bad).toHaveLength(9);
    for (const b of bad) expect(sqlState(b.reason)).toBe("23505");
  });

  it("10 drafts with the same (source, source_ref): exactly one", async () => {
    const { db } = storeInternals(store);
    const jobs = Array.from({ length: 10 }, () =>
      db.insert(donations).values({ id: randomUUID(), donor_id: DONOR, status: "draft", source: "messaging", source_ref: "fake:dup-photo", ai_status: "pending", created_at: NOW, updated_at: NOW }),
    );
    const { ok, bad } = await settle(jobs);
    expect(ok).toBe(1);
    expect(bad).toHaveLength(9);
    for (const b of bad) expect(sqlState(b.reason)).toBe("23505");
  });
});
