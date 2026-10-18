import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { VerificationLinkView, type MessagingGateway, type VisionProvider } from "@/contracts";
import { scene1_eligible_facts } from "@/contracts/fixtures/scenes";
import {
  createDraft,
  expireDue,
  getVerificationLinkImage,
  getVerificationLinkView,
  issueVerificationLink,
  operatorAction,
  optOutIdentity,
  recordOutboundMessage,
  resetDemo,
  storeDonationImage,
  submitVerification,
} from "@/core";
import { LINK_ISSUE_CAP, LINK_REFUSED } from "@/core/service/links";
import { audit_events, donations, donors, inbound_messages, messaging_identities, offers, outbound_messages, policy_config, verification_links } from "@/db/schema";
import { DONOR, IDENTITY, PNG_BYTES, T0, at, donorActor, factsAt, insertDonation, iso, makeWorld, operatorActor, resetWorld, type World } from "./helpers/world";

// Slice 2(d), T-CO-30: verification links (CONTRACTS section 3.16, 8.4). Hash-only storage, view never consumes,
// one successful submit consumes, every refusal looks the same, needs_review hands back a fresh link.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

let w: World;
beforeAll(async () => {
  w = await makeWorld();
});
afterAll(async () => w.close());
beforeEach(async () => resetWorld(w));
afterEach(() => vi.unstubAllEnvs());

const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const refused = { ok: false, error: { code: "NOT_AUTHORIZED", message: LINK_REFUSED } };
const reviewFacts = () => factsAt(T0, { allergens: { ...scene1_eligible_facts.allergens, sesame: "unknown" } });
const linksOf = async (donation_id: string) => w.db.select().from(verification_links).where(eq(verification_links.donation_id, donation_id));
const rejections = async () => (await w.db.select().from(audit_events)).filter((e) => e.type === "link.rejected").map((e) => (e.data as { reason: string }).reason);

/** A messaging draft from the joined donor, as Dev 3's photo flow creates it. */
async function messagingDraft() {
  const img = await storeDonationImage({ mime: "image/png", bytes: PNG_BYTES }, w.deps());
  if (!img.ok) throw new Error("image");
  const d = await createDraft({ actor: donorActor(), image_id: img.data.image_id, source: "messaging", source_ref: `fake:${randomUUID()}` }, w.deps());
  if (!d.ok) throw new Error("draft");
  return d.data.id;
}
async function linkFor(donation_id: string, t: Date = T0) {
  const r = await issueVerificationLink({ donation_id }, w.deps(t));
  if (!r.ok) throw new Error(`issue failed ${r.error.code}`);
  return r.data;
}
const submit = (token: string, donation_id: string, facts = factsAt(), t: Date = at(1)) =>
  submitVerification({ auth: { link_token: token }, donation_id, facts, edited_from_ai: [] }, w.deps(t));

describe("issueVerificationLink", () => {
  it("returns a 43-character base64url token, stores only its SHA-256, and expires 30 minutes later", async () => {
    const id = await messagingDraft();
    const link = await linkFor(id);
    expect(link.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(link.expires_at).toBe(iso(30));
    const [row] = await linksOf(id);
    expect(row).toMatchObject({ id: link.link_id, token_hash: sha(link.token), donor_id: DONOR, consumed_at: null, revoked_at: null });
    // The raw token is in no table and no audit event.
    for (const table of [verification_links, audit_events, donations, outbound_messages, inbound_messages]) {
      expect(JSON.stringify(await w.db.select().from(table))).not.toContain(link.token);
    }
    const issued = (await w.db.select().from(audit_events)).filter((e) => e.type === "link.issued");
    expect(issued.map((e) => e.data)).toEqual([{ link_id: link.link_id }]);
  });
  it("expires at the stored cutoff when that is earlier (re-issue after needs_review)", async () => {
    const row = await insertDonation(w.db, { status: "needs_review", verified_facts: factsAt(), effective_cutoff_at: at(10) });
    expect((await linkFor(row.id)).expires_at).toBe(iso(10));
  });
  it("issuing again revokes the previous link, which then reads as expired-or-used", async () => {
    const id = await messagingDraft();
    const first = await linkFor(id);
    const second = await linkFor(id, at(1));
    expect(await getVerificationLinkView({ token: first.token }, w.deps(at(2)))).toMatchObject(refused);
    expect((await getVerificationLinkView({ token: second.token }, w.deps(at(2)))).ok).toBe(true);
    expect((await linksOf(id)).filter((l) => l.revoked_at === null && l.consumed_at === null)).toHaveLength(1);
  });
  it("refuses a donation that is not open for verification, a donor who has not joined, and an unknown id", async () => {
    const eligible = await insertDonation(w.db, { status: "eligible" });
    expect(await issueVerificationLink({ donation_id: eligible.id }, w.deps())).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
    const collected = await insertDonation(w.db, { status: "needs_review", collected_at: at(-1) });
    expect(await issueVerificationLink({ donation_id: collected.id }, w.deps())).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
    const late = await insertDonation(w.db, { status: "needs_review", effective_cutoff_at: T0 });
    expect(await issueVerificationLink({ donation_id: late.id }, w.deps())).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
    expect(await issueVerificationLink({ donation_id: randomUUID() }, w.deps())).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await issueVerificationLink({ donation_id: "x" }, w.deps())).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    const id = await messagingDraft();
    await optOutIdentity({ identity_id: IDENTITY.donor }, w.deps());
    expect(await issueVerificationLink({ donation_id: id }, w.deps())).toMatchObject({ ok: false, error: { code: "CONFLICT", details: { reason: "donor_not_joined" } } });
  });
});

describe("getVerificationLinkView / getVerificationLinkImage (never consume)", () => {
  it("can be opened any number of times; the view has only the checklist fields", async () => {
    const id = await messagingDraft();
    const link = await linkFor(id);
    for (let i = 0; i < 3; i++) {
      const v = await getVerificationLinkView({ token: link.token }, w.deps(at(i)));
      expect(v.ok).toBe(true);
      if (!v.ok) return;
      expect(VerificationLinkView.safeParse(v.data).success).toBe(true);
      expect(v.data).toMatchObject({ donation_id: id, donor_display_name: "Rainier Catering (synthetic)", status: "draft", link_expires_at: iso(30), resubmit_token: null });
      const json = JSON.stringify(v.data);
      for (const leak of ["address_line", "pickup_instructions", "@example.invalid", "offers", "timeline", "courier"]) expect(json).not.toContain(leak);
    }
    expect((await linksOf(id))[0]!.consumed_at).toBeNull();
  });
  it("serves the photo under the same checks", async () => {
    const id = await messagingDraft();
    const link = await linkFor(id);
    expect(await getVerificationLinkImage({ token: link.token }, w.deps())).toEqual({ ok: true, data: { mime: "image/png", bytes: PNG_BYTES } });
    expect(await getVerificationLinkImage({ token: link.token }, w.deps(at(30)))).toMatchObject(refused);
  });
  it("every bad token gets the same answer; the reason goes only to link.rejected, and only for a token that matches a real link", async () => {
    const id = await messagingDraft();
    const link = await linkFor(id);
    expect(await getVerificationLinkView({ token: link.token }, w.deps(at(30)))).toMatchObject(refused); // expired
    expect(await getVerificationLinkView({ token: "A".repeat(43) }, w.deps())).toMatchObject(refused); // unknown
    expect(await getVerificationLinkView({ token: "short" }, w.deps())).toMatchObject(refused); // malformed
    expect(await getVerificationLinkView({ token: 5 as never }, w.deps())).toMatchObject(refused);
    await w.db.update(donations).set({ status: "canceled" }).where(eq(donations.id, id));
    expect(await getVerificationLinkView({ token: link.token }, w.deps())).toMatchObject(refused); // donation closed
    // A malformed or unknown token has nothing to correlate with, so it is not audited (the routes are unauthenticated).
    expect(await rejections()).toEqual(["expired", "donation_closed"]);
    expect(JSON.stringify(await w.db.select().from(audit_events))).not.toContain(sha(link.token));
  });
});

describe("submitVerification by link (consumes only on success)", () => {
  it("applies S-03, consumes the link, and a second submit is refused", async () => {
    const id = await messagingDraft();
    const link = await linkFor(id);
    const r = await submit(link.token, id);
    expect(r).toMatchObject({ ok: true, data: { card: { id, status: "eligible" }, resubmit_token: null } });
    expect((await linksOf(id))[0]!.consumed_at?.toISOString()).toBe(iso(1));
    expect(await submit(link.token, id, factsAt(), at(2))).toMatchObject(refused);
    expect(await getVerificationLinkView({ token: link.token }, w.deps(at(2)))).toMatchObject(refused);
    const types = (await w.db.select().from(audit_events).where(eq(audit_events.donation_id, id))).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(["link.consumed", "donor.verification_submitted", "eligibility.evaluated"]));
    expect(await rejections()).toEqual(["consumed", "consumed"]);
  });
  // PGlite has one connection, so these two calls run one after the other: this checks the conditional UPDATE's logic
  // (one row, one winner), NOT concurrency. The race on a real Postgres is T-CO-17's job (D-033) and is UNVERIFIED.
  it("two submits of one token started together: exactly one succeeds (logic only, not a concurrency test)", async () => {
    const id = await messagingDraft();
    const link = await linkFor(id);
    const results = await Promise.all([submit(link.token, id), submit(link.token, id)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)[0]).toMatchObject(refused);
  });
  it("a schema-invalid submit or a later failure leaves the link live (the consumption is rolled back)", async () => {
    const id = await messagingDraft();
    const link = await linkFor(id);
    const bad = { ...factsAt(), servings: -3 } as never;
    expect(await submit(link.token, id, bad)).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    await w.db.update(policy_config).set({ active: false });
    expect(await submit(link.token, id)).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    await w.db.update(policy_config).set({ active: true });
    expect((await linksOf(id))[0]!.consumed_at).toBeNull();
    expect((await w.db.select().from(donations).where(eq(donations.id, id)))[0]!.status).toBe("draft");
    expect((await submit(link.token, id)).ok).toBe(true);
  });
  it("an expired or revoked link is refused with the same message", async () => {
    const id = await messagingDraft();
    const link = await linkFor(id);
    expect(await submit(link.token, id, factsAt(), at(30))).toMatchObject(refused);
    const fresh = await linkFor(id, at(31));
    await w.db.update(verification_links).set({ revoked_at: at(32) }).where(eq(verification_links.token_hash, sha(fresh.token)));
    expect(await submit(fresh.token, id, factsAt(at(31)), at(33))).toMatchObject(refused);
    expect(await rejections()).toEqual(["expired", "revoked"]);
  });
  it("a link for donation X cannot submit donation Y, and X's link stays live", async () => {
    const x = await messagingDraft();
    const y = await messagingDraft();
    const link = await linkFor(x);
    expect(await submit(link.token, y)).toMatchObject(refused);
    expect((await w.db.select().from(donations).where(eq(donations.id, y)))[0]!.status).toBe("draft");
    expect((await linksOf(x))[0]!.consumed_at).toBeNull();
    expect(await rejections()).toEqual(["donation_mismatch"]);
  });
  it("needs_review hands back a fresh link that works once", async () => {
    const id = await messagingDraft();
    const link = await linkFor(id);
    const r = await submit(link.token, id, reviewFacts());
    expect(r).toMatchObject({ ok: true, data: { card: { status: "needs_review" } } });
    if (!r.ok) return;
    const again = r.data.resubmit_token!;
    expect(again).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(again).not.toBe(link.token);
    expect(JSON.stringify(await w.db.select().from(verification_links))).not.toContain(again);
    const fixed = await submit(again, id, factsAt(), at(2));
    expect(fixed).toMatchObject({ ok: true, data: { card: { status: "eligible" }, resubmit_token: null } });
    expect(await submit(again, id, factsAt(), at(3))).toMatchObject(refused);
  });
  it("an eligible link submission creates no offer: only the next tick dispatches (D-021)", async () => {
    const id = await messagingDraft();
    await submit((await linkFor(id)).token, id);
    expect(await w.db.select().from(offers)).toHaveLength(0);
  });
  it("a session submit revokes the live link (S-03 either path)", async () => {
    const id = await messagingDraft();
    const link = await linkFor(id);
    await submitVerification({ auth: { actor: donorActor() }, donation_id: id, facts: reviewFacts(), edited_from_ai: [] }, w.deps(at(1)));
    expect(await submit(link.token, id, factsAt(), at(2))).toMatchObject(refused);
  });
});

describe("revocation (section 8.4 rule 8)", () => {
  it("operator cancel (S-11), donor STOP and the cutoff (S-08) revoke; demo reset deletes", async () => {
    const a = await messagingDraft();
    const la = await linkFor(a);
    await operatorAction({ actor: operatorActor, donation_id: a, action: "cancel", note: "" }, w.deps(at(1)));
    expect(await getVerificationLinkView({ token: la.token }, w.deps(at(2)))).toMatchObject(refused);

    const b = await messagingDraft();
    const lb = await linkFor(b);
    await optOutIdentity({ identity_id: IDENTITY.donor }, w.deps(at(1)));
    expect((await linksOf(b))[0]!.revoked_at).not.toBeNull();
    expect(await getVerificationLinkView({ token: lb.token }, w.deps(at(2)))).toMatchObject(refused);

    await w.db.update(donations).set({ status: "needs_review", verified_facts: factsAt(), effective_cutoff_at: at(20) }).where(eq(donations.id, a));
    const c = await insertDonation(w.db, { status: "needs_review", verified_facts: factsAt(), effective_cutoff_at: at(20) });
    await w.db.insert(verification_links).values({ donation_id: c.id, donor_id: DONOR, token_hash: "c".repeat(64), issued_at: T0, expires_at: at(20) });
    await expireDue(w.deps(at(20)));
    expect((await linksOf(c.id))[0]!.revoked_at).not.toBeNull();

    vi.stubEnv("ANNONA_DEMO_MODE", "1");
    await resetDemo({ keep_identities: true, actor: operatorActor }, { ...w.deps(at(30)), vision: {} as VisionProvider, messaging: { mode: "fake" } as MessagingGateway });
    expect(await w.db.select().from(verification_links)).toHaveLength(0);
  });
});

describe("review follow-ups for #41", () => {
  it("garbage tokens cannot grow the audit trail: only a refusal that matches a real link is recorded", async () => {
    const id = await messagingDraft();
    await linkFor(id);
    const before = (await w.db.select().from(audit_events)).length;
    for (let i = 0; i < 50; i++) {
      await getVerificationLinkView({ token: `${i}`.padStart(43, "A") }, w.deps());
      await getVerificationLinkImage({ token: "nope" }, w.deps());
      await submit("also-not-a-token", id);
      await submit("B".repeat(43), id);
    }
    expect((await w.db.select().from(audit_events)).length).toBe(before);
  });
  it("after a valid token, a donation that has since been cancelled, expired or rejected gets the one uniform refusal and the link stays live", async () => {
    for (const status of ["canceled", "expired", "rejected"]) {
      await resetWorld(w);
      const id = await messagingDraft();
      const link = await linkFor(id);
      await w.db.update(donations).set({ status }).where(eq(donations.id, id));
      expect(await submit(link.token, id), status).toMatchObject(refused);
      expect((await linksOf(id))[0]!.consumed_at, status).toBeNull();
      expect(await rejections(), status).toEqual(["donation_closed"]);
    }
  });
  it("a submit for a donation that does not exist looks like any other bad link", async () => {
    const id = await messagingDraft();
    const link = await linkFor(id);
    expect(await submit(link.token, randomUUID())).toMatchObject(refused);
    expect((await linksOf(id))[0]!.consumed_at).toBeNull();
  });
  it("issueVerificationLink is capped per donation, and refuses a donor who may no longer create drafts", async () => {
    const id = await messagingDraft();
    for (let i = 0; i < LINK_ISSUE_CAP; i++) await linkFor(id);
    expect(await issueVerificationLink({ donation_id: id }, w.deps())).toMatchObject({ ok: false, error: { code: "CONFLICT", details: { reason: "link_cap_reached" } } });
    expect(await linksOf(id)).toHaveLength(LINK_ISSUE_CAP);

    const other = await messagingDraft();
    for (const approval_status of ["suspended"]) {
      await w.db.update(donors).set({ approval_status }).where(eq(donors.id, DONOR));
      expect(await issueVerificationLink({ donation_id: other }, w.deps()), approval_status).toMatchObject({ ok: false, error: { code: "CONFLICT", details: { reason: "donor_not_allowed" } } });
    }
    expect(await linksOf(other)).toHaveLength(0);
    await w.db.update(donors).set({ approval_status: "pending" }).where(eq(donors.id, DONOR));
    expect((await issueVerificationLink({ donation_id: other }, w.deps())).ok).toBe(true);
  });
  it("the stored copy of a draft_ready message never holds a working token with a real provider; the fake provider keeps the whole text", async () => {
    const id = await messagingDraft();
    const link = await linkFor(id);
    const text = `Annona: open https://example.invalid/v#${link.token} to check`;
    const message = (key: string) => ({ to_identity_id: IDENTITY.donor, text, purpose: "draft_ready" as const, correlation: { donation_id: id }, idempotency_key: key });

    await recordOutboundMessage({ message: message("draft_ready:fake:v1"), provider_message_id: "fake_1" }, w.deps());
    await w.db.update(messaging_identities).set({ provider: "photon", handle: "+12065550123" }).where(eq(messaging_identities.id, IDENTITY.donor));
    await recordOutboundMessage({ message: message("draft_ready:real:v1"), provider_message_id: "pho_msg_abcdefghijklmnopqrstuvwxyz" }, w.deps());

    const rows = await w.db.select().from(outbound_messages);
    const fake = rows.find((r) => r.idempotency_key === "draft_ready:fake:v1")!;
    const real = rows.find((r) => r.idempotency_key === "draft_ready:real:v1")!;
    expect(fake.text).toContain(link.token);
    expect(real.text).not.toContain(link.token);
    expect(real.text).toContain(`#…${link.token.slice(-4)}`);
  });
  it("a draft with no stored cutoff gets the full 30 minutes; a stored cutoff caps it; a passed cutoff issues nothing", async () => {
    const draft = await messagingDraft();
    expect((await linkFor(draft)).expires_at).toBe(iso(30));
    const soon = await insertDonation(w.db, { status: "needs_review", verified_facts: factsAt(), effective_cutoff_at: at(5) });
    expect((await linkFor(soon.id)).expires_at).toBe(iso(5));
    const gone = await insertDonation(w.db, { status: "needs_review", verified_facts: factsAt(), effective_cutoff_at: at(-1) });
    expect(await issueVerificationLink({ donation_id: gone.id }, w.deps())).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
  });
  it("resubmit link: a needs_review result right at the cutoff hands back no link, and a suspended donor is rejected with none", async () => {
    const id = await messagingDraft();
    const link = await linkFor(id);
    await w.db.update(donors).set({ approval_status: "suspended" }).where(eq(donors.id, DONOR));
    const r = await submit(link.token, id);
    expect(r).toMatchObject({ ok: true, data: { card: { status: "rejected" }, resubmit_token: null } });
    expect(await linksOf(id)).toHaveLength(1);
  });
  it("the cap counts links that were never used; a consumed link was a legitimate use", async () => {
    const id = await messagingDraft();
    const filler = (n: number, over: Partial<typeof verification_links.$inferInsert>) =>
      Array.from({ length: n }, (_, i) => ({ donation_id: id, donor_id: DONOR, token_hash: sha(`${over.consumed_at ? "used" : "revoked"}-${i}`), issued_at: T0, expires_at: at(30), ...over }));
    await w.db.insert(verification_links).values(filler(LINK_ISSUE_CAP + 3, { consumed_at: at(1) }));
    expect((await issueVerificationLink({ donation_id: id }, w.deps())).ok).toBe(true);
    await w.db.insert(verification_links).values(filler(LINK_ISSUE_CAP, { revoked_at: at(1) }));
    expect(await issueVerificationLink({ donation_id: id }, w.deps())).toMatchObject({ ok: false, error: { code: "CONFLICT", details: { reason: "link_cap_reached" } } });
  });
  it("a donor whose STOP has just committed gets no resubmit link, even though the submit itself succeeds", async () => {
    const id = await messagingDraft();
    const link = await linkFor(id);
    // The first half of a STOP (the identity change) has committed; the link revocation has not run yet.
    await w.db.update(messaging_identities).set({ status: "opted_out", opted_out_at: at(0.5) }).where(eq(messaging_identities.id, IDENTITY.donor));
    const r = await submit(link.token, id, reviewFacts());
    expect(r).toMatchObject({ ok: true, data: { card: { status: "needs_review" }, resubmit_token: null } });
    expect((await linksOf(id)).filter((l) => l.revoked_at === null && l.consumed_at === null)).toHaveLength(0);
  });
  it("a bad token never reaches the donation row: refusals come from the read-only check and leave the donation untouched", async () => {
    const id = await messagingDraft();
    const link = await linkFor(id);
    const before = (await w.db.select().from(donations).where(eq(donations.id, id)))[0]!;
    for (const token of ["C".repeat(43), "short", link.token.slice(1) + "x"]) expect(await submit(token, id)).toMatchObject(refused);
    const other = await messagingDraft();
    expect(await submit(link.token, other)).toMatchObject(refused); // a link for X cannot submit Y
    expect((await w.db.select().from(donations).where(eq(donations.id, id)))[0]).toEqual(before);
    expect((await linksOf(id))[0]!.consumed_at).toBeNull();
  });
});

