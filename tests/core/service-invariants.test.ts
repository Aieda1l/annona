import { and, eq, inArray, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ClaimResult, DeclineResult, type Actor } from "@/contracts";
import { claimOffer, createNextOffers, createTestClock, declineOffer, expireDue, joinIdentity, markOfferSendFailed, openOfferForSend, optOutIdentity } from "@/core";
import { __setShortCodeRandom } from "@/core/service/dispatch";
import { couriers, donations, donors, offers, recipients } from "@/db/schema";
import { COURIER_A, COURIER_B, COURIER_C, DONOR, EASTLAKE, IDENTITY, T0, makeEligibleDonation, makeWorld, resetWorld, type World } from "./helpers/world";

// Model-free invariant fuzz of the whole dispatch machinery: random sequences of every operation (including concurrent
// claims, STOP and time jumps) run against the real functions on PGlite, with the properties that must always hold
// checked after every step. Seeded, so a failure reproduces.

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

let w: World;
beforeAll(async () => {
  w = await makeWorld();
});
afterAll(async () => w.close());

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COURIERS = [COURIER_A, COURIER_B] as const;
const IDENT = { [COURIER_A]: IDENTITY.courier_a, [COURIER_B]: IDENTITY.courier_b } as const;
const TERMINAL = ["expired", "rejected", "canceled", "delivered"];
const LIVE = ["pending_send", "open"];

type Snapshot = { donations: Array<typeof donations.$inferSelect>; offers: Array<typeof offers.$inferSelect> };

async function snapshot(): Promise<Snapshot> {
  return { donations: await w.db.select().from(donations), offers: await w.db.select().from(offers) };
}

/** The properties that must hold after every operation. Returns violations (empty = fine). */
function violations(s: Snapshot, capacity: number, prevVersions: Map<string, number>): string[] {
  const bad: string[] = [];
  const activeAccepted = (donation_id: string) => s.offers.filter((o) => o.donation_id === donation_id && o.status === "accepted" && o.close_reason === null);
  for (const d of s.donations) {
    const active = activeAccepted(d.id);
    if (active.length > 1) bad.push(`donation ${d.id.slice(0, 4)} has ${active.length} active assignments`);
    if (["claimed", "collected"].includes(d.status)) {
      if (active.length !== 1) bad.push(`${d.status} donation ${d.id.slice(0, 4)} has ${active.length} active assignments`);
      else if (d.claimed_offer_id !== active[0]!.id) bad.push(`${d.status} donation ${d.id.slice(0, 4)} claimed_offer_id does not match its accepted offer`);
    }
    if (["draft", "needs_review", "eligible", "unmatched", "offered"].includes(d.status)) {
      if (active.length > 0) bad.push(`${d.status} donation ${d.id.slice(0, 4)} still has an active assignment`);
      if (d.claimed_offer_id !== null) bad.push(`${d.status} donation ${d.id.slice(0, 4)} still has claimed_offer_id`);
    }
    const live = s.offers.filter((o) => o.donation_id === d.id && LIVE.includes(o.status));
    if (TERMINAL.includes(d.status) && live.length > 0) bad.push(`${d.status} donation ${d.id.slice(0, 4)} still has ${live.length} live offers`);
    if (d.status === "eligible" && live.length > 0) bad.push(`eligible donation ${d.id.slice(0, 4)} still has live offers`);
    const prev = prevVersions.get(d.id);
    if (prev !== undefined && d.version < prev) bad.push(`donation ${d.id.slice(0, 4)} version went backwards`);
    prevVersions.set(d.id, d.version);
    if (d.collected_at !== null && ["draft", "eligible", "unmatched", "offered"].includes(d.status)) bad.push(`${d.status} donation ${d.id.slice(0, 4)} has collected_at`);
  }
  for (const c of COURIERS) {
    const mine = s.offers.filter((o) => o.courier_id === c);
    if (mine.filter((o) => LIVE.includes(o.status)).length > 1) bad.push(`courier ${c.slice(-2)} has more than one live offer`);
    const assigned = mine.some((o) => o.status === "accepted" && o.close_reason === null && ["claimed", "collected"].includes(s.donations.find((d) => d.id === o.donation_id)?.status ?? ""));
    if (assigned && mine.some((o) => LIVE.includes(o.status))) bad.push(`courier ${c.slice(-2)} holds an assignment and a live offer`);
  }
  for (const o of s.offers) {
    if (["expired", "declined", "superseded", "canceled", "send_failed"].includes(o.status) && o.status !== "declined" && o.close_reason === null) bad.push(`offer ${o.id.slice(0, 4)} is ${o.status} without a close_reason`);
    if (o.status === "open" && (o.expires_at === null || o.sent_at === null)) bad.push(`open offer ${o.id.slice(0, 4)} has no deadline`);
  }
  // capacity: servings promised to a recipient never exceed what it can receive
  const promised = new Map<string, number>();
  for (const o of s.offers.filter((x) => x.status === "accepted" && x.close_reason === null)) {
    const d = s.donations.find((x) => x.id === o.donation_id);
    if (d && ["claimed", "collected", "delivered"].includes(d.status)) {
      promised.set(o.recipient_id, (promised.get(o.recipient_id) ?? 0) + Number((d.verified_facts as { servings?: number } | null)?.servings ?? 0));
    }
  }
  for (const [r, n] of promised) if (n > capacity) bad.push(`recipient ${r.slice(-2)} is promised ${n} servings, capacity ${capacity}`);
  return bad;
}

// What the random sequences actually reached; asserted at the end so the fuzz cannot pass by never doing anything.
const seen = new Map<string, number>();
const note = (label: string) => seen.set(label, (seen.get(label) ?? 0) + 1);

describe("invariants hold under random sequences of every operation", () => {
  const SEEDS = Array.from({ length: Number(process.env.INVARIANT_SEEDS ?? 30) }, (_, i) => i + 1); // INVARIANT_SEEDS=300 for a deeper run
  for (const seed of SEEDS) {
    it(`seed ${seed}`, async () => {
      await resetWorld(w);
      __setShortCodeRandom(null);
      const r = rng(seed * 7919);
      const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
      const clock = createTestClock(T0);
      const deps = () => ({ store: w.store, clock });
      const capacity = 60; // room for two 24-serving donations per recipient, so the capacity rule is really exercised
      await w.db.update(recipients).set({ capacity_servings_available: capacity }).where(eq(recipients.id, EASTLAKE));
      const prevVersions = new Map<string, number>();
      const log: string[] = [];
      for (let i = 0; i < 3; i++) await makeEligibleDonation(w, { from: clock.now() }); // start with work to do

      const check = async (label: string) => {
        const bad = violations(await snapshot(), capacity, prevVersions);
        if (bad.length > 0) throw new Error(`seed ${seed} after "${label}":\n  ${bad.join("\n  ")}\nlog:\n  ${log.slice(-12).join("\n  ")}`);
      };
      const courierActor = (c: string): Actor => ({ role: "courier", id: c });

      for (let step = 0; step < 80; step++) {
        const op = pick(["new", "dispatch", "dispatch", "dispatch", "open", "open", "open", "claim", "claim", "claim", "claim", "race", "race", "decline", "stop", "join", "join", "expire", "advance", "advance", "failed", "collect", "chaos"] as const);
        const snap = await snapshot();
        let label: string = op;
        try {
          if (op === "new") {
            // A suspended donor cannot start a draft (S-01), which is correct, so the generator skips it then.
            const [donor] = await w.db.select().from(donors).where(eq(donors.id, DONOR));
            if (snap.donations.length < 6 && donor?.approval_status === "approved") await makeEligibleDonation(w, { from: clock.now() });
          } else if (op === "dispatch") {
            const d = snap.donations.filter((x) => x.status === "eligible");
            if (d.length) label = `dispatch ${(await createNextOffers({ donation_id: pick(d).id }, deps())).ok}`;
          } else if (op === "open") {
            const o = snap.offers.filter((x) => x.status === "pending_send");
            if (o.length) await openOfferForSend({ offer_id: pick(o).id }, deps());
          } else if (op === "claim" || op === "decline") {
            const open = snap.offers.filter((x) => x.status === "open");
            const o = open.length > 0 && r() < 0.8 ? open : snap.offers;
            if (o.length) {
              const target = pick(o);
              // mostly the right courier, sometimes a wrong one
              const who = r() < 0.85 ? target.courier_id : pick(COURIERS);
              const command = { offer_ref: r() < 0.5 ? { offer_id: target.id } : { short_code: target.short_code }, actor: courierActor(who), source: "messaging" as const, source_event_id: null };
              if (op === "claim") {
                const res = await claimOffer(command, deps());
                expect(ClaimResult.safeParse(res).success, JSON.stringify(res)).toBe(true);
                label = `claim ${res.code}`;
              } else {
                const res = await declineOffer(command, deps());
                expect(DeclineResult.safeParse(res).success, JSON.stringify(res)).toBe(true);
                label = `decline ${res.code}`;
              }
            }
          } else if (op === "race") {
            const open = snap.offers.filter((x) => x.status === "open");
            if (open.length) {
              const results = await Promise.all(
                Array.from({ length: 2 + Math.floor(r() * 4) }, () => {
                  const t = pick(open);
                  return claimOffer({ offer_ref: { offer_id: t.id }, actor: courierActor(t.courier_id), source: "messaging", source_event_id: null }, deps());
                }),
              );
              // across all open offers of ONE donation at most one may win; across donations each wins at most once
              const byDonation = new Map<string, number>();
              for (const res of results) if (res.code === "claimed") byDonation.set(res.donation_id!, (byDonation.get(res.donation_id!) ?? 0) + 1);
              for (const [d, n] of byDonation) expect(n, `two claims won donation ${d}`).toBe(1);
              label = `race ${results.map((x) => x.code).join(",")}`;
            }
          } else if (op === "stop") {
            await optOutIdentity({ identity_id: IDENT[pick(COURIERS)] }, deps());
          } else if (op === "join") {
            await joinIdentity({ identity_id: IDENT[pick(COURIERS)], provider_space_id: null, provider_sender_id: null }, deps());
          } else if (op === "expire") {
            await expireDue(deps());
          } else if (op === "advance") {
            clock.advance(r() < 0.7 ? Math.floor(r() * 90_000) : Math.floor(r() * 40) * 60_000);
          } else if (op === "failed") {
            const o = snap.offers.filter((x) => x.status === "open");
            if (o.length) await markOfferSendFailed({ offer_id: pick(o).id, reason: "X" }, deps());
          } else if (op === "chaos") {
            // the world changes under the offers: approvals revoked and restored, a recipient closing early
            const what = pick(["courier_off", "courier_on", "donor_off", "donor_on", "recipient_early", "recipient_late"] as const);
            const courier = pick(COURIERS);
            if (what === "courier_off") await w.db.update(couriers).set({ approval_status: "suspended" }).where(eq(couriers.id, courier));
            else if (what === "courier_on") await w.db.update(couriers).set({ approval_status: "approved" }).where(eq(couriers.id, courier));
            else if (what === "donor_off") await w.db.update(donors).set({ approval_status: "suspended" }).where(eq(donors.id, snap.donations[0]?.donor_id ?? ""));
            else if (what === "donor_on") await w.db.update(donors).set({ approval_status: "approved" });
            else if (what === "recipient_early") await w.db.update(recipients).set({ receiving_closes_at: new Date(clock.now().getTime() + 5 * 60_000) }).where(eq(recipients.id, EASTLAKE));
            else await w.db.update(recipients).set({ receiving_closes_at: new Date(clock.now().getTime() + 8 * 3600_000) }).where(eq(recipients.id, EASTLAKE));
            label = `chaos ${what}`;
          } else if (op === "collect") {
            const d = snap.donations.filter((x) => x.status === "claimed" && x.collected_at === null);
            if (d.length) {
              const t = pick(d);
              await w.db.update(donations).set({ status: "collected", collected_at: clock.now(), version: t.version + 1 }).where(and(eq(donations.id, t.id), eq(donations.status, "claimed")));
            }
          }
        } catch (e) {
          throw new Error(`seed ${seed} step ${step} "${label}" threw: ${(e as Error).message}\nlog:\n  ${log.slice(-12).join("\n  ")}`);
        }
        log.push(`${step}: ${label} @+${Math.round((clock.now().getTime() - T0.getTime()) / 1000)}s`);
        note(label.startsWith("race") ? "race" : label);
        if (label.startsWith("race ")) for (const code of label.slice(5).split(",")) note(`race ${code}`);
        await check(label);
      }
      // a final sweep far in the future leaves nothing live anywhere and nothing claimed-but-unowned
      clock.advance(24 * 3600_000);
      await expireDue(deps());
      const end = await snapshot();
      await check("final sweep");
      expect(end.offers.filter((o) => LIVE.includes(o.status))).toEqual([]);
      void inArray;
      void isNull;
      void COURIER_C;
    });
  }

  it("the random sequences really reached the interesting states", () => {
    const n = (k: string) => seen.get(k) ?? 0;
    console.log("coverage:", JSON.stringify(Object.fromEntries([...seen].sort())));
    expect(n("claim claimed") + n("race claimed")).toBeGreaterThan(20);
    expect(n("claim ineligible") + n("race ineligible")).toBeGreaterThan(0);
    expect(n("claim already_claimed")).toBeGreaterThan(0);
    expect(n("claim offer_expired") + n("race offer_expired")).toBeGreaterThan(0);
    expect(n("claim not_authorized")).toBeGreaterThan(0);
    expect(n("decline declined")).toBeGreaterThan(0);
    expect(n("dispatch true")).toBeGreaterThan(20);
    expect(n("race")).toBeGreaterThan(10);
    expect(n("stop") + n("join")).toBeGreaterThan(20);
    expect(n("race already_claimed") + n("race already_claimed_by_you") + n("claim already_claimed") + n("claim already_claimed_by_you")).toBeGreaterThan(0);
    expect(n("collect")).toBeGreaterThan(0);
  });
});
