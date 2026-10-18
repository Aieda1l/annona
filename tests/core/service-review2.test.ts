import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Deps } from "@/contracts";
import {
  attachAiResult,
  claimOffer,
  createDraft,
  createNextOffers,
  declineOffer,
  findOpenOffersForCourier,
  getDonationCard,
  getIdentity,
  joinIdentity,
  listMessages,
  markOfferSendFailed,
  openOfferForSend,
  optOutIdentity,
  recordDeliveryStatus,
  recordIgnoredInbound,
  recordInboundMessage,
  recordOfferProviderMessage,
  recordOutboundMessage,
  storeDonationImage,
  submitVerification,
} from "@/core";
import { writeAudit } from "@/core/service/audit";
import { audit_events, inbound_messages, messaging_identities, offers } from "@/db/schema";
import {
  COURIER_A,
  DONOR,
  IDENTITY,
  JPEG_BYTES,
  PNG_BYTES,
  T0,
  WEBP_BYTES,
  at,
  courierActor,
  donorActor,
  factsAt,
  insertDonation,
  insertOffer,
  makeEligibleDonation,
  makeWorld,
  operatorActor,
  resetWorld,
  type World,
} from "./helpers/world";

// Regression tests for the ECC security review of the slice 2 service layer (group 2). Each failed before its fix.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

let w: World;
beforeAll(async () => {
  w = await makeWorld();
});
afterAll(async () => w.close());
beforeEach(async () => resetWorld(w));

const NOT_A_UUID = ["nope", "", "123", "00000000-0000-4000-8000-00000000000g", "'; drop table offers; --", "../etc/passwd"];

describe("the audit guard cannot be sidestepped with a differently spelled key or a value that holds a handle", () => {
  const write = (data: Record<string, unknown>) => writeAudit(w.db, { at: T0, type: "demo.reset", actor: { role: "system", id: null }, data });
  it.each(["Handle", "HANDLE", "sender", "sender_handle", "phone", "phone_number", "email", "body", "message", "text", "Text", "address", "address_line", "pickup_instruction", "pickup_instructions", "url", "raw_token", "token", "password", "payload", "content"])(
    "refuses the key %s, also nested and inside arrays",
    async (key) => {
      await expect(write({ [key]: "x" })).rejects.toThrow();
      await expect(write({ ok: { deeper: { [key]: "x" } } })).rejects.toThrow();
      await expect(write({ list: [{ [key]: "x" }] })).rejects.toThrow();
    },
  );
  it.each(["courier-a@example.invalid", "x@y", "call 2065550100", "+1 (206) 555-0100", "1234567", "a".repeat(129)])("refuses the value %j", async (value) => {
    await expect(write({ note: value })).rejects.toThrow();
    await expect(write({ list: [value] })).rejects.toThrow();
  });
  it("still accepts what the service layer really writes", async () => {
    await expect(
      write({
        reason_codes: ["ALLERGEN_UNKNOWN", "PICKUP_WINDOW_TOO_SHORT"], outcome: "eligible", policy_version: "2026-10-17.1", edited_field_count: 3,
        source: "messaging", source_event_id: `evt-${randomUUID()}`, provider_message_id: "pm-offer-1", by_offer_id: randomUUID(), wave_no: 2,
        at: "2026-10-17T23:10:00.000Z", handle_masked: "***alid", in_flight: true, reason: "courier_opted_out",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("real Photon ids with a long digit run pass the audit guard (docs/requests/messaging-audit-provider-ids.md)", () => {
  // Shape seen on the real Photon Beta: pho_msg_ + 26 Crockford base32 characters; about 1 in 250 has 7+ digits in a row.
  const DIGIT_RUN_ID = "pho_msg_01m5512345678e7f6g5h4j3km2";
  const write = (data: Record<string, unknown>) => writeAudit(w.db, { at: T0, type: "demo.reset", actor: { role: "system", id: null }, data });

  it("writeAudit accepts provider ids, still refuses phone numbers and look-alikes", async () => {
    for (const id of [DIGIT_RUN_ID, "pho_att_0123456789012345678901", "pho_evt_9999999999999999999999zz"]) await expect(write({ provider_message_id: id }), id).resolves.toBeUndefined();
    for (const bad of ["12065550100", "pho_msg_+00000000000xxxxxxxxx", "PHO_MSG_01M5512345678E7F6G5H4J3KM2", "pho_msg_short1234567", "x_msg_01m5512345678e7f6g5h4j3km2 2065550100"]) {
      await expect(write({ provider_message_id: bad }), bad).rejects.toThrow();
    }
  });
  it("recordInboundMessage stores and dedupes such an id instead of throwing", async () => {
    const first = await recordInboundMessage("photon", DIGIT_RUN_ID, { sender_handle: "stranger@example.invalid", text: "YES K7M3", attachments: [] }, w.deps());
    expect(first.status).toBe("first");
    expect((await recordInboundMessage("photon", DIGIT_RUN_ID, {}, w.deps())).status).toBe("duplicate");
  });
  it("a claim whose source_event_id is such an id is audited with it", async () => {
    const id = await makeEligibleDonation(w);
    const created = await createNextOffers({ donation_id: id }, w.deps());
    const offer = created.ok ? created.data[0]! : (undefined as never);
    await openOfferForSend({ offer_id: offer.id }, w.deps());
    const r = await claimOffer({ offer_ref: { offer_id: offer.id }, actor: courierActor(), source: "messaging", source_event_id: DIGIT_RUN_ID }, w.deps(at(0.2)));
    expect(r.code).toBe("claimed");
    const [event] = (await w.db.select().from(audit_events).where(eq(audit_events.donation_id, id))).filter((e) => e.type === "claim.accepted");
    expect(event!.data).toMatchObject({ source_event_id: DIGIT_RUN_ID });
  });
});

describe("claim audit and the donor's view of the timeline", () => {
  async function claimed(sourceEventId: string | null) {
    const id = await makeEligibleDonation(w);
    const created = await createNextOffers({ donation_id: id }, w.deps());
    const offer = created.ok ? created.data[0]! : (undefined as never);
    await openOfferForSend({ offer_id: offer.id }, w.deps());
    const r = await claimOffer({ offer_ref: { offer_id: offer.id }, actor: courierActor(), source: "messaging", source_event_id: sourceEventId }, w.deps(at(0.2)));
    expect(r.code).toBe("claimed");
    return id;
  }
  it.each(["call me +1 206 555 0100", "x".repeat(200), "has space", "courier-a@example.invalid"])("a source_event_id that is not a plain token (%j) is not stored", async (bad) => {
    const id = await claimed(bad);
    const ev = (await w.db.select().from(audit_events).where(eq(audit_events.donation_id, id))).find((e) => e.type === "claim.accepted")!;
    expect((ev.data as { source_event_id: unknown }).source_event_id).toBeNull();
    expect(JSON.stringify(ev)).not.toContain("555");
  });
  it("a plain source_event_id is kept", async () => {
    const id = await claimed("evt-123_abc");
    const ev = (await w.db.select().from(audit_events).where(eq(audit_events.donation_id, id))).find((e) => e.type === "claim.accepted")!;
    expect((ev.data as { source_event_id: string }).source_event_id).toBe("evt-123_abc");
  });
  it("the owning donor sees that the claim happened but not the courier's id; the operator sees everything", async () => {
    const id = await claimed("evt-1");
    const donor = await getDonationCard(donorActor(), id, w.deps(at(1)));
    const op = await getDonationCard(operatorActor, id, w.deps(at(1)));
    const donorClaim = donor.ok ? donor.data.timeline.find((e) => e.type === "claim.accepted")! : undefined;
    const opClaim = op.ok ? op.data.timeline.find((e) => e.type === "claim.accepted")! : undefined;
    expect(donorClaim).toBeDefined();
    expect(donorClaim!.actor.id).toBeNull();
    expect(donorClaim!.data).toEqual({});
    expect(JSON.stringify(donor)).not.toContain(COURIER_A);
    expect(opClaim!.actor.id).toBe(COURIER_A);
    expect(opClaim!.data).toMatchObject({ source: "messaging", source_event_id: "evt-1" });
    // the donor's own events keep their actor
    expect(donor.ok && donor.data.timeline.find((e) => e.type === "donation.created")!.actor.id).toBe(DONOR);
  });
});

describe("listMessages masks draft_ready tokens unless BOTH the active provider and the identity are fake", () => {
  const TOKEN = "B".repeat(39) + "WXYZ";
  async function thread(deps: Deps) {
    const [fake] = await w.db.select().from(messaging_identities).where(eq(messaging_identities.id, IDENTITY.donor));
    await recordOutboundMessage({ message: { to_identity_id: fake!.id, text: `link: https://app.example.invalid/v#${TOKEN}`, purpose: "draft_ready", correlation: {}, idempotency_key: `k-${randomUUID()}` }, provider_message_id: "pm" }, w.deps());
    return (await listMessages({ identity_id: fake!.id }, deps))[0]!.text;
  }
  it("fake identity with fake messaging shows the working link (the simulated phone needs it)", async () => {
    expect(await thread(w.deps())).toContain(TOKEN);
  });
  it("the same fake identity is masked when the active provider is the real one", async () => {
    const text = await thread({ ...w.deps(), messaging: { mode: "real" } } as unknown as Deps);
    expect(text).not.toContain(TOKEN);
    expect(text).toContain("#…WXYZ");
  });
});

describe("recordIgnoredInbound always keeps at most the last 4 characters", () => {
  it.each(["a@b.co", "12345678", "short", "stranger@example.invalid"])("a raw %j is masked, never stored as given", async (raw) => {
    const id = `m-${randomUUID()}`;
    await recordIgnoredInbound({ provider: "fake", provider_message_id: id, reason: "unknown_sender", handle_masked: raw }, w.deps());
    const row = (await w.db.select().from(inbound_messages).where(eq(inbound_messages.provider_message_id, id)))[0]!;
    expect(row.handle_masked).not.toBe(raw);
    expect(row.handle_masked!.length).toBeLessThanOrEqual(8);
    expect(JSON.stringify(await w.db.select().from(audit_events).where(eq(audit_events.type, "inbound.ignored")))).not.toContain(raw);
  });
  it.each(["***alid", "***1234", "****"])("an already masked %j is kept", async (masked) => {
    const id = `m-${randomUUID()}`;
    await recordIgnoredInbound({ provider: "fake", provider_message_id: id, reason: "not_joined", handle_masked: masked }, w.deps());
    expect((await w.db.select().from(inbound_messages).where(eq(inbound_messages.provider_message_id, id)))[0]!.handle_masked).toBe(masked);
  });
});

describe("stranger-controlled strings are bounded", () => {
  it("a provider message or event id over 128 characters is refused", async () => {
    await expect(recordInboundMessage("fake", "m".repeat(129), {}, w.deps())).rejects.toThrow();
    await expect(recordInboundMessage("fake", "ok-id", { provider_event_id: "e".repeat(129) }, w.deps())).rejects.toThrow();
  });
  it("an oversized payload from a known sender is not stored (the row still exists)", async () => {
    const id = `m-${randomUUID()}`;
    const r = await recordInboundMessage("fake", id, { sender_handle: "courier-a@example.invalid", text: "x".repeat(70_000), attachments: [] }, w.deps());
    expect(r.status).toBe("first");
    const row = (await w.db.select().from(inbound_messages).where(eq(inbound_messages.provider_message_id, id)))[0]!;
    expect(row.payload).toBeNull();
  });
  it("a provider message id on an offer must look like an id, and cannot be reused by another offer", async () => {
    const d1 = await insertDonation(w.db, { status: "offered" });
    const d2 = await insertDonation(w.db, { status: "offered" });
    const a = await insertOffer(w.db, d1.id, { courier_id: COURIER_A, status: "open" });
    const b = await insertOffer(w.db, d2.id, { courier_id: IDENTITY ? "00000000-0000-4000-8000-000000000032" : "", status: "open" });
    for (const bad of ["has space", "x".repeat(129), "tab\there", "newline\n"]) {
      expect(await recordOfferProviderMessage({ offer_id: a.id, provider_message_id: bad }, w.deps()), JSON.stringify(bad)).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    }
    expect((await recordOfferProviderMessage({ offer_id: a.id, provider_message_id: "pm-shared-1" }, w.deps())).ok).toBe(true);
    expect(await recordOfferProviderMessage({ offer_id: b.id, provider_message_id: "pm-shared-1" }, w.deps())).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });
});

describe("a delivery event only touches an offer of its own provider", () => {
  it("a photon event cannot advance a fake-provider offer, nor the other way round", async () => {
    const d = await insertDonation(w.db, { status: "offered" });
    const fakeOffer = await insertOffer(w.db, d.id, { courier_id: COURIER_A, status: "open", provider_message_id: "pm-x", provider_mode: "fake" });
    const evt = (provider: "photon" | "fake") => ({ provider, provider_event_id: `e-${randomUUID()}`, provider_message_id: "pm-x", status: "delivered" as const, failure_code: null, at: T0.toISOString() });
    expect(await recordDeliveryStatus(evt("photon"), w.deps())).toEqual({ ok: true, data: { offer_id: null, offer_status: null } });
    expect((await w.db.select().from(offers).where(eq(offers.id, fakeOffer.id)))[0]!.delivery_status).toBe("unknown");
    expect(await recordDeliveryStatus(evt("fake"), w.deps())).toMatchObject({ ok: true, data: { offer_id: fakeOffer.id } });
    expect((await w.db.select().from(offers).where(eq(offers.id, fakeOffer.id)))[0]!.delivery_status).toBe("delivered");
  });
});

describe("a malformed id is a plain not-found, never a thrown driver error that echoes SQL", () => {
  const w_ = () => w.deps();
  it.each(NOT_A_UUID)("%j", async (bad) => {
    const empty = { offer_id: null, donation_id: null, donation_status: null, assignment: null };
    expect(await getDonationCard(operatorActor, bad, w_())).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await claimOffer({ offer_ref: { offer_id: bad }, actor: courierActor(), source: "messaging", source_event_id: null }, w_())).toMatchObject({ code: "offer_not_found", ...empty });
    expect(await declineOffer({ offer_ref: { offer_id: bad }, actor: courierActor(), source: "messaging", source_event_id: null }, w_())).toMatchObject({ code: "offer_not_found" });
    expect(await openOfferForSend({ offer_id: bad }, w_())).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await markOfferSendFailed({ offer_id: bad, reason: "X" }, w_())).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await recordOfferProviderMessage({ offer_id: bad, provider_message_id: "pm" }, w_())).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await createNextOffers({ donation_id: bad }, w_())).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await submitVerification({ auth: { actor: donorActor() }, donation_id: bad, facts: factsAt(), edited_from_ai: [] }, w_())).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await attachAiResult({ donation_id: bad, result: { ok: false, error_code: "X" } }, w_())).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await createDraft({ actor: donorActor(), image_id: bad, source: "web_upload", source_ref: null }, w_())).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await getIdentity(bad, w_())).toBeNull();
    expect(await joinIdentity({ identity_id: bad, provider_space_id: null, provider_sender_id: null }, w_())).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await optOutIdentity({ identity_id: bad }, w_())).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await findOpenOffersForCourier(bad, w_())).toEqual([]);
    expect(await listMessages({ identity_id: bad }, w_())).toEqual([]);
  });
});

describe("a photo must really be the type it claims (storeDonationImage)", () => {
  const store = (mime: string, bytes: Uint8Array) => storeDonationImage({ mime, bytes }, w.deps());
  it("accepts a PNG, a JPEG and a WebP whose first bytes match", async () => {
    expect((await store("image/png", PNG_BYTES)).ok).toBe(true);
    expect((await store("image/jpeg", JPEG_BYTES)).ok).toBe(true);
    expect((await store("image/webp", WEBP_BYTES)).ok).toBe(true);
  });
  it("refuses a mismatch, plain text, HTML or an executable labelled as an image", async () => {
    const text = (s: string) => new TextEncoder().encode(s);
    const bad: Array<[string, Uint8Array]> = [
      ["image/png", JPEG_BYTES], ["image/jpeg", PNG_BYTES], ["image/webp", PNG_BYTES], ["image/png", WEBP_BYTES],
      ["image/png", text("<script>alert(1)</script>")], ["image/jpeg", text("MZ\u0090\u0000 not really a photo")], ["image/png", new Uint8Array([1, 2, 3, 4])],
      ["image/webp", text("RIFF....AVI ")], ["image/png", PNG_BYTES.slice(0, 4)],
    ];
    for (const [mime, bytes] of bad) expect(await store(mime, bytes), mime).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });
});

describe("createDraft does not say whose photo it is", () => {
  it("the conflict message for a reference that belongs to another donor is generic", async () => {
    const ref = `fake:${randomUUID()}`;
    const img = await storeDonationImage({ mime: "image/png", bytes: PNG_BYTES }, w.deps());
    const imgId = img.ok ? img.data.image_id : "";
    await createDraft({ actor: donorActor(), image_id: imgId, source: "messaging", source_ref: ref }, w.deps());
    const r = await createDraft({ actor: donorActor("00000000-0000-4000-8000-000000000012"), image_id: imgId, source: "messaging", source_ref: ref }, w.deps());
    expect(r).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(JSON.stringify(r)).not.toMatch(/another donation|belongs/i);
  });
});
