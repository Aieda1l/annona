import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { SHORT_CODE_REGEX, type Deps } from "@/contracts";
import {
  createNextOffers,
  expireDue,
  getDonationCard,
  listDispatchableDonations,
  listPendingSendOffers,
  markOfferSendFailed,
  openOfferForSend,
  recordOfferProviderMessage,
} from "@/core";
import { __setShortCodeRandom } from "@/core/service/dispatch";
import { audit_events, donations, messaging_identities, offers, policy_config, recipients, verification_links } from "@/db/schema";
import {
  COURIER_A,
  COURIER_B,
  COURIER_C,
  DONOR,
  DONOR_PENDING,
  EASTLAKE,
  IDENTITY,
  T0,
  at,
  factsAt,
  insertDonation,
  insertOffer,
  iso,
  makeEligibleDonation,
  makeWorld,
  operatorActor,
  resetWorld,
  type World,
} from "./helpers/world";

// Slice 2(b), part 2: createNextOffers, openOfferForSend, markOfferSendFailed, recordOfferProviderMessage, expireDue
// (S-04, S-05, S-06, S-08, S-16, S-18; CONTRACTS 3.8, 6, 7). PGlite store, test clock.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

let w: World;
beforeAll(async () => {
  w = await makeWorld();
});
afterAll(async () => w.close());
beforeEach(async () => resetWorld(w));
afterEach(() => __setShortCodeRandom(null));

const donationRow = async (id: string) => (await w.db.select().from(donations).where(eq(donations.id, id)))[0]!;
const offersOf = async (id: string) => (await w.db.select().from(offers).where(eq(offers.donation_id, id))).sort((a, b) => a.wave_no - b.wave_no || a.created_at.getTime() - b.created_at.getTime());
const auditTypes = async (id: string) => (await w.db.select().from(audit_events).where(eq(audit_events.donation_id, id))).map((e) => e.type);
async function setPolicy(patch: Record<string, unknown>) {
  const [row] = await w.db.select().from(policy_config).where(eq(policy_config.active, true));
  await w.db.update(policy_config).set({ config: { ...(row!.config as object), ...patch } }).where(eq(policy_config.policy_id, row!.policy_id));
}
const leave = async (identity_id: string) => w.db.update(messaging_identities).set({ status: "opted_out", opted_out_at: T0 }).where(eq(messaging_identities.id, identity_id));

describe("createNextOffers: S-04 (offer), S-05 (unmatched), S-18 (the gate re-run)", () => {
  it("offers the best courier first: one pending_send offer, the donation becomes offered", async () => {
    const id = await makeEligibleDonation(w);
    const r = await createNextOffers({ donation_id: id }, w.deps());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toHaveLength(1);
    const o = r.data[0]!;
    expect(o).toMatchObject({ donation_id: id, recipient_id: EASTLAKE, courier_id: COURIER_A, status: "pending_send", wave_no: 1, provider_mode: "fake", sent_at: null, expires_at: null, delivery_status: "unknown" });
    expect(o.short_code).toMatch(SHORT_CODE_REGEX);
    expect(o.candidate).toMatchObject({ courier_id: COURIER_A, recipient_id: EASTLAKE, rank: 1 });
    expect(await donationRow(id)).toMatchObject({ status: "offered", version: 3 });
    expect(await auditTypes(id)).toEqual(expect.arrayContaining(["matching.completed", "offer.created"]));
  });
  it("a wave of 2 offers two different couriers with different codes, ranked by the earliest drop-off", async () => {
    await setPolicy({ offer_wave_size: 2 });
    const id = await makeEligibleDonation(w);
    const r = await createNextOffers({ donation_id: id }, w.deps());
    expect(r.ok && r.data.map((o) => o.courier_id)).toEqual([COURIER_A, COURIER_B]);
    expect(r.ok && new Set(r.data.map((o) => o.short_code)).size).toBe(2);
    expect(r.ok && r.data.every((o) => o.wave_no === 1)).toBe(true);
  });
  it("the next wave skips couriers already offered this donation and numbers itself wave 2", async () => {
    const id = await makeEligibleDonation(w);
    const first = await createNextOffers({ donation_id: id }, w.deps());
    const firstOffer = first.ok ? first.data[0]! : null;
    await w.db.update(offers).set({ status: "expired", close_reason: "offer_expired" }).where(eq(offers.id, firstOffer!.id));
    await w.db.update(donations).set({ status: "eligible" }).where(eq(donations.id, id));
    const second = await createNextOffers({ donation_id: id }, w.deps());
    expect(second.ok && second.data[0]).toMatchObject({ courier_id: COURIER_B, wave_no: 2 });
  });
  it("is conditional on eligible: a second call, or any other status, creates nothing", async () => {
    const id = await makeEligibleDonation(w);
    await createNextOffers({ donation_id: id }, w.deps());
    expect(await createNextOffers({ donation_id: id }, w.deps())).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
    expect(await offersOf(id)).toHaveLength(1);
    const draft = await insertDonation(w.db, { status: "draft" });
    const review = await insertDonation(w.db, { status: "needs_review" });
    for (const d of [draft, review]) expect(await createNextOffers({ donation_id: d.id }, w.deps())).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
    expect(await createNextOffers({ donation_id: randomUUID() }, w.deps())).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
  it("two simultaneous calls for one donation create one offer between them", async () => {
    const id = await makeEligibleDonation(w);
    const rs = await Promise.all([createNextOffers({ donation_id: id }, w.deps()), createNextOffers({ donation_id: id }, w.deps())]);
    expect(rs.filter((r) => r.ok && r.data.length === 1)).toHaveLength(1);
    expect(await offersOf(id)).toHaveLength(1);
  });
  it("no courier has joined: unmatched with NO_ELIGIBLE_MATCH (a dispatch reason), no offers", async () => {
    await leave(IDENTITY.courier_a);
    await leave(IDENTITY.courier_b);
    const id = await makeEligibleDonation(w);
    const r = await createNextOffers({ donation_id: id }, w.deps());
    expect(r).toEqual({ ok: true, data: [] });
    const row = await donationRow(id);
    expect(row.status).toBe("unmatched");
    expect((row.latest_decision as { reasons: Array<{ code: string; severity: string }> }).reasons).toEqual([expect.objectContaining({ code: "NO_ELIGIBLE_MATCH", severity: "dispatch" })]);
    expect(await auditTypes(id)).toContain("matching.unmatched");
  });
  it("every feasible courier was already offered: unmatched with CANDIDATES_EXHAUSTED", async () => {
    const id = await makeEligibleDonation(w);
    await insertOffer(w.db, id, { courier_id: COURIER_A, status: "expired", close_reason: "offer_expired", responded_at: T0 });
    await insertOffer(w.db, id, { courier_id: COURIER_B, status: "declined", responded_at: T0 });
    await createNextOffers({ donation_id: id }, w.deps());
    const row = await donationRow(id);
    expect(row.status).toBe("unmatched");
    expect((row.latest_decision as { reasons: Array<{ code: string }> }).reasons.map((x) => x.code)).toEqual(["CANDIDATES_EXHAUSTED"]);
  });
  it("a courier who already holds a live offer elsewhere is busy (M-09); so is one with an active assignment", async () => {
    const other = await insertDonation(w.db, { status: "offered" });
    await insertOffer(w.db, other.id, { courier_id: COURIER_A, status: "open" }); // live offer on another donation
    const claimed = await insertDonation(w.db, { status: "claimed", claimed_offer_id: randomUUID(), verified_facts: factsAt() as never });
    await insertOffer(w.db, claimed.id, { courier_id: COURIER_B, status: "accepted", responded_at: T0 }); // active assignment
    const id = await makeEligibleDonation(w);
    await createNextOffers({ donation_id: id }, w.deps());
    expect((await donationRow(id)).status).toBe("unmatched"); // A busy with an offer, B busy with a job, C not cold/joined
  });
  it("an ended assignment (accepted with a close_reason) does not make the courier busy", async () => {
    const claimed = await insertDonation(w.db, { status: "expired", verified_facts: factsAt() as never });
    await insertOffer(w.db, claimed.id, { courier_id: COURIER_A, status: "accepted", close_reason: "pickup_not_collected", responded_at: T0 });
    const id = await makeEligibleDonation(w);
    const r = await createNextOffers({ donation_id: id }, w.deps());
    expect(r.ok && r.data[0]!.courier_id).toBe(COURIER_A);
  });
  it("M-04 nets out servings already promised to the recipient (capacity 44, 20 committed, 24 needed)", async () => {
    const claimed = await insertDonation(w.db, { status: "claimed", claimed_offer_id: randomUUID(), verified_facts: factsAt(T0, { servings: 20 }) as never });
    await insertOffer(w.db, claimed.id, { courier_id: COURIER_C, status: "accepted", responded_at: T0 });
    await w.db.update(recipients).set({ capacity_servings_available: 43 }).where(eq(recipients.id, EASTLAKE));
    const id = await makeEligibleDonation(w);
    await createNextOffers({ donation_id: id }, w.deps());
    expect((await donationRow(id)).status).toBe("unmatched"); // 43 - 20 = 23 < 24
    const id2 = await makeEligibleDonation(w);
    await w.db.update(recipients).set({ capacity_servings_available: 44 }).where(eq(recipients.id, EASTLAKE));
    const r = await createNextOffers({ donation_id: id2 }, w.deps());
    expect(r.ok && r.data).toHaveLength(1); // 44 - 20 = 24: exactly enough
  });
  it("a delivered donation still counts against the recipient; a canceled one does not", async () => {
    const delivered = await insertDonation(w.db, { status: "delivered", verified_facts: factsAt(T0, { servings: 30 }) as never });
    await insertOffer(w.db, delivered.id, { courier_id: COURIER_C, status: "accepted", responded_at: T0 });
    await w.db.update(recipients).set({ capacity_servings_available: 50 }).where(eq(recipients.id, EASTLAKE));
    const blocked = await makeEligibleDonation(w);
    await createNextOffers({ donation_id: blocked }, w.deps());
    expect((await donationRow(blocked)).status).toBe("unmatched"); // 50 - 30 = 20 < 24
  });
  it("only identities of the active provider count: with the real provider active, fake-joined couriers are not matched", async () => {
    const id = await makeEligibleDonation(w);
    const photonDeps = { ...w.deps(), messaging: { mode: "real" } } as unknown as Deps;
    await createNextOffers({ donation_id: id }, photonDeps);
    expect((await donationRow(id)).status).toBe("unmatched");
  });
  it("S-18: the gate re-runs with the current time; a pickup that is now too close is rejected and no offer is made", async () => {
    const id = await makeEligibleDonation(w); // pickup at +120
    const r = await createNextOffers({ donation_id: id }, w.deps(at(110))); // 10 min left < 15 min lead
    expect(r).toEqual({ ok: true, data: [] });
    const row = await donationRow(id);
    expect(row.status).toBe("rejected");
    expect((row.latest_decision as { reasons: Array<{ code: string }> }).reasons.map((x) => x.code)).toContain("PICKUP_WINDOW_TOO_SHORT");
    expect(await offersOf(id)).toEqual([]);
  });
  it("S-18: a donor who is no longer approved sends the donation to review (nothing is offered)", async () => {
    const id = await makeEligibleDonation(w);
    const { donors } = await import("@/db/schema");
    await w.db.update(donors).set({ approval_status: "pending" }).where(eq(donors.id, DONOR));
    await createNextOffers({ donation_id: id }, w.deps());
    expect(await donationRow(id)).toMatchObject({ status: "needs_review" });
    expect(await offersOf(id)).toEqual([]);
    void DONOR_PENDING;
  });
  it("short codes: a collision retries with a fresh code; a code that can never be free leaves the donation eligible", async () => {
    const taken = await insertDonation(w.db, { status: "expired" });
    await insertOffer(w.db, taken.id, { courier_id: COURIER_C, status: "expired", close_reason: "offer_expired", short_code: "AAAA", responded_at: T0 });
    const id = await makeEligibleDonation(w);
    const calls = [0, 0, 0, 0, 1, 1, 1, 1]; // "AAAA" is taken, the next draw "CCCC" is free
    let i = 0;
    __setShortCodeRandom(() => calls[i++ % calls.length]!);
    const r = await createNextOffers({ donation_id: id }, w.deps());
    expect(r.ok && r.data[0]!.short_code).toBe("CCCC");
    // Only "AAAA" is ever drawn: no free code, so no offer is made and the donation stays eligible for the next tick.
    const id2 = await makeEligibleDonation(w);
    __setShortCodeRandom(() => 0);
    const stuck = await createNextOffers({ donation_id: id2 }, w.deps());
    expect(stuck).toEqual({ ok: true, data: [] });
    expect((await donationRow(id2)).status).toBe("eligible");
  });
  it("the audit trail holds no handle, address or message text", async () => {
    const id = await makeEligibleDonation(w);
    await createNextOffers({ donation_id: id }, w.deps());
    const text = JSON.stringify(await w.db.select().from(audit_events).where(eq(audit_events.donation_id, id)));
    expect(text).not.toContain("example.invalid");
    expect(text).not.toContain("100 Demo Way");
  });
});

describe("openOfferForSend (pending_send -> open, committed before any send)", () => {
  async function pending() {
    const id = await makeEligibleDonation(w);
    const r = await createNextOffers({ donation_id: id }, w.deps());
    return { id, offer: r.ok ? r.data[0]! : (undefined as never) };
  }
  it("opens the offer with sent_at, a deadline, and returns the identity and a message view with no address, instructions or handle", async () => {
    const { id, offer } = await pending();
    const r = await openOfferForSend({ offer_id: offer.id }, w.deps(at(1)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.offer).toMatchObject({ status: "open", sent_at: at(1).toISOString(), expires_at: at(2).toISOString() }); // 60 s response window
    expect(r.data.identity).toMatchObject({ id: IDENTITY.courier_a, status: "joined", provider: "fake" });
    expect(r.data.message_view).toEqual({
      short_code: offer.short_code, dish_name: "Assorted deli sandwiches and wraps", servings: 24, allergens_present: ["milk", "eggs", "wheat"],
      cross_contact_status: "declared", cross_contact_allergens: [], handling_mode: "refrigerated",
      recipient_display_name: "Eastlake Community Pantry (synthetic)", pickup_area_label: "Seattle Center area", expires_at: at(2).toISOString(), demo_mode: true,
    });
    const view = JSON.stringify(r.data.message_view);
    for (const secret of ["Demo Way", "Rear loading door", "example.invalid", "address"]) expect(view).not.toContain(secret);
    expect(await auditTypes(id)).toContain("offer.opened");
  });
  it("the deadline is the earlier of the response window and (pickup - eta): an offer opened late is cut to the pickup time", async () => {
    await setPolicy({ response_window_seconds: 600 }); // 10 minutes; matching needs window + eta before pickup, which holds at T0
    const { offer } = await pending();
    const r = await openOfferForSend({ offer_id: offer.id }, w.deps(at(112))); // sent 112 min in; window would end at +122, pickup is +120
    const expected = at(120).getTime() - offer.candidate.eta_to_pickup_minutes * 60_000;
    expect(r.ok && Date.parse(r.data.offer.expires_at!)).toBe(expected);
    expect(expected).toBeLessThan(at(122).getTime());
  });
  it("opening twice never opens or sends twice: the second call is a conflict and changes nothing", async () => {
    const { offer } = await pending();
    expect((await openOfferForSend({ offer_id: offer.id }, w.deps())).ok).toBe(true);
    const again = await openOfferForSend({ offer_id: offer.id }, w.deps(at(0.2)));
    expect(again).toMatchObject({ ok: false, error: { code: "CONFLICT", details: { status: "open" } } });
    expect((await w.db.select().from(offers).where(eq(offers.id, offer.id)))[0]!.sent_at?.toISOString()).toBe(T0.toISOString());
  });
  it("two simultaneous opens: exactly one succeeds", async () => {
    const { offer } = await pending();
    const rs = await Promise.all([openOfferForSend({ offer_id: offer.id }, w.deps()), openOfferForSend({ offer_id: offer.id }, w.deps())]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
  });
  it("a courier who has not joined fails the offer with courier_not_joined, and the donation goes back to eligible", async () => {
    const { id, offer } = await pending();
    await leave(IDENTITY.courier_a);
    const r = await openOfferForSend({ offer_id: offer.id }, w.deps());
    expect(r).toMatchObject({ ok: false, error: { details: { reason: "courier_not_joined", offer_id: offer.id } } });
    expect((await offersOf(id))[0]).toMatchObject({ status: "send_failed", close_reason: "courier_not_joined" });
    expect((await donationRow(id)).status).toBe("eligible"); // S-06: the next tick offers the next courier
  });
  it("if the donation is no longer offered the offer is canceled, never opened", async () => {
    const { id, offer } = await pending();
    await w.db.update(donations).set({ status: "canceled" }).where(eq(donations.id, id));
    const r = await openOfferForSend({ offer_id: offer.id }, w.deps());
    expect(r).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
    expect((await offersOf(id))[0]).toMatchObject({ status: "canceled", close_reason: "donation_unavailable" });
  });
  it("with no time left before the pickup the offer expires instead of opening", async () => {
    const { id, offer } = await pending();
    const r = await openOfferForSend({ offer_id: offer.id }, w.deps(at(119))); // pickup at +120, eta >= 1 minute
    expect(r).toMatchObject({ ok: false, error: { details: { reason: "no_time_left" } } });
    expect((await offersOf(id))[0]).toMatchObject({ status: "expired", close_reason: "cutoff_reached" });
  });
  it("an unknown offer is not found", async () => {
    expect(await openOfferForSend({ offer_id: randomUUID() }, w.deps())).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

describe("markOfferSendFailed and recordOfferProviderMessage", () => {
  async function open() {
    const id = await makeEligibleDonation(w);
    const created = await createNextOffers({ donation_id: id }, w.deps());
    const offer = created.ok ? created.data[0]! : (undefined as never);
    await openOfferForSend({ offer_id: offer.id }, w.deps());
    return { id, offer };
  }
  it("open -> send_failed with a reason; the donation returns to eligible for the next courier (S-06)", async () => {
    const { id, offer } = await open();
    const r = await markOfferSendFailed({ offer_id: offer.id, reason: "RATE_LIMITED" }, w.deps(at(0.1)));
    expect(r).toMatchObject({ ok: true, data: { status: "send_failed", close_reason: "provider_send_failed" } });
    expect((await donationRow(id)).status).toBe("eligible");
    const ev = (await w.db.select().from(audit_events).where(eq(audit_events.offer_id, offer.id))).find((e) => e.type === "offer.send_failed")!;
    expect(ev.data).toEqual({ reason: "RATE_LIMITED" });
  });
  it("is idempotent, and a reason that could carry personal text is replaced by a generic one", async () => {
    const { offer } = await open();
    await markOfferSendFailed({ offer_id: offer.id, reason: "call +1 206 555 0100" }, w.deps());
    expect((await markOfferSendFailed({ offer_id: offer.id, reason: "x" }, w.deps())).ok).toBe(true);
    const evs = (await w.db.select().from(audit_events).where(eq(audit_events.offer_id, offer.id))).filter((e) => e.type === "offer.send_failed");
    expect(evs).toHaveLength(1);
    expect(JSON.stringify(evs[0]!.data)).not.toContain("555");
  });
  it("a failure report for an offer the courier already answered changes nothing", async () => {
    const { id, offer } = await open();
    await w.db.update(offers).set({ status: "accepted", responded_at: T0 }).where(eq(offers.id, offer.id));
    expect(await markOfferSendFailed({ offer_id: offer.id, reason: "X" }, w.deps())).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
    expect((await offersOf(id))[0]!.status).toBe("accepted");
    expect(await markOfferSendFailed({ offer_id: randomUUID(), reason: "X" }, w.deps())).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
  it("with another live offer in the wave the donation stays offered", async () => {
    await setPolicy({ offer_wave_size: 2 });
    const id = await makeEligibleDonation(w);
    const created = await createNextOffers({ donation_id: id }, w.deps());
    const [a, b] = created.ok ? created.data : [];
    await openOfferForSend({ offer_id: a!.id }, w.deps());
    await openOfferForSend({ offer_id: b!.id }, w.deps());
    await markOfferSendFailed({ offer_id: a!.id, reason: "X" }, w.deps());
    expect((await donationRow(id)).status).toBe("offered");
    await markOfferSendFailed({ offer_id: b!.id, reason: "X" }, w.deps());
    expect((await donationRow(id)).status).toBe("eligible");
  });
  it("at or after the cutoff the donation is not released (expireDue expires it instead)", async () => {
    const { id, offer } = await open();
    await markOfferSendFailed({ offer_id: offer.id, reason: "X" }, w.deps(at(125)));
    expect((await donationRow(id)).status).toBe("offered");
    const swept = await expireDue(w.deps(at(125)));
    expect(swept.expired_donation_ids).toEqual([id]);
  });
  it("records Photon's message id once; a different id is a conflict", async () => {
    const { offer } = await open();
    expect(await recordOfferProviderMessage({ offer_id: offer.id, provider_message_id: "pm-1" }, w.deps())).toMatchObject({ ok: true, data: { provider_message_id: "pm-1" } });
    expect((await recordOfferProviderMessage({ offer_id: offer.id, provider_message_id: "pm-1" }, w.deps())).ok).toBe(true);
    expect(await recordOfferProviderMessage({ offer_id: offer.id, provider_message_id: "pm-2" }, w.deps())).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await recordOfferProviderMessage({ offer_id: offer.id, provider_message_id: "" }, w.deps())).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(await recordOfferProviderMessage({ offer_id: randomUUID(), provider_message_id: "x" }, w.deps())).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

describe("expireDue: no response (S-06), cutoff reached (S-08), no-show (S-16)", () => {
  async function openOne(opts: { from?: Date } = {}) {
    const id = await makeEligibleDonation(w, { from: opts.from });
    const created = await createNextOffers({ donation_id: id }, w.deps(opts.from));
    const offer = created.ok ? created.data[0]! : (undefined as never);
    await openOfferForSend({ offer_id: offer.id }, w.deps(opts.from));
    return { id, offer };
  }
  it("an unanswered offer expires at its deadline (not before) and the donation is ready for the next courier", async () => {
    const { id, offer } = await openOne(); // opens at T0 with a 60 s window
    expect(await expireDue(w.deps(new Date(T0.getTime() + 59_999)))).toEqual({ expired_offer_ids: [], expired_donation_ids: [], dispatchable_donation_ids: [] });
    const swept = await expireDue(w.deps(new Date(T0.getTime() + 60_000)));
    expect(swept).toEqual({ expired_offer_ids: [offer.id], expired_donation_ids: [], dispatchable_donation_ids: [id] });
    expect((await offersOf(id))[0]).toMatchObject({ status: "expired", close_reason: "offer_expired" });
    expect((await donationRow(id)).status).toBe("eligible");
    expect(await listDispatchableDonations(w.deps())).toEqual([{ donation_id: id }]);
  });
  it("a second sweep finds nothing to do", async () => {
    await openOne();
    const t = w.deps(at(2));
    await expireDue(t);
    expect(await expireDue(t)).toEqual({ expired_offer_ids: [], expired_donation_ids: [], dispatchable_donation_ids: [] });
  });
  it("then the next courier is offered, and the same sweep cycle works again (no response -> next candidate)", async () => {
    const { id } = await openOne();
    await expireDue(w.deps(at(2)));
    const next = await createNextOffers({ donation_id: id }, w.deps(at(2)));
    expect(next.ok && next.data[0]).toMatchObject({ courier_id: COURIER_B, wave_no: 2 });
  });
  it("in a wave of 2 only the expired offer goes; the donation stays offered while the other is live", async () => {
    await setPolicy({ offer_wave_size: 2 });
    const id = await makeEligibleDonation(w);
    const created = await createNextOffers({ donation_id: id }, w.deps());
    const [a, b] = created.ok ? created.data : [];
    await openOfferForSend({ offer_id: a!.id }, w.deps());
    await openOfferForSend({ offer_id: b!.id }, w.deps(at(0.5)));
    const swept = await expireDue(w.deps(at(1)));
    expect(swept.expired_offer_ids).toEqual([a!.id]);
    expect(swept.dispatchable_donation_ids).toEqual([]);
    expect((await donationRow(id)).status).toBe("offered");
  });
  it("S-08: at the cutoff the donation expires, its live offers expire with cutoff_reached, its links are revoked", async () => {
    const { id, offer } = await openOne();
    const link = { id: randomUUID(), donation_id: id, donor_id: DONOR, token_hash: "a".repeat(64), issued_at: T0, expires_at: at(30) };
    await w.db.insert(verification_links).values(link);
    const swept = await expireDue(w.deps(at(120))); // cutoff = pickup at +120, "at" counts as reached
    expect(swept.expired_donation_ids).toEqual([id]);
    expect(swept.expired_offer_ids).toContain(offer.id);
    expect(await donationRow(id)).toMatchObject({ status: "expired" });
    const row = await donationRow(id);
    expect((row.latest_decision as { reasons: Array<{ code: string; severity: string }> }).reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: "CUTOFF_REACHED", severity: "reject" })]));
    expect((await offersOf(id))[0]).toMatchObject({ status: "expired", close_reason: "cutoff_reached" });
    expect((await w.db.select().from(verification_links).where(eq(verification_links.id, link.id)))[0]!.revoked_at).not.toBeNull();
    expect(await auditTypes(id)).toContain("donation.expired");
    expect(await expireDue(w.deps(at(121)))).toEqual({ expired_offer_ids: [], expired_donation_ids: [], dispatchable_donation_ids: [] });
  });
  it("S-08 covers eligible, unmatched and needs_review donations too, but never a collected one (S-17), a draft or a finished one", async () => {
    const mk = (status: string, extra: Record<string, unknown> = {}) => insertDonation(w.db, { status, effective_cutoff_at: at(10), verified_facts: factsAt() as never, ...extra } as never);
    const eligible = await mk("eligible");
    const unmatched = await mk("unmatched");
    const review = await mk("needs_review");
    const collectedReview = await mk("needs_review", { collected_at: at(5) });
    const draft = await insertDonation(w.db, { status: "draft" });
    const delivered = await mk("delivered");
    const rejected = await mk("rejected");
    const swept = await expireDue(w.deps(at(11)));
    expect(new Set(swept.expired_donation_ids)).toEqual(new Set([eligible.id, unmatched.id, review.id]));
    for (const d of [collectedReview, draft, delivered, rejected]) expect((await donationRow(d.id)).status).toBe(d.status);
  });
  it("a missing stored cutoff falls back to the pickup time from the facts (D-038); with neither, it is due", async () => {
    const fromFacts = await insertDonation(w.db, { status: "eligible", effective_cutoff_at: null, verified_facts: factsAt(T0, { donor_pickup_by: iso(30) }) as never });
    const noFacts = await insertDonation(w.db, { status: "eligible", effective_cutoff_at: null, verified_facts: null });
    const early = await expireDue(w.deps(at(10)));
    expect(early.expired_donation_ids).toEqual([noFacts.id]); // no cutoff can be resolved: due now
    const later = await expireDue(w.deps(at(31)));
    expect(later.expired_donation_ids).toEqual([fromFacts.id]);
  });
  it("S-16: a claimed donation nobody collected expires at the cutoff and the assignment is closed as pickup_not_collected", async () => {
    const d = await insertDonation(w.db, { status: "claimed", effective_cutoff_at: at(30), claimed_offer_id: randomUUID(), verified_facts: factsAt() as never });
    const accepted = await insertOffer(w.db, d.id, { status: "accepted", responded_at: T0 });
    expect((await expireDue(w.deps(at(29)))).expired_donation_ids).toEqual([]);
    const swept = await expireDue(w.deps(at(30)));
    expect(swept.expired_donation_ids).toEqual([d.id]);
    expect(await donationRow(d.id)).toMatchObject({ status: "expired" });
    expect((await w.db.select().from(offers).where(eq(offers.id, accepted.id)))[0]).toMatchObject({ status: "accepted", close_reason: "pickup_not_collected" });
    expect(((await donationRow(d.id)).latest_decision as { reasons: Array<{ code: string }> }).reasons.map((r) => r.code)).toContain("PICKUP_NOT_COLLECTED");
  });
  it("a claimed donation that was collected is left alone, whatever the time", async () => {
    const d = await insertDonation(w.db, { status: "claimed", effective_cutoff_at: at(30), claimed_offer_id: randomUUID(), collected_at: at(20), verified_facts: factsAt() as never });
    await insertOffer(w.db, d.id, { status: "accepted", responded_at: T0 });
    expect((await expireDue(w.deps(at(500)))).expired_donation_ids).toEqual([]);
  });
});

describe("the lists tick drives", () => {
  it("listPendingSendOffers returns pending_send offers oldest first; listDispatchableDonations returns eligible donations", async () => {
    await setPolicy({ offer_wave_size: 2 });
    const a = await makeEligibleDonation(w);
    const b = await makeEligibleDonation(w);
    expect((await listDispatchableDonations(w.deps())).map((x) => x.donation_id).sort()).toEqual([a, b].sort());
    const created = await createNextOffers({ donation_id: a }, w.deps());
    const pendingIds = (await listPendingSendOffers(w.deps())).map((o) => o.id);
    expect(pendingIds).toEqual(created.ok ? created.data.map((o) => o.id) : []);
    await openOfferForSend({ offer_id: pendingIds[0]! }, w.deps());
    expect((await listPendingSendOffers(w.deps())).map((o) => o.id)).toEqual(pendingIds.slice(1));
    expect((await listDispatchableDonations(w.deps())).map((x) => x.donation_id)).toEqual([b]);
  });
});

describe("what the operator and the donor see after dispatch (cards)", () => {
  it("the donor never sees the courier, the short code or the provider message id before a claim; the operator does", async () => {
    const id = await makeEligibleDonation(w);
    const created = await createNextOffers({ donation_id: id }, w.deps());
    const offer = created.ok ? created.data[0]! : (undefined as never);
    await openOfferForSend({ offer_id: offer.id }, w.deps());
    await recordOfferProviderMessage({ offer_id: offer.id, provider_message_id: "pm-secret-1" }, w.deps());
    const donor = await getDonationCard({ role: "donor", id: DONOR }, id, w.deps());
    const op = await getDonationCard(operatorActor, id, w.deps());
    const donorText = JSON.stringify(donor);
    expect(donorText).not.toContain(offer.short_code);
    expect(donorText).not.toContain("pm-secret-1");
    expect(donorText).not.toContain("Courier A");
    expect(donor.ok && donor.data.active_offers).toHaveLength(1);
    expect(donor.ok && donor.data.active_offers[0]).toMatchObject({ status: "open" });
    const opText = JSON.stringify(op);
    expect(opText).toContain(offer.short_code);
    expect(opText).toContain("pm-secret-1");
    expect(opText).toContain("Courier A (synthetic, cold transport)");
    void COURIER_B;
  });
});
