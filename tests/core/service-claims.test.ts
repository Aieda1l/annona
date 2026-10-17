import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ClaimResult, DeclineResult, type Actor, type ClaimCommand } from "@/contracts";
import {
  claimOffer,
  createNextOffers,
  declineOffer,
  expireDue,
  getDonationCard,
  joinIdentity,
  openOfferForSend,
  optOutIdentity,
  submitVerification,
} from "@/core";
import { audit_events, couriers, donations, donors, messaging_identities, offers, policy_config, recipients, verification_links } from "@/db/schema";
import {
  COURIER_A,
  COURIER_B,
  COURIER_C,
  DONOR,
  EASTLAKE,
  IDENTITY,
  OPERATOR,
  T0,
  at,
  courierActor,
  factsAt,
  insertDonation,
  insertOffer,
  makeEligibleDonation,
  makeWorld,
  operatorActor,
  resetWorld,
  type World,
} from "./helpers/world";

// Slice 2(b), part 3: claimOffer and declineOffer (CONTRACTS 8.1, 3.9, 11) and optOutIdentity (S-15, S-16, S-17).
// First valid claim wins; every outcome is a result; foreign or unknown offers reveal nothing.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

let w: World;
beforeAll(async () => {
  w = await makeWorld();
});
afterAll(async () => w.close());
beforeEach(async () => resetWorld(w));

const donationRow = async (id: string) => (await w.db.select().from(donations).where(eq(donations.id, id)))[0]!;
const offerRow = async (id: string) => (await w.db.select().from(offers).where(eq(offers.id, id)))[0]!;
const eventsOf = async (donation_id: string, type?: string) =>
  (await w.db.select().from(audit_events).where(eq(audit_events.donation_id, donation_id))).filter((e) => !type || e.type === type);
const cmd = (offer_id: string, actor: Actor = courierActor(COURIER_A), source: ClaimCommand["source"] = "messaging"): ClaimCommand => ({ offer_ref: { offer_id }, actor, source, source_event_id: `evt-${offer_id}` });
async function setPolicy(patch: Record<string, unknown>) {
  const [row] = await w.db.select().from(policy_config).where(eq(policy_config.active, true));
  await w.db.update(policy_config).set({ config: { ...(row!.config as object), ...patch } }).where(eq(policy_config.policy_id, row!.policy_id));
}

/** An eligible donation turned into open offers (wave size `wave`) at time `openAt`. */
async function openOffers(opts: { wave?: number; openAt?: Date; facts?: Record<string, unknown> } = {}) {
  if (opts.wave) await setPolicy({ offer_wave_size: opts.wave });
  const id = await makeEligibleDonation(w, { facts: opts.facts });
  const created = await createNextOffers({ donation_id: id }, w.deps());
  if (!created.ok) throw new Error("no offers");
  const opened = [];
  for (const o of created.data) {
    const r = await openOfferForSend({ offer_id: o.id }, w.deps(opts.openAt ?? T0));
    if (!r.ok) throw new Error(`open failed ${r.error.code}`);
    opened.push(r.data.offer);
  }
  return { id, offers: opened };
}

describe("claimOffer: the winner (step 9)", () => {
  it("claims by offer id: the donation is claimed, the offer accepted, and the assignment carries both addresses", async () => {
    const { id, offers: [o] } = await openOffers();
    const r = await claimOffer(cmd(o!.id), w.deps(at(0.5)));
    expect(r).toMatchObject({ code: "claimed", offer_id: o!.id, donation_id: id, donation_status: "claimed" });
    expect(r.assignment).toEqual({
      donation_id: id,
      recipient: { display_name: "Eastlake Community Pantry (synthetic)", address_line: "400 Demo Blvd (synthetic)" },
      pickup: { display_name: "Rainier Catering (synthetic)", address_line: "100 Demo Way (synthetic)", pickup_instructions: "Rear loading door; ask for the catering lead.", donor_pickup_by: factsAt().donor_pickup_by },
    });
    expect(ClaimResult.safeParse(r).success).toBe(true);
    expect(await donationRow(id)).toMatchObject({ status: "claimed", claimed_offer_id: o!.id, version: 4 });
    expect(await offerRow(o!.id)).toMatchObject({ status: "accepted", close_reason: null });
    expect((await offerRow(o!.id)).responded_at?.toISOString()).toBe(at(0.5).toISOString());
  });
  it("claims by short code just the same", async () => {
    const { offers: [o] } = await openOffers();
    const r = await claimOffer({ offer_ref: { short_code: o!.short_code }, actor: courierActor(), source: "messaging", source_event_id: null }, w.deps(at(0.2)));
    expect(r.code).toBe("claimed");
  });
  it("supersedes every sibling offer and audits the claim without addresses, handles or text", async () => {
    const { id, offers: [a, b] } = await openOffers({ wave: 2 });
    await claimOffer(cmd(b!.id, courierActor(COURIER_B), "simulated_messaging"), w.deps(at(0.2)));
    expect(await offerRow(a!.id)).toMatchObject({ status: "superseded", close_reason: "superseded_by_claim" });
    const types = (await eventsOf(id)).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(["claim.accepted", "offer.superseded"]));
    const accepted = (await eventsOf(id, "claim.accepted"))[0]!;
    expect(accepted.data).toEqual({ source: "simulated_messaging", source_event_id: `evt-${b!.id}` });
    const text = JSON.stringify(await eventsOf(id));
    for (const secret of ["Demo Way", "Demo Blvd", "Rear loading", "example.invalid"]) expect(text).not.toContain(secret);
  });
  it("replay by the winner is idempotent: already_claimed_by_you with the assignment, and nothing is written", async () => {
    const { id, offers: [o] } = await openOffers();
    await claimOffer(cmd(o!.id), w.deps(at(0.2)));
    const before = { d: await donationRow(id), n: (await eventsOf(id)).length };
    const again = await claimOffer(cmd(o!.id), w.deps(at(5)));
    expect(again).toMatchObject({ code: "already_claimed_by_you", donation_status: "claimed" });
    expect(again.assignment?.pickup.address_line).toBe("100 Demo Way (synthetic)");
    expect((await donationRow(id)).version).toBe(before.d.version);
    expect((await eventsOf(id)).length).toBe(before.n);
  });
  it("a losing courier gets already_claimed and no address", async () => {
    const { offers: [a, b] } = await openOffers({ wave: 2 });
    await claimOffer(cmd(a!.id), w.deps(at(0.2)));
    const lose = await claimOffer(cmd(b!.id, courierActor(COURIER_B)), w.deps(at(0.3)));
    expect(lose).toMatchObject({ code: "already_claimed", donation_status: "claimed", assignment: null });
    expect(JSON.stringify(lose)).not.toContain("Demo");
  });
  it.each([2, 3, 6, 10])("%i simultaneous claims on one donation: exactly one claimed, exactly one active assignment", async (n) => {
    const { id, offers: os } = await openOffers({ wave: 2 });
    const a = os[0]!;
    const b = os[1]!;
    const commands = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? cmd(a.id) : cmd(b.id, courierActor(COURIER_B))));
    const results = await Promise.all(commands.map((c) => claimOffer(c, w.deps(at(0.2)))));
    expect(results.filter((r) => r.code === "claimed")).toHaveLength(1);
    for (const r of results) expect(["claimed", "already_claimed", "already_claimed_by_you"]).toContain(r.code);
    const active = (await w.db.select().from(offers).where(eq(offers.donation_id, id))).filter((o) => o.status === "accepted" && o.close_reason === null);
    expect(active).toHaveLength(1);
    expect((await donationRow(id)).claimed_offer_id).toBe(active[0]!.id);
  });
  it("one courier claiming twice at once gets one claimed and one already_claimed_by_you", async () => {
    const { offers: [o] } = await openOffers();
    const rs = await Promise.all([claimOffer(cmd(o!.id), w.deps(at(0.2))), claimOffer(cmd(o!.id), w.deps(at(0.2)))]);
    expect(rs.map((r) => r.code).sort()).toEqual(["already_claimed_by_you", "claimed"]);
  });
});

describe("claimOffer: refusals in the order of CONTRACTS 8.1", () => {
  it("offer_not_found for an unknown id or code, or a malformed reference; nothing leaks, nothing throws", async () => {
    const empty = { offer_id: null, donation_id: null, donation_status: null, assignment: null };
    expect(await claimOffer(cmd(randomUUID()), w.deps())).toMatchObject({ code: "offer_not_found", ...empty });
    expect(await claimOffer({ offer_ref: { short_code: "ZZZZ" }, actor: courierActor(), source: "messaging", source_event_id: null }, w.deps())).toMatchObject({ code: "offer_not_found", ...empty });
    for (const offer_ref of [undefined, {}, { offer_id: 5 }, null]) {
      expect(await claimOffer({ offer_ref: offer_ref as never, actor: courierActor(), source: "messaging", source_event_id: null }, w.deps())).toMatchObject({ code: "offer_not_found" });
    }
  });
  it("not_authorized for anyone but the offer's courier (including the operator), with no details", async () => {
    const { offers: [o] } = await openOffers();
    const empty = { offer_id: null, donation_id: null, donation_status: null, assignment: null };
    for (const actor of [courierActor(COURIER_B), courierActor(COURIER_C), operatorActor, { role: "donor", id: DONOR } as Actor, { role: "courier", id: null } as Actor, { role: "system", id: null } as Actor]) {
      expect(await claimOffer(cmd(o!.id, actor), w.deps(at(0.2))), actor.role).toMatchObject({ code: "not_authorized", ...empty });
    }
    expect((await offerRow(o!.id)).status).toBe("open");
    void OPERATOR;
  });
  it("donation_unavailable when the donation is not offered (canceled, expired, or already back to eligible)", async () => {
    const { id, offers: [o] } = await openOffers();
    for (const status of ["canceled", "expired", "eligible", "rejected"]) {
      await w.db.update(donations).set({ status }).where(eq(donations.id, id));
      expect(await claimOffer(cmd(o!.id), w.deps(at(0.2))), status).toMatchObject({ code: "donation_unavailable", assignment: null });
    }
    expect((await offerRow(o!.id)).status).toBe("open");
  });
  it("offer_expired for a late claim even though no sweeper ever ran; the offer is marked expired and the donation released", async () => {
    const { id, offers: [o] } = await openOffers(); // 60 s window
    const late = await claimOffer(cmd(o!.id), w.deps(new Date(T0.getTime() + 60_000)));
    expect(late).toMatchObject({ code: "offer_expired", donation_status: "offered", assignment: null });
    expect(await offerRow(o!.id)).toMatchObject({ status: "expired", close_reason: "offer_expired" });
    expect((await donationRow(id)).status).toBe("eligible"); // S-06: ready for the next courier
    expect(await claimOffer(cmd(o!.id), w.deps(at(2)))).toMatchObject({ code: "donation_unavailable" }); // and a repeat is just unavailable
  });
  it("one millisecond before the deadline still wins; the deadline itself loses", async () => {
    const a = await openOffers();
    expect((await claimOffer(cmd(a.offers[0]!.id), w.deps(new Date(T0.getTime() + 59_999)))).code).toBe("claimed");
    await resetWorld(w);
    const b = await openOffers();
    expect((await claimOffer(cmd(b.offers[0]!.id), w.deps(new Date(T0.getTime() + 60_000)))).code).toBe("offer_expired");
  });
  it("offer_expired when the donation cutoff is reached before the offer's own deadline (the donation is left for expireDue)", async () => {
    await setPolicy({ response_window_seconds: 600 });
    const { id, offers: [o] } = await openOffers({ facts: { donor_pickup_by: new Date(T0.getTime() + 30 * 60_000).toISOString() } });
    const late = await claimOffer(cmd(o!.id), w.deps(at(30))); // cutoff = pickup = +30; the offer deadline was about +10
    expect(late.code).toBe("offer_expired");
    expect((await donationRow(id)).status).toBe("offered");
    expect((await expireDue(w.deps(at(30)))).expired_donation_ids).toEqual([id]);
  });
  it("offer_closed for a declined, superseded, canceled or send_failed offer while the donation is still offered", async () => {
    const { id, offers: [a, b] } = await openOffers({ wave: 2 });
    await w.db.update(offers).set({ status: "declined", responded_at: T0 }).where(eq(offers.id, a!.id));
    expect(await claimOffer(cmd(a!.id), w.deps(at(0.2)))).toMatchObject({ code: "offer_closed", donation_status: "offered" });
    for (const status of ["superseded", "canceled", "send_failed"]) {
      await w.db.update(offers).set({ status, responded_at: T0 }).where(eq(offers.id, a!.id));
      expect(await claimOffer(cmd(a!.id), w.deps(at(0.2))), status).toMatchObject({ code: "offer_closed" });
    }
    expect((await offerRow(b!.id)).status).toBe("open");
    expect((await donationRow(id)).status).toBe("offered");
  });
  it("a courier whose accepted assignment ended (STOP) cannot claim it again: already_claimed once someone else holds the donation", async () => {
    const { id, offers: [o] } = await openOffers();
    await claimOffer(cmd(o!.id), w.deps(at(0.2)));
    await w.db.update(offers).set({ close_reason: "courier_opted_out" }).where(eq(offers.id, o!.id));
    await w.db.update(donations).set({ claimed_offer_id: randomUUID() }).where(eq(donations.id, id)); // someone else claimed it since
    expect((await claimOffer(cmd(o!.id), w.deps(at(1)))).code).toBe("already_claimed");
  });
});

describe("claimOffer: the re-check under the lock (step 8) returns ineligible and cancels the offer", () => {
  const expectIneligible = async (id: string, offerId: string, deps = w.deps(at(0.2))) => {
    const r = await claimOffer(cmd(offerId), deps);
    expect(r).toMatchObject({ code: "ineligible", assignment: null });
    expect(await offerRow(offerId)).toMatchObject({ status: "canceled", close_reason: "recheck_failed" });
    expect((await eventsOf(id, "claim.rejected")).length).toBe(1);
    return r;
  };
  it("the donor was suspended after the offer went out (G-01); the donation returns to eligible for the gate to settle", async () => {
    const { id, offers: [o] } = await openOffers();
    await w.db.update(donors).set({ approval_status: "suspended" }).where(eq(donors.id, DONOR));
    const r = await expectIneligible(id, o!.id);
    expect(r.donation_status).toBe("eligible");
    await createNextOffers({ donation_id: id }, w.deps(at(1))); // the next dispatch round re-runs the gate: S-18
    expect((await donationRow(id)).status).toBe("rejected");
  });
  it("the policy's pickup lead time was raised past what is left (G-10)", async () => {
    const { id, offers: [o] } = await openOffers({ facts: { donor_pickup_by: new Date(T0.getTime() + 25 * 60_000).toISOString() } });
    await setPolicy({ min_pickup_lead_minutes: 30 });
    await expectIneligible(id, o!.id);
  });
  it("the courier's approval was revoked", async () => {
    const { id, offers: [o] } = await openOffers();
    await w.db.update(couriers).set({ approval_status: "suspended" }).where(eq(couriers.id, COURIER_A));
    await expectIneligible(id, o!.id);
  });
  it("the recipient's approval was revoked", async () => {
    const { id, offers: [o] } = await openOffers();
    await w.db.update(recipients).set({ approval_status: "suspended" }).where(eq(recipients.id, EASTLAKE));
    await expectIneligible(id, o!.id);
  });
  it("the recipient now closes before the drop-off could finish (pair-level M-10)", async () => {
    const { id, offers: [o] } = await openOffers();
    await w.db.update(recipients).set({ receiving_closes_at: new Date(T0.getTime() + 60_000) }).where(eq(recipients.id, EASTLAKE));
    await expectIneligible(id, o!.id);
  });
  it("the courier's shift now ends too soon (pair-level M-10)", async () => {
    const { id, offers: [o] } = await openOffers();
    await w.db.update(couriers).set({ available_until: new Date(T0.getTime() + 60_000) }).where(eq(couriers.id, COURIER_A));
    await expectIneligible(id, o!.id);
  });
  it("another donation took the recipient's capacity in the meantime (M-04, read under the recipient lock)", async () => {
    const { id, offers: [o] } = await openOffers();
    const other = await insertDonation(w.db, { status: "claimed", claimed_offer_id: randomUUID(), verified_facts: factsAt(T0, { servings: 190 }) as never });
    await insertOffer(w.db, other.id, { courier_id: COURIER_C, status: "accepted", responded_at: T0 });
    await expectIneligible(id, o!.id); // capacity 200 - 190 = 10 < 24
  });
  it("the courier opted out (their identity is no longer joined)", async () => {
    const { id, offers: [o] } = await openOffers();
    await w.db.update(messaging_identities).set({ status: "opted_out" }).where(eq(messaging_identities.id, IDENTITY.courier_a));
    await expectIneligible(id, o!.id);
  });
  it("a donation with a wave of 2 stays offered when only one offer fails its re-check", async () => {
    const { id, offers: [a, b] } = await openOffers({ wave: 2 });
    await w.db.update(couriers).set({ approval_status: "suspended" }).where(eq(couriers.id, COURIER_A));
    const r = await claimOffer(cmd(a!.id), w.deps(at(0.2)));
    expect(r).toMatchObject({ code: "ineligible", donation_status: "offered" });
    expect((await offerRow(b!.id)).status).toBe("open");
    expect((await claimOffer(cmd(b!.id, courierActor(COURIER_B)), w.deps(at(0.3)))).code).toBe("claimed");
    void id;
  });
});

describe("declineOffer", () => {
  it("declined: the offer is declined and, as the last live offer, the donation goes back to eligible (S-06)", async () => {
    const { id, offers: [o] } = await openOffers();
    const r = await declineOffer(cmd(o!.id), w.deps(at(0.2)));
    expect(r).toMatchObject({ code: "declined", offer_id: o!.id, donation_id: id, donation_status: "eligible", assignment: null });
    expect(DeclineResult.safeParse(r).success).toBe(true);
    expect(await offerRow(o!.id)).toMatchObject({ status: "declined" });
    expect((await eventsOf(id, "offer.declined")).length).toBe(1);
  });
  it("with another live offer in the wave the donation stays offered", async () => {
    const { id, offers: [a] } = await openOffers({ wave: 2 });
    expect((await declineOffer(cmd(a!.id), w.deps(at(0.2)))).donation_status).toBe("offered");
    expect((await donationRow(id)).status).toBe("offered");
  });
  it("a replay is already_declined and writes nothing more", async () => {
    const { id, offers: [o] } = await openOffers();
    await declineOffer(cmd(o!.id), w.deps(at(0.2)));
    const n = (await eventsOf(id)).length;
    expect((await declineOffer(cmd(o!.id), w.deps(at(0.4)))).code).toBe("already_declined");
    expect((await eventsOf(id)).length).toBe(n);
  });
  it("after the deadline it is offer_expired (the lazy expiry marks the offer), never a decline", async () => {
    const { id, offers: [o] } = await openOffers();
    expect(await declineOffer(cmd(o!.id), w.deps(new Date(T0.getTime() + 60_000)))).toMatchObject({ code: "offer_expired" });
    expect((await offerRow(o!.id)).status).toBe("expired");
    expect((await donationRow(id)).status).toBe("eligible");
  });
  it("an already expired offer is offer_expired; superseded, canceled, send_failed and accepted offers are offer_closed", async () => {
    const { offers: [o] } = await openOffers();
    await w.db.update(offers).set({ status: "expired" }).where(eq(offers.id, o!.id));
    expect((await declineOffer(cmd(o!.id), w.deps(at(0.2)))).code).toBe("offer_expired");
    for (const status of ["superseded", "canceled", "send_failed", "accepted"]) {
      await w.db.update(offers).set({ status }).where(eq(offers.id, o!.id));
      expect((await declineOffer(cmd(o!.id), w.deps(at(0.2)))).code, status).toBe("offer_closed");
    }
  });
  it("not_authorized for another courier or the operator, offer_not_found for nothing; no details either way", async () => {
    const { offers: [o] } = await openOffers();
    const empty = { offer_id: null, donation_id: null, donation_status: null };
    expect(await declineOffer(cmd(o!.id, courierActor(COURIER_B)), w.deps(at(0.2)))).toMatchObject({ code: "not_authorized", ...empty });
    expect(await declineOffer(cmd(o!.id, operatorActor), w.deps(at(0.2)))).toMatchObject({ code: "not_authorized", ...empty });
    expect(await declineOffer(cmd(randomUUID()), w.deps())).toMatchObject({ code: "offer_not_found", ...empty });
    expect((await offerRow(o!.id)).status).toBe("open");
  });
  it("after a decline the donation is unavailable to that courier's claim attempt", async () => {
    const { offers: [o] } = await openOffers();
    await declineOffer(cmd(o!.id), w.deps(at(0.2)));
    expect((await claimOffer(cmd(o!.id), w.deps(at(0.3)))).code).toBe("donation_unavailable");
  });
});

describe("optOutIdentity (STOP): S-15, S-16, S-17", () => {
  const stop = (identity_id: string, at_: Date = at(1)) => optOutIdentity({ identity_id }, w.deps(at_));

  it("opts the identity out with the clock's time, audits once, and is idempotent", async () => {
    const r = await stop(IDENTITY.courier_b, at(3));
    expect(r).toMatchObject({ ok: true, data: { status: "opted_out", opted_out_at: at(3).toISOString() } });
    await stop(IDENTITY.courier_b, at(9));
    const evs = (await w.db.select().from(audit_events)).filter((e) => e.type === "identity.opted_out" && (e.data as { identity_id: string }).identity_id === IDENTITY.courier_b);
    expect(evs).toHaveLength(1);
    expect(JSON.stringify(evs)).not.toContain("example.invalid");
    expect(await stop(randomUUID())).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
  it("an open offer is canceled and the donation goes to the next courier (S-06); other couriers' offers are untouched", async () => {
    const { id, offers: [a, b] } = await openOffers({ wave: 2 });
    await stop(IDENTITY.courier_a);
    expect(await offerRow(a!.id)).toMatchObject({ status: "canceled", close_reason: "courier_opted_out" });
    expect((await offerRow(b!.id)).status).toBe("open");
    expect((await donationRow(id)).status).toBe("offered");
    await stop(IDENTITY.courier_b);
    expect((await donationRow(id)).status).toBe("eligible");
  });
  it("a pending_send offer is canceled too, so nothing is ever sent to someone who stopped", async () => {
    const id = await makeEligibleDonation(w);
    const created = await createNextOffers({ donation_id: id }, w.deps());
    const o = created.ok ? created.data[0]! : (undefined as never);
    await stop(IDENTITY.courier_a);
    expect(await offerRow(o.id)).toMatchObject({ status: "canceled", close_reason: "courier_opted_out" });
    expect(await openOfferForSend({ offer_id: o.id }, w.deps(at(2)))).toMatchObject({ ok: false });
  });
  it("S-15: STOP while assigned and before the cutoff releases the assignment; the next courier gets it, never the one who left", async () => {
    const { id, offers: [o] } = await openOffers();
    await claimOffer(cmd(o!.id), w.deps(at(0.2)));
    await stop(IDENTITY.courier_a, at(5));
    const row = await donationRow(id);
    expect(row).toMatchObject({ status: "eligible", claimed_offer_id: null });
    expect(await offerRow(o!.id)).toMatchObject({ status: "accepted", close_reason: "courier_opted_out" });
    const reasons = (row.latest_decision as { reasons: Array<{ code: string; severity: string }> }).reasons;
    expect(reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: "COURIER_OPTED_OUT", severity: "dispatch" })]));
    expect((await eventsOf(id, "assignment.released")).length).toBe(1);
    const next = await createNextOffers({ donation_id: id }, w.deps(at(6)));
    expect(next.ok && next.data[0]).toMatchObject({ courier_id: COURIER_B, wave_no: 2 });
  });
  it("S-15: the released assignment no longer counts against the recipient's capacity", async () => {
    const { offers: [o] } = await openOffers();
    await claimOffer(cmd(o!.id), w.deps(at(0.2)));
    await w.db.update(recipients).set({ capacity_servings_available: 30 }).where(eq(recipients.id, EASTLAKE));
    await stop(IDENTITY.courier_a, at(5));
    const id2 = await makeEligibleDonation(w); // 24 servings, capacity 30, nothing committed any more
    const r = await createNextOffers({ donation_id: id2 }, w.deps(at(6)));
    expect(r.ok && r.data).toHaveLength(1);
  });
  it("S-16: STOP at or after the cutoff expires the donation as a no-show instead of releasing it", async () => {
    const { id, offers: [o] } = await openOffers();
    await claimOffer(cmd(o!.id), w.deps(at(0.2)));
    await stop(IDENTITY.courier_a, at(120)); // cutoff = pickup at +120
    expect(await donationRow(id)).toMatchObject({ status: "expired", claimed_offer_id: expect.any(String) });
    expect(await offerRow(o!.id)).toMatchObject({ status: "accepted", close_reason: "pickup_not_collected" });
    expect(((await donationRow(id)).latest_decision as { reasons: Array<{ code: string }> }).reasons.map((r) => r.code)).toContain("PICKUP_NOT_COLLECTED");
  });
  it("S-17: STOP after the food was collected goes to the operator, is never reassigned, and cannot be edited by the donor", async () => {
    const { id, offers: [o] } = await openOffers();
    await claimOffer(cmd(o!.id), w.deps(at(0.2)));
    await w.db.update(donations).set({ status: "collected", collected_at: at(30) }).where(eq(donations.id, id));
    await stop(IDENTITY.courier_a, at(40));
    const row = await donationRow(id);
    expect(row).toMatchObject({ status: "needs_review", claimed_offer_id: null });
    expect(row.collected_at).not.toBeNull();
    expect(await offerRow(o!.id)).toMatchObject({ status: "accepted", close_reason: "courier_opted_out" });
    const reasons = (row.latest_decision as { reasons: Array<{ code: string; severity: string }> }).reasons;
    expect(reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: "COURIER_OPTED_OUT_AFTER_PICKUP", severity: "review" })]));
    // never reassigned, never edited: S-04, S-03 and S-13 are all closed to it
    expect(await createNextOffers({ donation_id: id }, w.deps(at(41)))).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
    expect(await submitVerification({ auth: { actor: { role: "donor", id: DONOR } }, donation_id: id, facts: factsAt(at(40)), edited_from_ai: [] }, w.deps(at(41)))).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
  });
  it("a courier's STOP does not touch another courier's assignment", async () => {
    const { id, offers: [a] } = await openOffers();
    await claimOffer(cmd(a!.id), w.deps(at(0.2)));
    await stop(IDENTITY.courier_b, at(5));
    expect(await donationRow(id)).toMatchObject({ status: "claimed", claimed_offer_id: a!.id });
  });
  it("a donor's STOP revokes that donor's live verification links and nothing else", async () => {
    const id = await makeEligibleDonation(w);
    const link = (over: object) => ({ id: randomUUID(), donation_id: id, donor_id: DONOR, token_hash: randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", ""), issued_at: T0, expires_at: at(30), ...over });
    const live = link({});
    const used = link({ consumed_at: T0 });
    await w.db.insert(verification_links).values([live, used]);
    await stop(IDENTITY.donor, at(2));
    const rows = await w.db.select().from(verification_links);
    expect(rows.find((r) => r.id === live.id)!.revoked_at).not.toBeNull();
    expect(rows.find((r) => r.id === used.id)!.revoked_at).toBeNull();
    expect((await donationRow(id)).status).toBe("eligible");
  });
  it("a repeated STOP finishes any unwinding a crash left undone", async () => {
    const { id, offers: [o] } = await openOffers();
    await w.db.update(messaging_identities).set({ status: "opted_out", opted_out_at: T0 }).where(eq(messaging_identities.id, IDENTITY.courier_a)); // half-done STOP
    await stop(IDENTITY.courier_a, at(2));
    expect(await offerRow(o!.id)).toMatchObject({ status: "canceled", close_reason: "courier_opted_out" });
    expect((await donationRow(id)).status).toBe("eligible");
  });
  it("after STOP the courier can JOIN again and be offered new work", async () => {
    await stop(IDENTITY.courier_a, at(1));
    const rejoin = await joinIdentity({ identity_id: IDENTITY.courier_a, provider_space_id: null, provider_sender_id: null }, w.deps(at(2)));
    expect(rejoin).toMatchObject({ ok: true, data: { status: "joined" } });
    const id = await makeEligibleDonation(w, { from: at(2) });
    const r = await createNextOffers({ donation_id: id }, w.deps(at(2)));
    expect(r.ok && r.data[0]!.courier_id).toBe(COURIER_A);
  });
});

describe("the whole flow, including no response and the operator's view", () => {
  it("no response from the first courier, the second one claims, and the card tells each audience the right amount", async () => {
    const { id, offers: [a] } = await openOffers();
    await expireDue(w.deps(at(2))); // courier A never answered
    const next = await createNextOffers({ donation_id: id }, w.deps(at(2)));
    const b = next.ok ? next.data[0]! : (undefined as never);
    expect(b.courier_id).toBe(COURIER_B);
    await openOfferForSend({ offer_id: b.id }, w.deps(at(2)));
    expect((await claimOffer(cmd(a!.id), w.deps(at(2.1)))).code).toBe("offer_expired"); // A's late reply loses: step 6, the donation is offered to B now
    expect((await donationRow(id)).status).toBe("offered");
    expect((await offerRow(b.id)).status).toBe("open");
    const won = await claimOffer(cmd(b.id, courierActor(COURIER_B)), w.deps(at(2.2)));
    expect(won.code).toBe("claimed");

    const op = await getDonationCard(operatorActor, id, w.deps(at(3)));
    const donor = await getDonationCard({ role: "donor", id: DONOR }, id, w.deps(at(3)));
    expect(op.ok && op.data.assignment).toEqual({ courier_display_name: "Courier B (synthetic, cold transport)", recipient_display_name: "Eastlake Community Pantry (synthetic)" });
    expect(donor.ok && donor.data.assignment).toEqual({ courier_display_name: "Courier B (synthetic, cold transport)", recipient_display_name: "Eastlake Community Pantry (synthetic)" });
    for (const card of [op, donor]) {
      const text = JSON.stringify(card);
      expect(text).not.toContain("Demo Way"); // no street address on any card
      expect(text).not.toContain("Demo Blvd");
      expect(text).not.toContain("example.invalid");
    }
    const joinedWith = await w.db.select().from(offers).where(and(eq(offers.donation_id, id), eq(offers.status, "accepted")));
    expect(joinedWith).toHaveLength(1);
  });
});
