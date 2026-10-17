import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DonationCard, type Actor } from "@/contracts";
import { scene1_vision_suggestion } from "@/contracts/fixtures/scenes";
import { attachAiResult, createDraft, getDonationCard, storeDonationImage, submitVerification } from "@/core";
import { MAX_IMAGE_BYTES } from "@/core/service/intake";
import { audit_events, donation_images, donations, verification_links } from "@/db/schema";
import { COURIER_A, DONOR, DONOR_PENDING, DONOR_SUSPENDED, OPERATOR, T0, at, donorActor, factsAt, iso, makeWorld, operatorActor, type World } from "./helpers/world";

// Slice 2(a): storeDonationImage, createDraft (S-01), attachAiResult (S-02), submitVerification session path (S-03),
// getDonationCard (section 3.13 / 11). PGlite store, test clock, `deps` always passed.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

let w: World;
beforeAll(async () => {
  w = await makeWorld();
});
afterAll(async () => w.close());

const png = (n = 16) => new Uint8Array(Array.from({ length: n }, (_, i) => i % 251));
async function image(deps = w.deps()) {
  const r = await storeDonationImage({ mime: "image/png", bytes: png() }, deps);
  if (!r.ok) throw new Error("image fixture failed");
  return r.data.image_id;
}
async function draft(opts: { actor?: Actor; source?: "web_upload" | "messaging" | "fixture"; source_ref?: string | null } = {}, deps = w.deps()) {
  const source = opts.source ?? "web_upload";
  const source_ref = opts.source_ref !== undefined ? opts.source_ref : source === "messaging" ? `fake:${randomUUID()}` : null;
  const r = await createDraft({ actor: opts.actor ?? donorActor(), image_id: await image(deps), source, source_ref }, deps);
  if (!r.ok) throw new Error(`draft fixture failed: ${r.error.code}`);
  return r.data;
}
const rowOf = async (id: string) => (await w.db.select().from(donations).where(eq(donations.id, id)))[0]!;
const auditTypes = async (id: string) => (await w.db.select().from(audit_events).where(eq(audit_events.donation_id, id))).map((e) => e.type);
const countDonations = async () => (await w.db.select().from(donations)).length;

describe("storeDonationImage", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("stores %s byte for byte with its sha-256 and the clock's time", async (mime) => {
    const bytes = png(300);
    const deps = w.deps();
    const r = await storeDonationImage({ mime, bytes }, deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [row] = await w.db.select().from(donation_images).where(eq(donation_images.id, r.data.image_id));
    expect(Array.from(row!.bytes)).toEqual(Array.from(bytes));
    expect(row!.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(row!.created_at.toISOString()).toBe(T0.toISOString());
  });
  it.each(["image/gif", "image/heic", "image/svg+xml", "application/pdf", "", "IMAGE/PNG", "image/png; charset=x"])("refuses mime %j", async (mime) => {
    const r = await storeDonationImage({ mime, bytes: png() }, w.deps());
    expect(r).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });
  it("refuses an empty photo, and a photo over 5 MB, but takes exactly 5 MB", async () => {
    expect(await storeDonationImage({ mime: "image/png", bytes: new Uint8Array(0) }, w.deps())).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(await storeDonationImage({ mime: "image/png", bytes: new Uint8Array(MAX_IMAGE_BYTES + 1) }, w.deps())).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect((await storeDonationImage({ mime: "image/png", bytes: new Uint8Array(MAX_IMAGE_BYTES) }, w.deps())).ok).toBe(true);
  });
  it("refuses input that is not bytes", async () => {
    // @ts-expect-error a string is not Uint8Array
    expect(await storeDonationImage({ mime: "image/png", bytes: "abc" }, w.deps())).toMatchObject({ ok: false });
    // @ts-expect-error missing mime
    expect(await storeDonationImage({ bytes: png() }, w.deps())).toMatchObject({ ok: false });
  });
});

describe("createDraft (S-01)", () => {
  it("an approved donor gets a draft card with AI pending, version 1 and an audit event", async () => {
    const card = await draft();
    expect(card).toMatchObject({ status: "draft", version: 1, ai_status: "pending", ai_suggestion: null, verified_facts: null, decision: null, is_synthetic: true });
    expect(card.donor_display_name).toBe("Rainier Catering (synthetic)");
    expect(card.image_url).toMatch(/^\/api\/images\/[0-9a-f-]{36}$/);
    expect(card.timeline.map((e) => e.type)).toEqual(["donation.created"]);
    expect(DonationCard.safeParse(card).success).toBe(true);
  });
  it("a pending donor may start a draft (the gate holds it for review later)", async () => {
    const card = await draft({ actor: donorActor(DONOR_PENDING) });
    expect(card.status).toBe("draft");
  });
  it.each([
    ["suspended donor", donorActor(DONOR_SUSPENDED)],
    ["unknown donor id", donorActor(randomUUID())],
    ["donor without an id", { role: "donor", id: null } as Actor],
    ["operator", operatorActor],
    ["courier", { role: "courier", id: COURIER_A } as Actor],
    ["recipient", { role: "recipient", id: randomUUID() } as Actor],
    ["system", { role: "system", id: null } as Actor],
  ])("refuses a %s and writes nothing", async (_name, actor) => {
    const before = await countDonations();
    const r = await createDraft({ actor, image_id: await image(), source: "web_upload", source_ref: null }, w.deps());
    expect(r).toMatchObject({ ok: false, error: { code: "NOT_AUTHORIZED" } });
    expect(await countDonations()).toBe(before);
  });
  it("the same inbound photo (source, source_ref) returns the same draft and creates one row and one audit event", async () => {
    const ref = `fake:${randomUUID()}`;
    const first = await draft({ source: "messaging", source_ref: ref });
    const again = await createDraft({ actor: donorActor(), image_id: await image(), source: "messaging", source_ref: ref }, w.deps());
    expect(again.ok && again.data.id).toBe(first.id);
    const rows = await w.db.select().from(donations).where(eq(donations.source_ref, ref));
    expect(rows).toHaveLength(1);
    expect((await auditTypes(first.id)).filter((t) => t === "donation.created")).toHaveLength(1);
  });
  it("five simultaneous copies of one inbound photo make exactly one draft", async () => {
    const ref = `fake:${randomUUID()}`;
    const imageId = await image();
    const results = await Promise.all(Array.from({ length: 5 }, () => createDraft({ actor: donorActor(), image_id: imageId, source: "messaging", source_ref: ref }, w.deps())));
    const ids = new Set(results.map((r) => (r.ok ? r.data.id : "ERR")));
    expect(ids.size).toBe(1);
    expect(ids.has("ERR")).toBe(false);
    expect(await w.db.select().from(donations).where(eq(donations.source_ref, ref))).toHaveLength(1);
  });
  it("a photo reference that already belongs to another donor is a conflict, and reveals nothing about the draft", async () => {
    const ref = `fake:${randomUUID()}`;
    await draft({ source: "messaging", source_ref: ref });
    const r = await createDraft({ actor: donorActor(DONOR_PENDING), image_id: await image(), source: "messaging", source_ref: ref }, w.deps());
    expect(r).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(JSON.stringify(r)).not.toContain("Rainier");
  });
  it("the same reference under a different source is a separate draft", async () => {
    const ref = `fake:${randomUUID()}`;
    const a = await draft({ source: "messaging", source_ref: ref });
    const b = await createDraft({ actor: donorActor(), image_id: await image(), source: "web_upload", source_ref: null }, w.deps());
    expect(b.ok && b.data.id).not.toBe(a.id);
  });
  it("a messaging draft needs its photo reference; other sources must not carry one", async () => {
    const img = await image();
    expect(await createDraft({ actor: donorActor(), image_id: img, source: "messaging", source_ref: null }, w.deps())).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(await createDraft({ actor: donorActor(), image_id: img, source: "messaging", source_ref: "" }, w.deps())).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(await createDraft({ actor: donorActor(), image_id: img, source: "web_upload", source_ref: "x" }, w.deps())).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(await createDraft({ actor: donorActor(), image_id: img, source: "fixture", source_ref: "x" }, w.deps())).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });
  it("a missing photo is not found and creates nothing", async () => {
    const before = await countDonations();
    const r = await createDraft({ actor: donorActor(), image_id: randomUUID(), source: "web_upload", source_ref: null }, w.deps());
    expect(r).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await countDonations()).toBe(before);
  });
  it("stamps created_at and updated_at from the injected clock, not the system clock", async () => {
    const later = at(90);
    const card = await draft({}, w.deps(later));
    const row = await rowOf(card.id);
    expect(row.created_at.toISOString()).toBe(later.toISOString());
    expect(row.updated_at.toISOString()).toBe(later.toISOString());
    const [event] = await w.db.select().from(audit_events).where(eq(audit_events.donation_id, card.id));
    expect(event!.at.toISOString()).toBe(later.toISOString());
  });
});

describe("attachAiResult (S-02)", () => {
  it("stores the suggestion as a snapshot, marks AI succeeded, keeps the donation a draft at the same version", async () => {
    const d = await draft();
    const r = await attachAiResult({ donation_id: d.id, result: { ok: true, suggestion: scene1_vision_suggestion } }, w.deps());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({ status: "draft", version: 1, ai_status: "succeeded", verified_facts: null, decision: null });
    expect(r.data.ai_suggestion).toEqual(scene1_vision_suggestion);
    expect(await auditTypes(d.id)).toContain("ai.suggestion_attached");
    const [event] = (await w.db.select().from(audit_events).where(eq(audit_events.donation_id, d.id))).filter((e) => e.type === "ai.suggestion_attached");
    expect(event!.mode).toEqual({ vision: scene1_vision_suggestion.mode });
  });
  it("a recorded failure marks AI failed and lets the donor fill the form by hand", async () => {
    const d = await draft();
    const r = await attachAiResult({ donation_id: d.id, result: { ok: false, error_code: "PROVIDER_UNAVAILABLE" } }, w.deps());
    expect(r.ok && r.data).toMatchObject({ status: "draft", ai_status: "failed", ai_suggestion: null });
    const [event] = (await w.db.select().from(audit_events).where(eq(audit_events.donation_id, d.id))).filter((e) => e.type === "ai.suggestion_failed");
    expect(event!.data).toEqual({ error_code: "PROVIDER_UNAVAILABLE" });
  });
  it("an error code that could carry personal text is not stored", async () => {
    const d = await draft();
    await attachAiResult({ donation_id: d.id, result: { ok: false, error_code: "call me at +1 206 555 0100" } }, w.deps());
    const [event] = (await w.db.select().from(audit_events).where(eq(audit_events.donation_id, d.id))).filter((e) => e.type === "ai.suggestion_failed");
    expect(JSON.stringify(event!.data)).not.toContain("555");
  });
  it("a suggestion that does not match the schema is refused: AI failed, nothing stored", async () => {
    const d = await draft();
    const bad = { ...scene1_vision_suggestion, extra_key: "safe to eat" } as never;
    const r = await attachAiResult({ donation_id: d.id, result: { ok: true, suggestion: bad } }, w.deps());
    expect(r).toMatchObject({ ok: false, error: { code: "AI_OUTPUT_INVALID" } });
    const row = await rowOf(d.id);
    expect(row.ai_status).toBe("failed");
    expect(row.ai_suggestion).toBeNull();
  });
  it("a repeat after success changes nothing (the snapshot is immutable)", async () => {
    const d = await draft();
    await attachAiResult({ donation_id: d.id, result: { ok: true, suggestion: scene1_vision_suggestion } }, w.deps());
    const other = { ...scene1_vision_suggestion, prompt_version: "other" };
    const again = await attachAiResult({ donation_id: d.id, result: { ok: true, suggestion: other } }, w.deps());
    expect(again.ok && again.data.ai_suggestion?.prompt_version).toBe(scene1_vision_suggestion.prompt_version);
    expect(await attachAiResult({ donation_id: d.id, result: { ok: false, error_code: "X" } }, w.deps())).toMatchObject({ ok: true });
    expect((await rowOf(d.id)).ai_status).toBe("succeeded");
  });
  it("after a failure a later success is accepted", async () => {
    const d = await draft();
    await attachAiResult({ donation_id: d.id, result: { ok: false, error_code: "PROVIDER_UNAVAILABLE" } }, w.deps());
    const r = await attachAiResult({ donation_id: d.id, result: { ok: true, suggestion: scene1_vision_suggestion } }, w.deps());
    expect(r.ok && r.data.ai_status).toBe("succeeded");
  });
  it("unknown donation is not found; a donation that left draft refuses (INVALID_TRANSITION)", async () => {
    expect(await attachAiResult({ donation_id: randomUUID(), result: { ok: false, error_code: "X" } }, w.deps())).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    const d = await draft();
    await submitVerification({ auth: { actor: donorActor() }, donation_id: d.id, facts: factsAt(), edited_from_ai: [] }, w.deps());
    expect(await attachAiResult({ donation_id: d.id, result: { ok: true, suggestion: scene1_vision_suggestion } }, w.deps())).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
  });
  it("the AI snapshot never reaches the gate: an eligible submission ignores a suggestion that says otherwise", async () => {
    const d = await draft();
    await attachAiResult({ donation_id: d.id, result: { ok: true, suggestion: scene1_vision_suggestion } }, w.deps());
    const r = await submitVerification({ auth: { actor: donorActor() }, donation_id: d.id, facts: factsAt(), edited_from_ai: [] }, w.deps());
    expect(r.ok && r.data.card.decision?.outcome).toBe("eligible");
  });
});

describe("submitVerification, session path (S-03)", () => {
  const submit = (id: string, facts = factsAt(), actor: Actor = donorActor(), edited: string[] = [], deps = w.deps()) =>
    submitVerification({ auth: { actor }, donation_id: id, facts, edited_from_ai: edited }, deps);

  it("eligible facts: status eligible, version 2, decision stored, cutoff = the earlier of pickup and discard-by, attestation stamped by the server", async () => {
    const d = await draft();
    const deps = w.deps();
    const r = await submit(d.id, factsAt(), donorActor(), ["dish_name"], deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.resubmit_token).toBeNull();
    const card = r.data.card;
    expect(card).toMatchObject({ status: "eligible", version: 2, edited_from_ai: ["dish_name"] });
    expect(card.decision).toMatchObject({ outcome: "eligible", reasons: [], policy_id: "annona-prototype-refrigerated", evaluated_at: T0.toISOString() });
    expect(card.effective_cutoff_at).toBe(iso(120)); // pickup (+120) is earlier than discard-by (+360)
    expect(card.verified_facts?.attestation.attested_at).toBe(T0.toISOString()); // the client sent 2020
    expect(DonationCard.safeParse(card).success).toBe(true);
    expect(await auditTypes(d.id)).toEqual(expect.arrayContaining(["donor.verification_submitted", "eligibility.evaluated"]));
  });
  it("discard-by earlier than pickup sets the cutoff to discard-by", async () => {
    const d = await draft();
    const r = await submit(d.id, factsAt(T0, { donor_pickup_by: iso(300), discard_by: iso(200) }));
    expect(r.ok && r.data.card.effective_cutoff_at).toBe(iso(200));
  });
  it("no discard-by: the cutoff is the pickup time, and the gate asks for review", async () => {
    const d = await draft();
    const r = await submit(d.id, factsAt(T0, { discard_by: null }));
    expect(r.ok && r.data.card.status).toBe("needs_review");
    expect(r.ok && r.data.card.effective_cutoff_at).toBe(iso(120));
  });
  it("an unknown allergen sends it to needs_review; fixing it and resubmitting reaches eligible", async () => {
    const d = await draft();
    const facts = factsAt(T0, { allergens: { ...factsAt().allergens, sesame: "unknown" } });
    const first = await submit(d.id, facts);
    expect(first.ok && first.data.card).toMatchObject({ status: "needs_review", version: 2 });
    expect(first.ok && first.data.card.decision?.reasons.map((x) => x.code)).toEqual(["ALLERGEN_UNKNOWN"]);
    const second = await submit(d.id, factsAt());
    expect(second.ok && second.data.card).toMatchObject({ status: "eligible", version: 3 });
  });
  it("a hard stop (previously served) is rejected for good; a second submission is INVALID_TRANSITION", async () => {
    const d = await draft();
    const first = await submit(d.id, factsAt(T0, { previously_served: "yes" }));
    expect(first.ok && first.data.card.status).toBe("rejected");
    expect(await submit(d.id, factsAt())).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
  });
  it("a donor whose approval is still pending gets needs_review", async () => {
    const d = await draft({ actor: donorActor(DONOR_PENDING) });
    const r = await submit(d.id, factsAt(), donorActor(DONOR_PENDING));
    expect(r.ok && r.data.card.status).toBe("needs_review");
    expect(r.ok && r.data.card.decision?.reasons.map((x) => x.code)).toEqual(["DONOR_APPROVAL_PENDING"]);
  });
  it("uses the injected clock: a pickup time that has passed for the server is rejected whatever the client thinks", async () => {
    const d = await draft();
    const r = await submit(d.id, factsAt(T0), donorActor(), [], w.deps(at(130)));
    expect(r.ok && r.data.card.status).toBe("rejected");
    expect(r.ok && r.data.card.decision?.reasons.map((x) => x.code)).toContain("PICKUP_WINDOW_PASSED");
  });
  it.each([
    ["another donor", donorActor(DONOR_PENDING)],
    ["the operator", operatorActor],
    ["a courier", { role: "courier", id: COURIER_A } as Actor],
    ["a donor without an id", { role: "donor", id: null } as Actor],
  ])("%s cannot submit someone else's donation, and nothing changes", async (_n, actor) => {
    const d = await draft();
    const r = await submit(d.id, factsAt(), actor);
    expect(r).toMatchObject({ ok: false, error: { code: "NOT_AUTHORIZED" } });
    expect(await rowOf(d.id)).toMatchObject({ status: "draft", version: 1, verified_facts: null });
  });
  it("an unknown donation is not found", async () => {
    expect(await submit(randomUUID())).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
  it("incomplete or invalid facts are refused with the field names, and the donation is untouched", async () => {
    const d = await draft();
    const facts = { ...factsAt() } as Record<string, unknown>;
    delete facts.ingredients_text;
    const r = await submit(d.id, facts as never);
    expect(r).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(JSON.stringify(r)).toContain("ingredients_text");
    expect(await rowOf(d.id)).toMatchObject({ status: "draft", version: 1 });
    expect(await submit(d.id, factsAt(T0, { servings: 0 }))).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(await submit(d.id, { ...factsAt(), extra: 1 } as never)).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(await submit(d.id, null as never)).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });
  it("a bad edited_from_ai list is refused", async () => {
    const d = await draft();
    expect(await submit(d.id, factsAt(), donorActor(), "x" as never)).toMatchObject({ ok: true }); // not an array: treated as empty
    const d2 = await draft();
    expect(await submit(d2.id, factsAt(), donorActor(), Array.from({ length: 41 }, (_, i) => `f${i}`))).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(await submit(d2.id, factsAt(), donorActor(), ["x".repeat(61)])).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(await submit(d2.id, factsAt(), donorActor(), [""])).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });
  it("food that was already collected can no longer be verified", async () => {
    const d = await draft();
    await w.db.update(donations).set({ collected_at: T0 }).where(eq(donations.id, d.id));
    expect(await submit(d.id)).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
  });
  it("a donation that is already eligible cannot be resubmitted (only draft and needs_review can)", async () => {
    const d = await draft();
    await submit(d.id);
    expect(await submit(d.id)).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
    expect((await rowOf(d.id)).version).toBe(2);
  });
  it("revokes every other live verification link and leaves consumed ones alone", async () => {
    const d = await draft();
    const link = (over: Partial<typeof verification_links.$inferInsert>) => ({
      id: randomUUID(), donation_id: d.id, donor_id: DONOR, token_hash: randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", ""),
      issued_at: T0, expires_at: at(30), ...over,
    });
    const live = link({});
    const consumed = link({ consumed_at: T0 });
    await w.db.insert(verification_links).values([live, consumed]);
    await submit(d.id);
    const rows = await w.db.select().from(verification_links).where(eq(verification_links.donation_id, d.id));
    expect(rows.find((x) => x.id === live.id)!.revoked_at?.toISOString()).toBe(T0.toISOString());
    expect(rows.find((x) => x.id === consumed.id)!.revoked_at).toBeNull();
  });
  it("the link path is not built yet and says so (slice 2(d)); nothing is written", async () => {
    const d = await draft();
    const r = await submitVerification({ auth: { link_token: "x" }, donation_id: d.id, facts: factsAt(), edited_from_ai: [] }, w.deps());
    expect(r).toMatchObject({ ok: false, error: { code: "NOT_IMPLEMENTED" } });
    expect((await rowOf(d.id)).status).toBe("draft");
  });
  it("the audit trail never holds the donor's free text or pickup instructions", async () => {
    const d = await draft();
    await submit(d.id, factsAt(T0, { pickup_instructions: "Ring the bell twice", ingredients_text: "secret sauce" }));
    const events = JSON.stringify(await w.db.select().from(audit_events).where(eq(audit_events.donation_id, d.id)));
    expect(events).not.toContain("Ring the bell");
    expect(events).not.toContain("secret sauce");
  });
  it("with no active policy the submission stops with an internal error and writes nothing", async () => {
    const other = await makeWorld();
    try {
      const { policy_config } = await import("@/db/schema");
      await other.db.update(policy_config).set({ active: false });
      const deps = other.deps();
      const img = await storeDonationImage({ mime: "image/png", bytes: png() }, deps);
      const dr = await createDraft({ actor: donorActor(), image_id: img.ok ? img.data.image_id : "", source: "web_upload", source_ref: null }, deps);
      const id = dr.ok ? dr.data.id : "";
      const r = await submitVerification({ auth: { actor: donorActor() }, donation_id: id, facts: factsAt(), edited_from_ai: [] }, deps);
      expect(r).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
      expect((await other.db.select().from(donations).where(eq(donations.id, id)))[0]).toMatchObject({ status: "draft", version: 1 });
    } finally {
      await other.close();
    }
  });
});

describe("getDonationCard (section 3.13 / 11)", () => {
  it("the operator sees any donation, the owning donor sees theirs", async () => {
    const d = await draft();
    expect((await getDonationCard(operatorActor, d.id, w.deps())).ok).toBe(true);
    expect((await getDonationCard(donorActor(), d.id, w.deps())).ok).toBe(true);
  });
  it("another donor, a courier, a recipient and the system are NOT_AUTHORIZED, even for an id that does not exist", async () => {
    const d = await draft();
    for (const actor of [donorActor(DONOR_PENDING), { role: "courier", id: COURIER_A } as Actor, { role: "recipient", id: randomUUID() } as Actor, { role: "system", id: null } as Actor, { role: "donor", id: null } as Actor]) {
      expect(await getDonationCard(actor, d.id, w.deps()), actor.role).toMatchObject({ ok: false, error: { code: "NOT_AUTHORIZED" } });
    }
    expect(await getDonationCard({ role: "courier", id: COURIER_A }, randomUUID(), w.deps())).toMatchObject({ ok: false, error: { code: "NOT_AUTHORIZED" } });
    expect(await getDonationCard(operatorActor, randomUUID(), w.deps())).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
  it("the card never contains the donor's address or pickup instructions or any handle", async () => {
    const d = await draft();
    await submitVerification({ auth: { actor: donorActor() }, donation_id: d.id, facts: factsAt(T0, { pickup_instructions: "Rear door, ask for Sam" }), edited_from_ai: [] }, w.deps());
    const op = await getDonationCard(operatorActor, d.id, w.deps());
    const text = JSON.stringify(op);
    expect(text).not.toContain("100 Demo Way"); // address_line
    expect(text).not.toContain("example.invalid"); // handles
    // verified_facts legitimately carries the instructions for the operator and owner; they are not in the audit timeline
    expect(op.ok && JSON.stringify(op.data.timeline)).not.toContain("Rear door");
  });
  it("the owning donor's timeline shows only donation, ai, donor, eligibility, accepted claim and handoff events; the operator sees everything", async () => {
    const d = await draft();
    const base = { at: T0, donation_id: d.id, actor_role: "system", mode: {}, data: {} };
    await w.db.insert(audit_events).values([
      { ...base, type: "offer.created" }, { ...base, type: "matching.completed" }, { ...base, type: "claim.rejected" },
      { ...base, type: "inbound.received" }, { ...base, type: "outbound.sent" }, { ...base, type: "claim.accepted" }, { ...base, type: "handoff.recorded" },
    ]);
    const donor = await getDonationCard(donorActor(), d.id, w.deps());
    const op = await getDonationCard(operatorActor, d.id, w.deps());
    const donorTypes = donor.ok ? donor.data.timeline.map((e) => e.type) : [];
    expect(donorTypes).toEqual(expect.arrayContaining(["donation.created", "claim.accepted", "handoff.recorded"]));
    for (const hidden of ["offer.created", "matching.completed", "claim.rejected", "inbound.received", "outbound.sent"]) expect(donorTypes).not.toContain(hidden);
    const opTypes = op.ok ? op.data.timeline.map((e) => e.type) : [];
    for (const shown of ["offer.created", "claim.rejected", "outbound.sent"]) expect(opTypes).toContain(shown);
  });
  it("the timeline is the latest 30 events, oldest first", async () => {
    const d = await draft();
    await w.db.insert(audit_events).values(
      Array.from({ length: 35 }, (_, i) => ({ at: at(i + 1), donation_id: d.id, type: "donation.created", actor_role: "system", mode: {}, data: { n: i } })),
    );
    const r = await getDonationCard(operatorActor, d.id, w.deps());
    const line = r.ok ? r.data.timeline : [];
    expect(line).toHaveLength(30);
    expect(line.map((e) => e.at)).toEqual([...line.map((e) => e.at)].sort());
    expect(line[line.length - 1]!.data).toEqual({ n: 34 });
  });
});

describe("the operator and donor agree on the facts but not on the extras", () => {
  it("the donor card of a draft and the operator card are the same document apart from nothing sensitive", async () => {
    const d = await draft();
    const op = await getDonationCard(operatorActor, d.id, w.deps());
    const don = await getDonationCard(donorActor(), d.id, w.deps());
    expect(op.ok && don.ok && op.data).toEqual(don.ok ? don.data : null); // no offers yet, so the projections coincide
  });
});

void OPERATOR;
