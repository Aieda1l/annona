import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { claimOffer, createNextOffers, declineOffer, expireDue, openOfferForSend } from "@/core";
import { retryOnConflict } from "@/core/service/runtime";
import { donations, offers } from "@/db/schema";
import { COURIER_A, T0, at, courierActor, iso, makeEligibleDonation, makeWorld, resetWorld, type World } from "./helpers/world";

// Regression tests for the ECC review of the slice 2 service layer (correctness, group 1). Each failed before its fix.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

let w: World;
beforeAll(async () => {
  w = await makeWorld();
});
afterAll(async () => w.close());
beforeEach(async () => resetWorld(w));

const cmd = (offer_id: string) => ({ offer_ref: { offer_id }, actor: courierActor(COURIER_A), source: "messaging" as const, source_event_id: null });
const donationRow = async (id: string) => (await w.db.select().from(donations).where(eq(donations.id, id)))[0]!;

async function claimed(opts: { facts?: Record<string, unknown> } = {}) {
  const id = await makeEligibleDonation(w, { facts: opts.facts });
  const created = await createNextOffers({ donation_id: id }, w.deps());
  const offer = created.ok ? created.data[0]! : (undefined as never);
  await openOfferForSend({ offer_id: offer.id }, w.deps());
  const r = await claimOffer(cmd(offer.id), w.deps(at(0.2)));
  expect(r.code).toBe("claimed");
  return { id, offer };
}

describe("an ended assignment is not an assignment: no replay, no address (review finding, Important)", () => {
  it("after the no-show expiry (S-16) the courier's replayed YES is donation_unavailable, with no assignment", async () => {
    const { id, offer } = await claimed();
    await expireDue(w.deps(at(120)));
    expect(await donationRow(id)).toMatchObject({ status: "expired" });
    const again = await claimOffer(cmd(offer.id), w.deps(at(121)));
    expect(again).toMatchObject({ code: "donation_unavailable", assignment: null });
    expect(JSON.stringify(again)).not.toContain("Demo");
  });
  it("after the operator cancels (the assignment is closed as donation_canceled) the replay is unavailable too", async () => {
    const { id, offer } = await claimed();
    await w.db.update(offers).set({ close_reason: "donation_canceled" }).where(eq(offers.id, offer.id));
    await w.db.update(donations).set({ status: "canceled" }).where(eq(donations.id, id));
    expect(await claimOffer(cmd(offer.id), w.deps(at(5)))).toMatchObject({ code: "donation_unavailable", assignment: null });
  });
  it("after delivery the replay no longer returns the pickup address", async () => {
    const { id, offer } = await claimed();
    await w.db.update(donations).set({ status: "delivered", collected_at: at(10) }).where(eq(donations.id, id));
    const again = await claimOffer(cmd(offer.id), w.deps(at(20)));
    expect(again.assignment).toBeNull();
    expect(again.code).not.toBe("already_claimed_by_you");
  });
  it("while the assignment is active (claimed, then collected) the winner's replay still works", async () => {
    const { id, offer } = await claimed();
    expect((await claimOffer(cmd(offer.id), w.deps(at(1)))).code).toBe("already_claimed_by_you");
    await w.db.update(donations).set({ status: "collected", collected_at: at(10) }).where(eq(donations.id, id));
    expect((await claimOffer(cmd(offer.id), w.deps(at(11)))).code).toBe("already_claimed_by_you");
  });
});

describe("openOfferForSend honors the effective cutoff, not only pickup - eta (review finding)", () => {
  it("an offer opened after discard_by (which is earlier than the pickup time) expires instead of going out", async () => {
    const id = await makeEligibleDonation(w, { facts: { discard_by: iso(50) } }); // pickup +120, discard-by +50
    const created = await createNextOffers({ donation_id: id }, w.deps());
    const offer = created.ok ? created.data[0]! : (undefined as never);
    const r = await openOfferForSend({ offer_id: offer.id }, w.deps(at(51)));
    expect(r).toMatchObject({ ok: false, error: { details: { reason: "cutoff_reached", offer_id: offer.id } } });
    expect((await w.db.select().from(offers).where(eq(offers.id, offer.id)))[0]).toMatchObject({ status: "expired", close_reason: "cutoff_reached" });
  });
  it("just before discard_by it still opens", async () => {
    const id = await makeEligibleDonation(w, { facts: { discard_by: iso(50) } });
    const created = await createNextOffers({ donation_id: id }, w.deps());
    const r = await openOfferForSend({ offer_id: created.ok ? created.data[0]!.id : "" }, w.deps(at(40)));
    expect(r.ok).toBe(true);
  });
});

describe("a result reports the donation as it is after the lazy expiry (review finding)", () => {
  it("a late claim: the offer expires, the donation goes back to eligible, and the result says so", async () => {
    const id = await makeEligibleDonation(w);
    const created = await createNextOffers({ donation_id: id }, w.deps());
    const offer = created.ok ? created.data[0]! : (undefined as never);
    await openOfferForSend({ offer_id: offer.id }, w.deps());
    const late = await claimOffer(cmd(offer.id), w.deps(new Date(T0.getTime() + 60_000)));
    expect(late).toMatchObject({ code: "offer_expired", donation_status: "eligible" });
    expect((await donationRow(id)).status).toBe("eligible");
  });
  it("a late decline says the same", async () => {
    const id = await makeEligibleDonation(w);
    const created = await createNextOffers({ donation_id: id }, w.deps());
    const offer = created.ok ? created.data[0]! : (undefined as never);
    await openOfferForSend({ offer_id: offer.id }, w.deps());
    expect(await declineOffer(cmd(offer.id), w.deps(new Date(T0.getTime() + 60_000)))).toMatchObject({ code: "offer_expired", donation_status: "eligible" });
  });
});

describe("retryOnConflict: a deadlock or serialization failure is retried once, anything else is not (review finding)", () => {
  const pg = (code: string) => Object.assign(new Error("boom"), { code });
  it("retries on 40P01 and 40001 (also when wrapped as a cause) and returns the second result", async () => {
    for (const code of ["40P01", "40001"]) {
      let calls = 0;
      const out = await retryOnConflict(async () => {
        if (++calls === 1) throw pg(code);
        return "ok";
      });
      expect([out, calls]).toEqual(["ok", 2]);
    }
    let wrapped = 0;
    expect(await retryOnConflict(async () => { if (++wrapped === 1) throw Object.assign(new Error("Failed query"), { cause: pg("40P01") }); return 7; })).toBe(7);
  });
  it("gives up after the retries and rethrows; other errors are rethrown at once", async () => {
    let calls = 0;
    await expect(retryOnConflict(async () => { calls++; throw pg("40P01"); })).rejects.toThrow("boom");
    expect(calls).toBe(3); // the first try plus two retries
    let other = 0;
    await expect(retryOnConflict(async () => { other++; throw pg("23505"); })).rejects.toThrow("boom");
    expect(other).toBe(1);
  });
});
