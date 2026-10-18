import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DONATION_STATUSES, DashboardSnapshot, DonationCard, type Actor, type ClaimCommand, type MessagingGateway, type VisionProvider } from "@/contracts";
import {
  claimOffer,
  createNextOffers,
  getDashboardSnapshot,
  getDonationCard,
  getSystemStatus,
  openOfferForSend,
  operatorAction,
  optOutIdentity,
  recordHandoff,
  recordInboundMessage,
  resetDemo,
  saveInboundResult,
  setLastTick,
} from "@/core";
import { DASHBOARD_CARD_LIMIT } from "@/core/service/dashboard";
import { writeAudit } from "@/core/service/audit";
import { audit_events, donation_images, donations, donors, messaging_identities, offers, policy_config, recipients, system_status, verification_links } from "@/db/schema";
import {
  COURIER_A,
  COURIER_B,
  DONOR,
  EASTLAKE,
  IDENTITY,
  OPERATOR,
  T0,
  YOUTH,
  at,
  courierActor,
  donorActor,
  factsAt,
  insertDonation,
  iso,
  makeEligibleDonation,
  makeWorld,
  operatorActor,
  resetWorld,
  type World,
} from "./helpers/world";

// Slice 2(c): system status, the operator dashboard, simulated handoff (S-09, S-10), operator actions (S-11..S-14,
// S-18) and the demo reset (CONTRACTS sections 3.13, 4.1, 9.3, 11). The HTTP handlers are in service-http.test.ts.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

let w: World;
beforeAll(async () => {
  w = await makeWorld();
});
afterAll(async () => w.close());
beforeEach(async () => {
  await resetWorld(w);
  await w.db.delete(system_status);
});
afterEach(() => vi.unstubAllEnvs());

const vision = { mode: "fake", model: null, status: "ok", analyzeFoodImage: async () => ({ ok: false }) } as unknown as VisionProvider;
const messaging = { mode: "fake", channel: "simulated", status: "ok", send: async () => ({ ok: false }) } as unknown as MessagingGateway;
const deps = (t: Date = T0) => ({ ...w.deps(t), vision, messaging });

const recipientActor = (id: string = EASTLAKE): Actor => ({ role: "recipient", id });
const donationRow = async (id: string) => (await w.db.select().from(donations).where(eq(donations.id, id)))[0]!;
const eventsOf = async (donation_id: string, type?: string) =>
  (await w.db.select().from(audit_events).where(eq(audit_events.donation_id, donation_id))).filter((e) => !type || e.type === type);
const cmd = (offer_id: string, actor: Actor = courierActor(COURIER_A)): ClaimCommand => ({ offer_ref: { offer_id }, actor, source: "messaging", source_event_id: null });

/** An eligible donation dispatched and opened at T0; returns the donation and its open offers. */
async function offered(facts?: Record<string, unknown>) {
  const id = await makeEligibleDonation(w, { facts });
  const created = await createNextOffers({ donation_id: id }, w.deps());
  if (!created.ok) throw new Error("no offers");
  const opened = [];
  for (const o of created.data) {
    const r = await openOfferForSend({ offer_id: o.id }, w.deps());
    if (!r.ok) throw new Error(`open failed ${r.error.code}`);
    opened.push(r.data.offer);
  }
  return { id, offers: opened };
}

/** A donation claimed by courier A (recipient Eastlake) half a minute after T0. */
async function claimed(facts?: Record<string, unknown>) {
  const { id, offers: [o] } = await offered(facts);
  const r = await claimOffer(cmd(o!.id), w.deps(at(0.5)));
  if (r.code !== "claimed") throw new Error(`claim failed ${r.code}`);
  return { id, offer_id: o!.id };
}

const needsReview = (over: Partial<typeof donations.$inferInsert> = {}) =>
  insertDonation(w.db, { status: "needs_review", verified_facts: factsAt(), effective_cutoff_at: at(120), ...over });

describe("setLastTick / getSystemStatus", () => {
  it("reports no tick yet, the actual store driver and the active policy version", async () => {
    expect(await getSystemStatus(w.deps())).toEqual({ last_tick_at: null, store: "pglite", policy_version: "2026-10-17.1" });
  });
  it("records the tick time and never moves it backwards", async () => {
    await setLastTick(iso(5), w.deps());
    expect((await getSystemStatus(w.deps())).last_tick_at).toBe(iso(5));
    await setLastTick(iso(3), w.deps());
    expect((await getSystemStatus(w.deps())).last_tick_at).toBe(iso(5));
    await setLastTick(iso(6), w.deps());
    expect((await getSystemStatus(w.deps())).last_tick_at).toBe(iso(6));
  });
  it("refuses a value that is not a UTC timestamp", async () => {
    for (const bad of ["yesterday", "", "2026-10-17", 5 as unknown as string]) await expect(setLastTick(bad, w.deps())).rejects.toThrow();
    expect((await getSystemStatus(w.deps())).last_tick_at).toBeNull();
  });
  it("says 'unavailable' instead of inventing a policy version", async () => {
    await w.db.update(policy_config).set({ active: false });
    expect((await getSystemStatus(w.deps())).policy_version).toBe("unavailable");
  });
});

describe("getDashboardSnapshot", () => {
  it("is operator only", async () => {
    for (const actor of [donorActor(), courierActor(), recipientActor(), { role: "system", id: null } as Actor, undefined as unknown as Actor]) {
      expect(await getDashboardSnapshot(actor, deps())).toMatchObject({ ok: false, error: { code: "NOT_AUTHORIZED" } });
    }
  });
  it("matches the contract: every status counted (zeros included), operator cards, modes from the providers, the last tick", async () => {
    const id = await makeEligibleDonation(w);
    await needsReview();
    await setLastTick(iso(1), w.deps());
    const r = await getDashboardSnapshot(operatorActor, deps(at(2)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(DashboardSnapshot.safeParse(r.data).success).toBe(true);
    expect(r.data.generated_at).toBe(iso(2));
    expect(r.data.counts_by_status).toMatchObject({ eligible: 1, needs_review: 1, draft: 0, claimed: 0, expired: 0, unmatched: 0 });
    expect(Object.keys(r.data.counts_by_status).sort()).toEqual([...DONATION_STATUSES].sort());
    expect(r.data.donations.map((d) => d.id)).toContain(id);
    expect(r.data.modes).toMatchObject({ vision: { mode: "fake", provider: "fake" }, messaging: { mode: "fake", channel: "simulated" }, store: "pglite", last_tick_at: iso(1), policy_version: "2026-10-17.1" });
  });
  it("lists every messaging identity with its JOIN status and only a masked handle", async () => {
    await optOutIdentity({ identity_id: IDENTITY.courier_b }, w.deps());
    const r = await getDashboardSnapshot(operatorActor, deps());
    if (!r.ok) throw new Error("dashboard failed");
    const handles = (await w.db.select({ handle: messaging_identities.handle }).from(messaging_identities)).map((h) => h.handle);
    const json = JSON.stringify(r.data);
    for (const h of handles) expect(json).not.toContain(h);
    expect(r.data.identities.find((i) => i.identity_id === IDENTITY.courier_b)).toMatchObject({ actor_role: "courier", status: "opted_out", handle_masked: expect.stringMatching(/^\*\*\*.{4}$/) });
    expect(r.data.identities.find((i) => i.identity_id === IDENTITY.donor)).toMatchObject({ actor_role: "donor", actor_display_name: "Rainier Catering (synthetic)", status: "joined" });
  });
  it(`shows at most ${DASHBOARD_CARD_LIMIT} cards, newest first, but counts every donation`, async () => {
    for (let i = 0; i <= DASHBOARD_CARD_LIMIT; i++) await insertDonation(w.db, { status: "draft", updated_at: at(i) });
    const r = await getDashboardSnapshot(operatorActor, deps());
    if (!r.ok) throw new Error("dashboard failed");
    expect(r.data.counts_by_status.draft).toBe(DASHBOARD_CARD_LIMIT + 1);
    expect(r.data.donations).toHaveLength(DASHBOARD_CARD_LIMIT);
    expect(r.data.donations[0]!.version).toBeGreaterThanOrEqual(1);
    const firstRow = await donationRow(r.data.donations[0]!.id);
    expect(firstRow.updated_at.toISOString()).toBe(iso(DASHBOARD_CARD_LIMIT));
  });
});

describe("the dashboard builds cards in batches without changing them", () => {
  it("every dashboard card equals the single-card read model, including the newest-30 timeline limit", async () => {
    const a = await claimed();
    const b = await makeEligibleDonation(w, {});
    const c = (await insertDonation(w.db, { status: "needs_review", verified_facts: factsAt() })).id;
    for (let i = 0; i < 35; i++) {
      await writeAudit(w.db, { at: at(i / 10), type: "operator.action", actor: { role: "operator", id: OPERATOR }, donation_id: a.id, data: { i } });
    }
    await recordHandoff({ actor: courierActor(), donation_id: a.id, step: "collected", simulated: true }, w.deps(at(10)));
    await recordHandoff({ actor: recipientActor(), donation_id: a.id, step: "delivered", simulated: true }, w.deps(at(30)));
    const snap = await getDashboardSnapshot(operatorActor, deps(at(40)));
    if (!snap.ok) throw new Error("no snapshot");
    expect(snap.data.donations.map((d) => d.id).sort()).toEqual([a.id, b, c].sort());
    for (const card of snap.data.donations) {
      const single = await getDonationCard(operatorActor, card.id, w.deps(at(40)));
      expect(single, card.id).toEqual({ ok: true, data: card });
    }
    const delivered = snap.data.donations.find((d) => d.id === a.id)!;
    expect(delivered.timeline).toHaveLength(30);
    expect(delivered.handoff).toMatchObject({ collected_at: iso(10), delivered_at: iso(30) });
    expect(delivered.timeline.at(-1)!.type).toBe("handoff.recorded");
  });
});

describe("recordHandoff (S-09 collected, S-10 delivered; always simulated)", () => {
  it("the claiming courier records collection; the assigned recipient records delivery", async () => {
    const { id, offer_id } = await claimed();
    const c = await recordHandoff({ actor: courierActor(), donation_id: id, step: "collected", simulated: true }, w.deps(at(10)));
    expect(c).toMatchObject({ ok: true, data: { status: "collected", handoff: { collected_at: iso(10), delivered_at: null, simulated: true } } });
    const d = await recordHandoff({ actor: recipientActor(), donation_id: id, step: "delivered", simulated: true }, w.deps(at(30)));
    expect(d).toMatchObject({ ok: true, data: { status: "delivered", handoff: { collected_at: iso(10), delivered_at: iso(30) } } });
    if (d.ok) expect(DonationCard.safeParse(d.data).success).toBe(true);
    const events = await eventsOf(id, "handoff.recorded");
    expect(events.map((e) => e.data)).toEqual([
      { step: "collected", simulated: true, transition: "S-09" },
      { step: "delivered", simulated: true, transition: "S-10" },
    ]);
    expect(events.every((e) => e.offer_id === offer_id)).toBe(true);
  });
  it("a courier or recipient gets the reduced card (no offer ids or provider message ids); an operator gets the full one", async () => {
    const { id, offer_id } = await claimed();
    const c = await recordHandoff({ actor: courierActor(), donation_id: id, step: "collected", simulated: true }, w.deps(at(10)));
    if (!c.ok) throw new Error("collect failed");
    expect(JSON.stringify(c.data)).not.toContain(offer_id);
    const d = await recordHandoff({ actor: operatorActor, donation_id: id, step: "delivered", simulated: true }, w.deps(at(20)));
    if (!d.ok) throw new Error("deliver failed");
    expect(d.data.active_offers.map((o) => o.id)).toContain(offer_id);
  });
  it("only the right person may record each step; refusals write nothing", async () => {
    const { id } = await claimed();
    const before = await donationRow(id);
    const refused: [Actor, "collected" | "delivered"][] = [
      [courierActor(COURIER_B), "collected"],
      [recipientActor(), "collected"],
      [courierActor(), "delivered"],
      [recipientActor(YOUTH), "delivered"],
      [donorActor(), "collected"],
      [{ role: "system", id: null }, "collected"],
      [{ role: "courier", id: null }, "collected"],
    ];
    for (const [actor, step] of refused) {
      expect(await recordHandoff({ actor, donation_id: id, step, simulated: true }, w.deps(at(10))), `${actor.role} ${step}`).toMatchObject({ ok: false, error: { code: "NOT_AUTHORIZED" } });
    }
    expect(await donationRow(id)).toEqual(before);
    expect(await eventsOf(id, "handoff.recorded")).toHaveLength(0);
  });
  it("refuses a handoff that is not simulated, an unknown step and an unknown donation", async () => {
    const { id } = await claimed();
    expect(await recordHandoff({ actor: courierActor(), donation_id: id, step: "collected", simulated: false as true }, w.deps(at(10)))).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(await recordHandoff({ actor: courierActor(), donation_id: id, step: "picked_up" as never, simulated: true }, w.deps(at(10)))).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(await recordHandoff({ actor: operatorActor, donation_id: randomUUID(), step: "collected", simulated: true }, w.deps(at(10)))).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await recordHandoff({ actor: operatorActor, donation_id: "nope", step: "collected", simulated: true }, w.deps(at(10)))).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
  it("collection at or after the effective cutoff is INVALID_TRANSITION", async () => {
    const { id } = await claimed();
    expect(await recordHandoff({ actor: courierActor(), donation_id: id, step: "collected", simulated: true }, w.deps(at(120)))).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
    expect((await donationRow(id)).status).toBe("claimed");
  });
  it("F2: with discard_by before donor_pickup_by, collection between the two is refused", async () => {
    const { id } = await claimed({ discard_by: iso(90) });
    expect((await donationRow(id)).effective_cutoff_at?.toISOString()).toBe(iso(90));
    expect(await recordHandoff({ actor: courierActor(), donation_id: id, step: "collected", simulated: true }, w.deps(at(100)))).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
  });
  it("delivery after discard_by is INVALID_TRANSITION (the operator must cancel)", async () => {
    const { id } = await claimed();
    await recordHandoff({ actor: courierActor(), donation_id: id, step: "collected", simulated: true }, w.deps(at(10)));
    expect(await recordHandoff({ actor: recipientActor(), donation_id: id, step: "delivered", simulated: true }, w.deps(at(360)))).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
    expect((await donationRow(id)).status).toBe("collected");
  });
  it("G-01 is re-checked at collection: a donor suspended after the claim blocks it", async () => {
    const { id } = await claimed();
    await w.db.update(donors).set({ approval_status: "suspended" }).where(eq(donors.id, DONOR));
    expect(await recordHandoff({ actor: courierActor(), donation_id: id, step: "collected", simulated: true }, w.deps(at(10)))).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
  });
  it("steps run once and in order: no second collection, no delivery before collection", async () => {
    const { id } = await claimed();
    expect(await recordHandoff({ actor: operatorActor, donation_id: id, step: "delivered", simulated: true }, w.deps(at(5)))).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
    await recordHandoff({ actor: courierActor(), donation_id: id, step: "collected", simulated: true }, w.deps(at(10)));
    // A repeat of the same step is a success without a second write (see the next test); a different person's repeat is not.
    expect(await recordHandoff({ actor: courierActor(COURIER_B), donation_id: id, step: "collected", simulated: true }, w.deps(at(11)))).toMatchObject({ ok: false, error: { code: "NOT_AUTHORIZED" } });
    expect(await recordHandoff({ actor: operatorActor, donation_id: id, step: "collected", simulated: true }, w.deps(at(11)))).toMatchObject({ ok: true, data: { status: "collected" } });
    await recordHandoff({ actor: recipientActor(), donation_id: id, step: "delivered", simulated: true }, w.deps(at(30)));
    // Once delivered, collection can no longer be recorded as a new step.
    expect(await recordHandoff({ actor: operatorActor, donation_id: id, step: "collected", simulated: true }, w.deps(at(31)))).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
  });
  it("a repeated step by the same person succeeds without a second write or audit row (a lost response is not a failure)", async () => {
    const { id } = await claimed();
    const first = await recordHandoff({ actor: courierActor(), donation_id: id, step: "collected", simulated: true }, w.deps(at(10)));
    const before = await donationRow(id);
    const events = (await eventsOf(id, "handoff.recorded")).length;
    const again = await recordHandoff({ actor: courierActor(), donation_id: id, step: "collected", simulated: true }, w.deps(at(15)));
    expect(again).toEqual(first);
    expect(await donationRow(id)).toEqual(before);
    expect(await eventsOf(id, "handoff.recorded")).toHaveLength(events);
  });
  it("a courier or recipient gets no photo, AI guess, verified facts, decision, offers or timeline; the operator still does", async () => {
    const { id } = await claimed();
    const c = await recordHandoff({ actor: courierActor(), donation_id: id, step: "collected", simulated: true }, w.deps(at(10)));
    if (!c.ok) throw new Error("collect failed");
    expect(DonationCard.safeParse(c.data).success).toBe(true);
    expect(c.data).toMatchObject({ image_url: null, ai_suggestion: null, verified_facts: null, decision: null, edited_from_ai: [], active_offers: [], offer_history: [], timeline: [] });
    expect(c.data.assignment).not.toBeNull();
    expect(c.data.handoff.collected_at).toBe(iso(10));
    const full = await getDonationCard(operatorActor, id, w.deps(at(11)));
    expect(full).toMatchObject({ ok: true });
    if (full.ok) expect(full.data.verified_facts).not.toBeNull();
  });
  it("a stranger cannot tell a missing donation from one that is not theirs; an operator can", async () => {
    const { id } = await claimed();
    const refusal = { ok: false, error: { code: "NOT_AUTHORIZED" } };
    expect(await recordHandoff({ actor: courierActor(COURIER_B), donation_id: id, step: "collected", simulated: true }, w.deps(at(10)))).toMatchObject(refusal);
    expect(await recordHandoff({ actor: courierActor(COURIER_B), donation_id: randomUUID(), step: "collected", simulated: true }, w.deps(at(10)))).toMatchObject(refusal);
    // The same donor probe on the card read model.
    expect(await getDonationCard(donorActor("00000000-0000-4000-8000-0000000000ff"), id, w.deps(at(10)))).toMatchObject(refusal);
    expect(await getDonationCard(donorActor("00000000-0000-4000-8000-0000000000ff"), randomUUID(), w.deps(at(10)))).toMatchObject(refusal);
    expect(await getDonationCard(operatorActor, randomUUID(), w.deps(at(10)))).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
  it("cancel and handoff in either order: a cancelled donation cannot be collected; a collected one can still be cancelled with a note", async () => {
    const a = await claimed();
    await operatorAction({ actor: operatorActor, donation_id: a.id, action: "cancel", note: "kitchen closed" }, w.deps(at(1)));
    expect(await recordHandoff({ actor: courierActor(), donation_id: a.id, step: "collected", simulated: true }, w.deps(at(2)))).toMatchObject({ ok: false, error: { code: "NOT_AUTHORIZED" } });
    expect((await donationRow(a.id)).status).toBe("canceled");

    const b = await claimed();
    await recordHandoff({ actor: courierActor(), donation_id: b.id, step: "collected", simulated: true }, w.deps(at(10)));
    expect(await operatorAction({ actor: operatorActor, donation_id: b.id, action: "cancel", note: "" }, w.deps(at(11)))).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
    expect(await operatorAction({ actor: operatorActor, donation_id: b.id, action: "cancel", note: "recalled" }, w.deps(at(11)))).toMatchObject({ ok: true, data: { status: "canceled" } });
    expect(await recordHandoff({ actor: recipientActor(), donation_id: b.id, step: "delivered", simulated: true }, w.deps(at(12)))).toMatchObject({ ok: false });
    expect((await donationRow(b.id)).status).toBe("canceled");
  });
  it("a courier whose assignment ended (STOP before pickup, S-15) can no longer record collection", async () => {
    const { id } = await claimed();
    await optOutIdentity({ identity_id: IDENTITY.courier_a }, w.deps(at(5)));
    expect((await donationRow(id)).status).toBe("eligible");
    expect(await recordHandoff({ actor: courierActor(), donation_id: id, step: "collected", simulated: true }, w.deps(at(10)))).toMatchObject({ ok: false, error: { code: "NOT_AUTHORIZED" } });
  });
});

describe("operatorAction", () => {
  it("is operator only and refusals write nothing", async () => {
    const row = await needsReview();
    for (const actor of [donorActor(), courierActor(), recipientActor(), { role: "system", id: null } as Actor]) {
      expect(await operatorAction({ actor, donation_id: row.id, action: "reject", note: "no" }, w.deps())).toMatchObject({ ok: false, error: { code: "NOT_AUTHORIZED" } });
    }
    expect(await donationRow(row.id)).toEqual(row);
    expect(await eventsOf(row.id)).toHaveLength(0);
  });
  it("validates the action, the note and the id", async () => {
    const row = await needsReview();
    expect(await operatorAction({ actor: operatorActor, donation_id: row.id, action: "approve" as never, note: "" }, w.deps())).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(await operatorAction({ actor: operatorActor, donation_id: row.id, action: "reject", note: "x".repeat(501) }, w.deps())).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(await operatorAction({ actor: operatorActor, donation_id: row.id, action: "reject", note: 5 as never }, w.deps())).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(await operatorAction({ actor: operatorActor, donation_id: randomUUID(), action: "reject", note: "n" }, w.deps())).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
  it("reject (S-12) needs a note, ends the donation, revokes its links and never stores the note text", async () => {
    const row = await needsReview();
    await w.db.insert(verification_links).values({ donation_id: row.id, donor_id: DONOR, token_hash: "a".repeat(64), issued_at: T0, expires_at: at(30) });
    expect(await operatorAction({ actor: operatorActor, donation_id: row.id, action: "reject", note: "   " }, w.deps())).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
    const note = "Called the kitchen, cooling log missing";
    const r = await operatorAction({ actor: operatorActor, donation_id: row.id, action: "reject", note }, w.deps(at(1)));
    expect(r).toMatchObject({ ok: true, data: { status: "rejected", version: row.version + 1 } });
    expect((await w.db.select().from(verification_links).where(eq(verification_links.donation_id, row.id)))[0]!.revoked_at?.toISOString()).toBe(iso(1));
    const events = await eventsOf(row.id, "operator.action");
    expect(events[0]!.data).toEqual({ action: "reject", from: "needs_review", to: "rejected", transition: "S-12", note_length: note.length });
    expect(JSON.stringify(await w.db.select().from(audit_events))).not.toContain("cooling log");
  });
  it("return_to_donor (S-13) sends needs_review back to draft, but never once the food was collected", async () => {
    const row = await needsReview();
    expect(await operatorAction({ actor: operatorActor, donation_id: row.id, action: "return_to_donor", note: "" }, w.deps())).toMatchObject({ ok: true, data: { status: "draft" } });
    const collected = await needsReview({ collected_at: at(-5) });
    expect(await operatorAction({ actor: operatorActor, donation_id: collected.id, action: "return_to_donor", note: "x" }, w.deps())).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
  });
  it("cancel (S-11) of an offered donation cancels its live offers and audits donation.canceled", async () => {
    const { id, offers: [o] } = await offered();
    const r = await operatorAction({ actor: operatorActor, donation_id: id, action: "cancel", note: "" }, w.deps(at(1)));
    expect(r).toMatchObject({ ok: true, data: { status: "canceled", active_offers: [] } });
    expect((await w.db.select().from(offers).where(eq(offers.id, o!.id)))[0]).toMatchObject({ status: "canceled", close_reason: "donation_canceled" });
    expect(await eventsOf(id, "donation.canceled")).toHaveLength(1);
    // A YES that arrives afterwards gets no assignment.
    expect((await claimOffer(cmd(o!.id), w.deps(at(2)))).code).not.toBe("claimed");
  });
  it("cancel of a claimed donation needs a note and ends the assignment (history kept)", async () => {
    const { id, offer_id } = await claimed();
    expect(await operatorAction({ actor: operatorActor, donation_id: id, action: "cancel", note: "" }, w.deps(at(1)))).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
    expect(await operatorAction({ actor: operatorActor, donation_id: id, action: "cancel", note: "kitchen closed" }, w.deps(at(1)))).toMatchObject({ ok: true, data: { status: "canceled", assignment: null } });
    expect((await w.db.select().from(offers).where(eq(offers.id, offer_id)))[0]).toMatchObject({ status: "accepted", close_reason: "donation_canceled" });
    const replay = await claimOffer(cmd(offer_id), w.deps(at(2)));
    expect(replay.code).not.toBe("already_claimed_by_you");
    expect(replay.assignment).toBeNull();
  });
  it("terminal donations accept no action", async () => {
    const row = await insertDonation(w.db, { status: "delivered" });
    for (const action of ["cancel", "reject", "return_to_donor", "retry_matching"] as const) {
      expect(await operatorAction({ actor: operatorActor, donation_id: row.id, action, note: "n" }, w.deps()), action).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
    }
  });
  it("retry_matching (S-14) returns unmatched to eligible with a fresh gate decision", async () => {
    const row = await insertDonation(w.db, { status: "unmatched", verified_facts: factsAt(), effective_cutoff_at: at(120), latest_decision: null });
    const r = await operatorAction({ actor: operatorActor, donation_id: row.id, action: "retry_matching", note: "" }, w.deps(at(1)));
    expect(r).toMatchObject({ ok: true, data: { status: "eligible", decision: { outcome: "eligible", reasons: [], evaluated_at: iso(1) } } });
    expect((await eventsOf(row.id, "eligibility.evaluated"))[0]!.data).toMatchObject({ outcome: "eligible" });
  });
  it("retry_matching is only for unmatched: scene 3 (needs_review) stays needs_review", async () => {
    const row = await needsReview();
    expect(await operatorAction({ actor: operatorActor, donation_id: row.id, action: "retry_matching", note: "" }, w.deps())).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
    expect((await donationRow(row.id)).status).toBe("needs_review");
  });
  it("retry_matching at or after the cutoff is INVALID_TRANSITION whatever the gate says", async () => {
    const row = await insertDonation(w.db, { status: "unmatched", verified_facts: factsAt(), effective_cutoff_at: at(120) });
    expect(await operatorAction({ actor: operatorActor, donation_id: row.id, action: "retry_matching", note: "" }, w.deps(at(120)))).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
  });
  it("S-18: when the gate re-run is no longer eligible, the stored status follows the new decision", async () => {
    const row = await insertDonation(w.db, { status: "unmatched", verified_facts: factsAt(), effective_cutoff_at: at(120) });
    await w.db.update(donors).set({ approval_status: "suspended" }).where(eq(donors.id, DONOR));
    const r = await operatorAction({ actor: operatorActor, donation_id: row.id, action: "retry_matching", note: "" }, w.deps(at(1)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.status).not.toBe("eligible");
    expect(r.data.status).toBe(r.data.decision!.outcome);
  });
});

describe("resetDemo", () => {
  it("is refused outside demo mode and deletes nothing", async () => {
    vi.stubEnv("ANNONA_DEMO_MODE", "");
    const id = await makeEligibleDonation(w);
    expect(await resetDemo({ keep_identities: true, actor: operatorActor }, deps())).toMatchObject({ ok: false, error: { code: "NOT_AUTHORIZED" } });
    expect(await donationRow(id)).toBeDefined();
  });
  it("deletes donations, offers and links; keeps joined identities and the audit history; frees short codes; re-seeds windows", async () => {
    vi.stubEnv("ANNONA_DEMO_MODE", "1");
    const { id, offers: [o] } = await offered();
    await w.db.insert(verification_links).values({ donation_id: id, donor_id: DONOR, token_hash: "b".repeat(64), issued_at: T0, expires_at: at(30) });
    const auditBefore = (await w.db.select().from(audit_events)).length;
    const offersBefore = (await w.db.select().from(offers)).length;
    const imagesBefore = (await w.db.select().from(donation_images)).length;

    const later = at(600);
    expect(await resetDemo({ keep_identities: true, actor: operatorActor }, deps(later))).toEqual({ ok: true, data: { reset_at: later.toISOString() } });
    expect(await w.db.select().from(donations)).toHaveLength(0);
    expect(await w.db.select().from(offers)).toHaveLength(0);
    expect(await w.db.select().from(verification_links)).toHaveLength(0);
    const identities = await w.db.select().from(messaging_identities);
    expect(identities.find((i) => i.id === IDENTITY.courier_a)).toMatchObject({ status: "joined" });
    const audit = await w.db.select().from(audit_events);
    expect(audit.length).toBe(auditBefore + 1);
    expect(o).toBeDefined();
    expect(offersBefore).toBeGreaterThan(0);
    expect(audit.find((e) => e.type === "demo.reset")!.data).toMatchObject({ deleted: { donations: 1, offers: offersBefore, links: 1, images: imagesBefore } });
    const [eastlake] = await w.db.select().from(recipients).where(eq(recipients.id, EASTLAKE));
    expect(eastlake!.receiving_closes_at.getTime()).toBeGreaterThan(later.getTime());

    // The same short code can be issued again after the reset.
    const again = await offered();
    expect(again.offers.length).toBeGreaterThan(0);
  });
  it("a STOP from a simulated phone is undone by the reset; a STOP from a real phone is never undone", async () => {
    vi.stubEnv("ANNONA_DEMO_MODE", "1");
    await optOutIdentity({ identity_id: IDENTITY.courier_a }, w.deps(at(1)));
    await optOutIdentity({ identity_id: IDENTITY.courier_b }, w.deps(at(1)));
    await w.db.update(messaging_identities).set({ provider: "photon", handle: "+12065550123" }).where(eq(messaging_identities.id, IDENTITY.courier_b));
    const r = await resetDemo({ keep_identities: true, actor: operatorActor }, deps(at(600)));
    expect(r.ok).toBe(true);
    const rows = await w.db.select().from(messaging_identities);
    expect(rows.find((i) => i.id === IDENTITY.courier_a)).toMatchObject({ status: "joined", opted_out_at: null });
    expect(rows.find((i) => i.id === IDENTITY.courier_b)).toMatchObject({ status: "opted_out" });
    const event = (await w.db.select().from(audit_events)).find((e) => e.type === "demo.reset")!;
    expect(event.data).toMatchObject({ deleted: { simulated_identities_restored: 1, opt_outs_kept: 1 } });
    // Put the seeded identity back so later tests start from the seed.
    await w.db.update(messaging_identities).set({ provider: "fake", handle: "courier-b@example.invalid", status: "joined", opted_out_at: null }).where(eq(messaging_identities.id, IDENTITY.courier_b));
  });
  it("keeps the inbound ledger: an old message replayed after the reset is still a duplicate", async () => {
    vi.stubEnv("ANNONA_DEMO_MODE", "1");
    expect((await recordInboundMessage("fake", "fake_before_reset", { text: "YES K7M3" }, w.deps(at(1)))).status).toBe("first");
    // A finished message is a duplicate for good; an unfinished one is reclaimed after 30 s (CONTRACTS section 8.2).
    await saveInboundResult({ provider: "fake", provider_message_id: "fake_before_reset", result: { outcome: "rejected", command: "accept", reply: null } }, w.deps(at(1)));
    await resetDemo({ keep_identities: true, actor: operatorActor }, deps(at(600)));
    expect((await recordInboundMessage("fake", "fake_before_reset", { text: "YES K7M3" }, w.deps(at(601)))).status).toBe("duplicate");
  });
  it("a fake-provider identity with a real-looking handle is not re-joined by the reset", async () => {
    vi.stubEnv("ANNONA_DEMO_MODE", "1");
    // Identity rows are not reset between tests, so set both explicitly.
    await w.db.update(messaging_identities).set({ provider: "fake", handle: "courier-b@example.invalid" }).where(eq(messaging_identities.id, IDENTITY.courier_b));
    await optOutIdentity({ identity_id: IDENTITY.courier_a }, w.deps(at(1)));
    await optOutIdentity({ identity_id: IDENTITY.courier_b }, w.deps(at(1)));
    await w.db.update(messaging_identities).set({ handle: "+12065550123" }).where(eq(messaging_identities.id, IDENTITY.courier_a));
    expect((await resetDemo({ keep_identities: true, actor: operatorActor }, deps(at(600)))).ok).toBe(true);
    const rows = await w.db.select().from(messaging_identities);
    expect(rows.find((i) => i.id === IDENTITY.courier_a)).toMatchObject({ status: "opted_out" });
    expect(rows.find((i) => i.id === IDENTITY.courier_b)).toMatchObject({ status: "joined" });
    const event = (await w.db.select().from(audit_events)).find((e) => e.type === "demo.reset")!;
    expect(event.data).toMatchObject({ deleted: { simulated_identities_restored: 1, opt_outs_kept: 1 } });
  });
  it("a caller must name its actor and it must be an operator; the check runs before anything is deleted", async () => {
    vi.stubEnv("ANNONA_DEMO_MODE", "1");
    const id = await makeEligibleDonation(w);
    expect(await resetDemo({ keep_identities: true }, deps()), "no actor").toMatchObject({ ok: false, error: { code: "NOT_AUTHORIZED" } });
    for (const actor of [courierActor(), donorActor(), { role: "system", id: null } as Actor]) {
      expect(await resetDemo({ keep_identities: true, actor }, deps()), actor.role).toMatchObject({ ok: false, error: { code: "NOT_AUTHORIZED" } });
    }
    expect(await donationRow(id)).toBeDefined();
    expect(await resetDemo({ keep_identities: true, actor: operatorActor }, deps())).toMatchObject({ ok: true });
  });
  it("only ever keeps identities", async () => {
    vi.stubEnv("ANNONA_DEMO_MODE", "1");
    expect(await resetDemo({ keep_identities: false as true }, deps())).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });
});

describe("no audit rows leak the operator's identity details", () => {
  it("operator actions carry the operator id, never a handle", async () => {
    const row = await needsReview();
    await operatorAction({ actor: operatorActor, donation_id: row.id, action: "reject", note: "call me" }, w.deps());
    const [e] = await eventsOf(row.id, "operator.action");
    expect(e!.actor_id).toBe(OPERATOR);
  });
});
