import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { DeliveryStatusEvent, InboundResult, OutboundMessage } from "@/contracts";
import {
  findOpenOffersForCourier,
  getIdentity,
  hasOutboundMessage,
  joinIdentity,
  listMessages,
  recordDeliveryStatus,
  recordIgnoredInbound,
  recordInboundMessage,
  recordOutboundMessage,
  recordStatusEvent,
  resolveIdentityByHandle,
  saveInboundResult,
} from "@/core";
import { audit_events, donations, inbound_messages, messaging_identities, offers, outbound_messages, provider_status_events } from "@/db/schema";
import { COURIER_A, COURIER_B, COURIER_C, DONOR, IDENTITY, T0, at, insertDonation, insertOffer, makeWorld, type World } from "./helpers/world";

// Slice 2(b), part 1: identities and the message ledger (CONTRACTS 3.10, 8.2, 8.3, 11).

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

let w: World;
beforeAll(async () => {
  w = await makeWorld();
});
afterAll(async () => w.close());
// Fixture offers and donations are removed after each test, so the one-live-offer-per-courier index never leaks between tests.
afterEach(async () => {
  await w.db.delete(offers);
  await w.db.delete(donations);
});

const audits = async (type: string) => (await w.db.select().from(audit_events).where(eq(audit_events.type, type as never)));
const inboundRow = async (id: string) =>
  (await w.db.select().from(inbound_messages).where(eq(inbound_messages.provider_message_id, id)))[0]!;
const pmid = () => `m-${randomUUID()}`;
const result = (over: Partial<InboundResult> = {}): InboundResult => ({ outcome: "processed", command: "help", reply: null, ...over });
const COURIER_A_HANDLE = "courier-a@example.invalid";

async function freshIdentity(over: Partial<typeof messaging_identities.$inferInsert> = {}) {
  const [row] = await w.db
    .insert(messaging_identities)
    .values({ actor_role: "courier", actor_id: COURIER_B, provider: "fake", handle: `h-${randomUUID()}@example.invalid`, status: "awaiting_join", ...over })
    .returning();
  return row!;
}

describe("resolveIdentityByHandle and getIdentity", () => {
  it("finds a seeded identity by handle, ignoring case and surrounding spaces", async () => {
    for (const h of [COURIER_A_HANDLE, "  Courier-A@Example.Invalid ", COURIER_A_HANDLE.toUpperCase()]) {
      const i = await resolveIdentityByHandle("fake", h, w.deps());
      expect(i, h).toMatchObject({ id: IDENTITY.courier_a, actor_role: "courier", actor_id: COURIER_A, provider: "fake" });
    }
  });
  it("is scoped to the provider and returns null for strangers, blanks and nonsense", async () => {
    expect(await resolveIdentityByHandle("photon", COURIER_A_HANDLE, w.deps())).toBeNull();
    expect(await resolveIdentityByHandle("fake", "nobody@example.invalid", w.deps())).toBeNull();
    expect(await resolveIdentityByHandle("fake", "", w.deps())).toBeNull();
    expect(await resolveIdentityByHandle("fake", "   ", w.deps())).toBeNull();
    expect(await resolveIdentityByHandle("sms" as never, COURIER_A_HANDLE, w.deps())).toBeNull();
    expect(await resolveIdentityByHandle("fake", null as never, w.deps())).toBeNull();
    expect(await resolveIdentityByHandle("fake", "%", w.deps())).toBeNull(); // not a LIKE pattern
  });
  it("getIdentity returns the identity or null", async () => {
    expect(await getIdentity(IDENTITY.donor, w.deps())).toMatchObject({ actor_role: "donor", actor_id: DONOR });
    expect(await getIdentity(randomUUID(), w.deps())).toBeNull();
  });
});

describe("joinIdentity", () => {
  it("awaiting_join -> joined with the clock's time, the provider ids and one audit event", async () => {
    const i = await freshIdentity();
    const deps = w.deps(at(5));
    const r = await joinIdentity({ identity_id: i.id, provider_space_id: "space-1", provider_sender_id: "line-1" }, deps);
    expect(r).toMatchObject({ ok: true, data: { status: "joined", joined_at: at(5).toISOString(), opted_out_at: null, provider_space_id: "space-1", provider_sender_id: "line-1" } });
    const events = (await audits("identity.joined")).filter((e) => (e.data as { identity_id: string }).identity_id === i.id);
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events[0])).not.toContain(i.handle);
  });
  it("is idempotent: a second JOIN keeps joined_at and writes no second audit event", async () => {
    const i = await freshIdentity();
    await joinIdentity({ identity_id: i.id, provider_space_id: "s", provider_sender_id: "l" }, w.deps(at(1)));
    const again = await joinIdentity({ identity_id: i.id, provider_space_id: "s", provider_sender_id: "l" }, w.deps(at(9)));
    expect(again.ok && again.data.joined_at).toBe(at(1).toISOString());
    expect((await audits("identity.joined")).filter((e) => (e.data as { identity_id: string }).identity_id === i.id)).toHaveLength(1);
  });
  it("a repeated JOIN may refresh the provider ids but never joined_at; null ids keep the old ones", async () => {
    const i = await freshIdentity();
    await joinIdentity({ identity_id: i.id, provider_space_id: "s1", provider_sender_id: "l1" }, w.deps(at(1)));
    const r = await joinIdentity({ identity_id: i.id, provider_space_id: "s2", provider_sender_id: null }, w.deps(at(9)));
    expect(r).toMatchObject({ ok: true, data: { joined_at: at(1).toISOString(), provider_space_id: "s2", provider_sender_id: "l1" } });
  });
  it("re-JOIN after STOP opts back in with a new joined_at and clears opted_out_at", async () => {
    const i = await freshIdentity({ status: "opted_out", opted_out_at: at(-30) });
    const r = await joinIdentity({ identity_id: i.id, provider_space_id: null, provider_sender_id: null }, w.deps(at(2)));
    expect(r).toMatchObject({ ok: true, data: { status: "joined", joined_at: at(2).toISOString(), opted_out_at: null } });
    const last = (await audits("identity.joined")).filter((e) => (e.data as { identity_id: string }).identity_id === i.id);
    expect(last[0]!.data).toMatchObject({ rejoined: true });
  });
  it("an unknown identity is not found", async () => {
    expect(await joinIdentity({ identity_id: randomUUID(), provider_space_id: null, provider_sender_id: null }, w.deps())).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

describe("findOpenOffersForCourier", () => {
  it("returns only open offers whose deadline is still ahead, oldest first", async () => {
    const d1 = await insertDonation(w.db, { status: "offered" });
    const d2 = await insertDonation(w.db, { status: "offered" });
    const courier = COURIER_B;
    const live = await insertOffer(w.db, d1.id, { courier_id: courier, status: "open", expires_at: at(5), created_at: at(0) });
    await insertOffer(w.db, d2.id, { courier_id: courier, status: "expired", close_reason: "offer_expired" });
    await insertOffer(w.db, d2.id, { courier_id: courier, status: "declined", responded_at: T0 });
    await insertOffer(w.db, d1.id, { courier_id: COURIER_C, status: "pending_send" });
    const out = await findOpenOffersForCourier(courier, w.deps(at(1)));
    expect(out.map((o) => o.id)).toEqual([live.id]);
    expect(out[0]).toMatchObject({ status: "open", courier_id: courier });
    expect(await findOpenOffersForCourier(courier, w.deps(at(5)))).toEqual([]); // deadline reached: not answerable
    expect(await findOpenOffersForCourier(randomUUID(), w.deps())).toEqual([]);
  });
});

describe("recordInboundMessage / saveInboundResult (CONTRACTS 8.2)", () => {
  const known = (id: string, text = "hello") => ({ provider: "fake", provider_message_id: id, provider_event_id: null, received_at: T0.toISOString(), sender_handle: COURIER_A_HANDLE, text, attachments: [] });

  it("first delivery is first; a delivery with a saved result is a duplicate that returns the stored result", async () => {
    const id = pmid();
    expect(await recordInboundMessage("fake", id, known(id), w.deps())).toEqual({ status: "first", stored_result: null });
    await saveInboundResult({ provider: "fake", provider_message_id: id, result: result({ command: "join" }) }, w.deps());
    const dup = await recordInboundMessage("fake", id, known(id), w.deps());
    expect(dup).toMatchObject({ status: "duplicate", stored_result: { command: "join", outcome: "processed" } });
  });
  it("while the first delivery is still in flight (< 30 s) a duplicate has no stored result and is not reprocessed", async () => {
    const id = pmid();
    await recordInboundMessage("fake", id, known(id), w.deps(T0));
    expect(await recordInboundMessage("fake", id, known(id), w.deps(at(0.4)))).toEqual({ status: "duplicate", stored_result: null });
  });
  it("an unfinished row older than 30 s is reclaimed exactly once; exactly 30 s old is still in flight", async () => {
    const id = pmid();
    await recordInboundMessage("fake", id, known(id), w.deps(T0));
    expect((await recordInboundMessage("fake", id, known(id), w.deps(new Date(T0.getTime() + 30_000)))).status).toBe("duplicate");
    const later = new Date(T0.getTime() + 30_001);
    expect((await recordInboundMessage("fake", id, known(id), w.deps(later))).status).toBe("first");
    expect((await inboundRow(id)).processing_started_at?.toISOString()).toBe(later.toISOString());
    expect((await recordInboundMessage("fake", id, known(id), w.deps(new Date(later.getTime() + 1000)))).status).toBe("duplicate"); // fresh again
  });
  it("two simultaneous reclaims of one stale row: exactly one wins", async () => {
    const id = pmid();
    await recordInboundMessage("fake", id, known(id), w.deps(T0));
    const later = at(5);
    const rs = await Promise.all([recordInboundMessage("fake", id, known(id), w.deps(later)), recordInboundMessage("fake", id, known(id), w.deps(later))]);
    expect(rs.filter((r) => r.status === "first")).toHaveLength(1);
  });
  it("a finished row is never reclaimed, however old", async () => {
    const id = pmid();
    await recordInboundMessage("fake", id, known(id), w.deps(T0));
    await saveInboundResult({ provider: "fake", provider_message_id: id, result: result() }, w.deps());
    expect((await recordInboundMessage("fake", id, known(id), w.deps(at(600)))).status).toBe("duplicate");
  });
  it("the same message id from another provider is a different message", async () => {
    const id = pmid();
    await recordInboundMessage("fake", id, known(id), w.deps());
    expect((await recordInboundMessage("photon", id, known(id), w.deps())).status).toBe("first");
  });
  it("keeps a known sender's handle and payload, and never a stranger's", async () => {
    const a = pmid();
    const b = pmid();
    await recordInboundMessage("fake", a, known(a, "from a courier"), w.deps());
    await recordInboundMessage("fake", b, { ...known(b, "from a stranger"), sender_handle: "stranger@example.invalid" }, w.deps());
    const ra = await inboundRow(a);
    const rb = await inboundRow(b);
    expect(ra.sender_handle).toBe(COURIER_A_HANDLE);
    expect(JSON.stringify(ra.payload)).toContain("from a courier");
    expect(rb.sender_handle).toBeNull();
    expect(rb.payload).toBeNull();
    expect(JSON.stringify(rb)).not.toContain("stranger@example.invalid");
    expect(rb.handle_masked).toBe("***alid"); // last 4 characters of "...@example.invalid"
    expect(rb.handle_masked!.length).toBeLessThanOrEqual(8);
  });
  it("audits received and duplicate without any handle or text", async () => {
    const id = pmid();
    await recordInboundMessage("fake", id, known(id, "secret words"), w.deps());
    await recordInboundMessage("fake", id, known(id, "secret words"), w.deps());
    const mine = [...(await audits("inbound.received")), ...(await audits("inbound.duplicate"))].filter((e) => (e.data as { provider_message_id: string }).provider_message_id === id);
    expect(mine.map((e) => e.type).sort()).toEqual(["inbound.duplicate", "inbound.received"]);
    expect(JSON.stringify(mine)).not.toContain("secret words");
    expect(JSON.stringify(mine)).not.toContain(COURIER_A_HANDLE);
  });
  it("refuses a missing provider or message id", async () => {
    await expect(recordInboundMessage("fake", "", {}, w.deps())).rejects.toThrow();
    await expect(recordInboundMessage("sms" as never, "x", {}, w.deps())).rejects.toThrow();
  });
  it("saveInboundResult keeps the first result, and refuses a message that was never recorded", async () => {
    const id = pmid();
    await recordInboundMessage("fake", id, known(id), w.deps());
    await saveInboundResult({ provider: "fake", provider_message_id: id, result: result({ command: "accept" }) }, w.deps());
    await saveInboundResult({ provider: "fake", provider_message_id: id, result: result({ command: "stop" }) }, w.deps());
    expect((await inboundRow(id)).result).toMatchObject({ command: "accept" });
    await expect(saveInboundResult({ provider: "fake", provider_message_id: pmid(), result: result() }, w.deps())).rejects.toThrow();
  });
});

describe("recordIgnoredInbound (CONTRACTS 11)", () => {
  it("scrubs a recorded known sender: no handle, no payload, a masked handle and the reason", async () => {
    const id = pmid();
    await recordInboundMessage("fake", id, { sender_handle: COURIER_A_HANDLE, text: "JOIN me", attachments: [] }, w.deps());
    expect((await inboundRow(id)).payload).not.toBeNull();
    await recordIgnoredInbound({ provider: "fake", provider_message_id: id, reason: "not_joined", handle_masked: "***alid" }, w.deps());
    const row = await inboundRow(id);
    expect(row).toMatchObject({ sender_handle: null, payload: null, ignore_reason: "not_joined", handle_masked: "***alid" });
    const ev = (await audits("inbound.ignored")).find((e) => (e.data as { provider_message_id: string }).provider_message_id === id)!;
    expect(ev.data).toMatchObject({ reason: "not_joined", handle_masked: "***alid" });
    expect(JSON.stringify(ev)).not.toContain(COURIER_A_HANDLE);
  });
  it("works even when the message was never recorded first, and never keeps more than 8 characters of a handle", async () => {
    const id = pmid();
    await recordIgnoredInbound({ provider: "fake", provider_message_id: id, reason: "unknown_sender", handle_masked: "stranger-long-handle@example.invalid" }, w.deps());
    const row = await inboundRow(id);
    expect(row.handle_masked!.length).toBeLessThanOrEqual(8);
    expect(JSON.stringify(row)).not.toContain("stranger-long-handle");
    expect(row).toMatchObject({ sender_handle: null, payload: null, ignore_reason: "unknown_sender" });
  });
  it("refuses an invalid reason or provider", async () => {
    await expect(recordIgnoredInbound({ provider: "fake", provider_message_id: pmid(), reason: "spam" as never, handle_masked: "x" }, w.deps())).rejects.toThrow();
    await expect(recordIgnoredInbound({ provider: "sms" as never, provider_message_id: pmid(), reason: "unknown_sender", handle_masked: "x" }, w.deps())).rejects.toThrow();
  });
});

describe("recordOutboundMessage / hasOutboundMessage (CONTRACTS 8.3)", () => {
  const msg = (over: Partial<OutboundMessage> = {}): OutboundMessage => ({
    to_identity_id: IDENTITY.courier_a, text: "hello there", purpose: "help", correlation: {}, idempotency_key: `k-${randomUUID()}`, ...over,
  });

  it("stores the attempt once per idempotency key, with the identity's provider mode and one audit event", async () => {
    const m = msg({ correlation: { inbound_message_id: "m1" } });
    await recordOutboundMessage({ message: m, provider_message_id: "pm-1" }, w.deps());
    await recordOutboundMessage({ message: m, provider_message_id: "pm-1" }, w.deps());
    const rows = await w.db.select().from(outbound_messages).where(eq(outbound_messages.idempotency_key, m.idempotency_key));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ identity_id: IDENTITY.courier_a, purpose: "help", provider_mode: "fake", provider_message_id: "pm-1", text: "hello there" });
    expect(rows[0]!.correlation).toEqual({ inbound_message_id: "m1" });
    const ev = (await audits("outbound.sent")).filter((e) => (e.data as { identity_id: string; purpose: string }).purpose === "help" && (e.data as { sent: boolean }).sent);
    expect(JSON.stringify(ev)).not.toContain("hello there");
  });
  it("hasOutboundMessage is true only for a message the provider accepted", async () => {
    const m = msg();
    expect(await hasOutboundMessage(m.idempotency_key, w.deps())).toBe(false);
    await recordOutboundMessage({ message: m, provider_message_id: null }, w.deps()); // failed or skipped attempt
    expect(await hasOutboundMessage(m.idempotency_key, w.deps())).toBe(false);
    await recordOutboundMessage({ message: m, provider_message_id: "pm-late" }, w.deps()); // the retry succeeded
    expect(await hasOutboundMessage(m.idempotency_key, w.deps())).toBe(true);
    const row = (await w.db.select().from(outbound_messages).where(eq(outbound_messages.idempotency_key, m.idempotency_key)))[0]!;
    expect(row.provider_message_id).toBe("pm-late");
  });
  it("a later failure never erases a recorded success", async () => {
    const m = msg();
    await recordOutboundMessage({ message: m, provider_message_id: "pm-ok" }, w.deps());
    await recordOutboundMessage({ message: m, provider_message_id: null }, w.deps());
    await recordOutboundMessage({ message: m, provider_message_id: "pm-other" }, w.deps());
    const row = (await w.db.select().from(outbound_messages).where(eq(outbound_messages.idempotency_key, m.idempotency_key)))[0]!;
    expect(row.provider_message_id).toBe("pm-ok");
  });
  it("refuses an unknown identity or an invalid message", async () => {
    await expect(recordOutboundMessage({ message: msg({ to_identity_id: randomUUID() }), provider_message_id: null }, w.deps())).rejects.toThrow();
    await expect(recordOutboundMessage({ message: msg({ text: "" }), provider_message_id: null }, w.deps())).rejects.toThrow();
    await expect(recordOutboundMessage({ message: msg({ purpose: "spam" as never }), provider_message_id: null }, w.deps())).rejects.toThrow();
  });
});

describe("listMessages (the simulated phone's thread)", () => {
  const TOKEN = "A".repeat(39) + "WXYZ"; // 43 base64url characters
  it("interleaves a known sender's texts with the replies sent to them, oldest first, and nothing else", async () => {
    const id = await freshIdentity({ status: "joined", joined_at: T0 });
    const inId = pmid();
    await recordInboundMessage("fake", inId, { provider_message_id: inId, sender_handle: id.handle, text: "JOIN", attachments: [] }, w.deps(at(1)));
    await recordOutboundMessage({ message: { to_identity_id: id.id, text: "Welcome", purpose: "join_ack", correlation: {}, idempotency_key: `k-${randomUUID()}` }, provider_message_id: "pm-a" }, w.deps(at(2)));
    await recordInboundMessage("fake", pmid(), { sender_handle: "someone-else@example.invalid", text: "not mine", attachments: [] }, w.deps(at(3)));
    const t = await listMessages({ identity_id: id.id }, w.deps());
    expect(t.map((m) => [m.direction, m.text, m.purpose])).toEqual([["inbound", "JOIN", null], ["outbound", "Welcome", "join_ack"]]);
    expect(JSON.stringify(t)).not.toContain(id.handle);
  });
  it("shows a photo-only message as (photo) and skips ignored inbound rows", async () => {
    const id = await freshIdentity({ status: "joined", joined_at: T0 });
    await recordInboundMessage("fake", pmid(), { sender_handle: id.handle, text: null, attachments: [{ kind: "image", fixture_id: "f1" }] }, w.deps());
    const ign = pmid();
    await recordInboundMessage("fake", ign, { sender_handle: id.handle, text: "ignored later", attachments: [] }, w.deps());
    await recordIgnoredInbound({ provider: "fake", provider_message_id: ign, reason: "not_joined", handle_masked: "***alid" }, w.deps());
    const t = await listMessages({ identity_id: id.id }, w.deps());
    expect(t.map((m) => m.text)).toEqual(["(photo)"]);
  });
  it("masks a draft_ready link token to its last 4 characters for a real-provider identity, but not for a fake one", async () => {
    const photon = await freshIdentity({ provider: "photon", status: "joined", joined_at: T0 });
    const fake = await freshIdentity({ status: "joined", joined_at: T0 });
    const text = `Your draft is ready: https://app.example.invalid/v#${TOKEN}`;
    for (const i of [photon, fake]) {
      await recordOutboundMessage({ message: { to_identity_id: i.id, text, purpose: "draft_ready", correlation: {}, idempotency_key: `k-${randomUUID()}` }, provider_message_id: "pm" }, w.deps());
    }
    const real = await listMessages({ identity_id: photon.id }, w.deps());
    const sim = await listMessages({ identity_id: fake.id }, w.deps());
    expect(real[0]!.text).not.toContain(TOKEN);
    expect(real[0]!.text).toContain("#…WXYZ");
    expect(sim[0]!.text).toContain(TOKEN);
  });
  it("does not mask other message purposes, and returns [] for an unknown identity", async () => {
    const photon = await freshIdentity({ provider: "photon", status: "joined", joined_at: T0 });
    await recordOutboundMessage({ message: { to_identity_id: photon.id, text: `see #${TOKEN}`, purpose: "help", correlation: {}, idempotency_key: `k-${randomUUID()}` }, provider_message_id: "pm" }, w.deps());
    expect((await listMessages({ identity_id: photon.id }, w.deps()))[0]!.text).toContain(TOKEN);
    expect(await listMessages({ identity_id: randomUUID() }, w.deps())).toEqual([]);
  });
  it("without an identity it lists every thread's messages (operator view)", async () => {
    const all = await listMessages({}, w.deps());
    expect(all.length).toBeGreaterThan(3);
    expect(all.every((m) => m.direction === "inbound" || m.direction === "outbound")).toBe(true);
  });
});

describe("recordStatusEvent / recordDeliveryStatus", () => {
  const evt = (over: Partial<DeliveryStatusEvent> = {}): DeliveryStatusEvent => ({
    provider: "fake", provider_event_id: `e-${randomUUID()}`, provider_message_id: `pm-${randomUUID()}`, status: "delivered", failure_code: null, at: T0.toISOString(), ...over,
  });
  it("dedupes on (provider, provider_event_id)", async () => {
    const e = evt();
    expect(await recordStatusEvent(e, w.deps())).toBe("first");
    expect(await recordStatusEvent(e, w.deps())).toBe("duplicate");
    expect(await recordStatusEvent({ ...e, provider: "photon" }, w.deps())).toBe("first");
    expect(await w.db.select().from(provider_status_events).where(eq(provider_status_events.provider_event_id, e.provider_event_id))).toHaveLength(2);
  });
  it("keeps a failure code only when it looks like a code", async () => {
    const a = evt({ status: "failed", failure_code: "RATE_LIMITED" });
    const b = evt({ status: "failed", failure_code: "call +1 206 555 0100 now" });
    await recordStatusEvent(a, w.deps());
    await recordStatusEvent(b, w.deps());
    const rows = await w.db.select().from(provider_status_events);
    expect(rows.find((r) => r.provider_event_id === a.provider_event_id)!.failure_code).toBe("RATE_LIMITED");
    expect(rows.find((r) => r.provider_event_id === b.provider_event_id)!.failure_code).toBeNull();
  });
  it("a message that is not an offer is acknowledged with nulls and changes nothing", async () => {
    expect(await recordDeliveryStatus(evt(), w.deps())).toEqual({ ok: true, data: { offer_id: null, offer_status: null } });
  });
  it("updates the matching offer's delivery status, returns its id and current status, audits once, and never goes backwards", async () => {
    const d = await insertDonation(w.db, { status: "offered" });
    const o = await insertOffer(w.db, d.id, { courier_id: COURIER_B, status: "open", provider_message_id: "pm-offer-1" });
    const accepted = await recordDeliveryStatus(evt({ provider_message_id: "pm-offer-1", status: "accepted" }), w.deps());
    expect(accepted).toEqual({ ok: true, data: { offer_id: o.id, offer_status: "open" } });
    await recordDeliveryStatus(evt({ provider_message_id: "pm-offer-1", status: "delivered" }), w.deps());
    await recordDeliveryStatus(evt({ provider_message_id: "pm-offer-1", status: "delivered" }), w.deps()); // replay
    await recordDeliveryStatus(evt({ provider_message_id: "pm-offer-1", status: "accepted" }), w.deps()); // late, out of order
    expect((await w.db.select().from(offers).where(eq(offers.id, o.id)))[0]!.delivery_status).toBe("delivered");
    const evs = (await audits("offer.delivery_status")).filter((e) => e.offer_id === o.id);
    expect(evs.map((e) => (e.data as { status: string }).status)).toEqual(["accepted", "delivered"]);
  });
  it("a failed event is recorded and reported with the offer's status, but does not close the offer itself", async () => {
    const d = await insertDonation(w.db, { status: "offered" });
    const o = await insertOffer(w.db, d.id, { courier_id: COURIER_A, status: "open", provider_message_id: "pm-offer-2" });
    const r = await recordDeliveryStatus(evt({ provider_message_id: "pm-offer-2", status: "failed", failure_code: "UNDELIVERABLE" }), w.deps());
    expect(r).toEqual({ ok: true, data: { offer_id: o.id, offer_status: "open" } });
    expect((await w.db.select().from(offers).where(eq(offers.id, o.id)))[0]).toMatchObject({ delivery_status: "failed", status: "open" });
  });
  it("is safe to call after a duplicate event too (a crash between the two calls never loses the update)", async () => {
    const d = await insertDonation(w.db, { status: "offered" });
    const o = await insertOffer(w.db, d.id, { courier_id: COURIER_B, status: "open", provider_message_id: "pm-offer-3" });
    const e = evt({ provider_message_id: "pm-offer-3", status: "delivered" });
    expect(await recordStatusEvent(e, w.deps())).toBe("first"); // ... crash before recordDeliveryStatus ...
    expect(await recordStatusEvent(e, w.deps())).toBe("duplicate"); // redelivery
    await recordDeliveryStatus(e, w.deps());
    expect((await w.db.select().from(offers).where(eq(offers.id, o.id)))[0]!.delivery_status).toBe("delivered");
  });
  it("refuses an unknown status", async () => {
    expect(await recordDeliveryStatus(evt({ status: "seen" as never }), w.deps())).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });
});
