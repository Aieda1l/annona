import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { scene1_eligible_facts } from "@/contracts/fixtures/scenes";
import * as core from "@/core";
import { LINK_REFUSED, LINK_TTL_MS } from "@/core/service/links";
import { audit_events, donations, verification_links } from "@/db/schema";
import { createIntakeService } from "@/features/intake/service";
import { createFakeVisionProvider } from "@/lib/ai/fake";
import { IDENTITY, donorActor, factsAt, joinIdentityNow, makeWorld, resetWorld, type World } from "../core/helpers/world";

// T-IN-13 against Dev 2's REAL link functions (slice 2(d)): the intake service's getLinkVerification,
// getLinkVerificationImage and submitDonorVerificationByLink on the PGlite test world with a test clock.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

let w: World;
beforeAll(async () => {
  w = await makeWorld();
});
afterAll(async () => w.close());
beforeEach(async () => resetWorld(w));

const service = () => createIntakeService({ core, vision: createFakeVisionProvider() });
const platter = () => ({
  mime: "image/jpeg",
  bytes_base64: readFileSync(join(process.cwd(), "fixtures/intake/images/sandwich_platter.jpg")).toString("base64"),
});
const refused = { ok: false, error: { code: "NOT_AUTHORIZED", message: LINK_REFUSED } };
const reviewFacts = () => factsAt(undefined, { allergens: { ...scene1_eligible_facts.allergens, sesame: "unknown" } });

/** A draft made through the intake service, and a live link for it issued by core, as Dev 3's photo path does. */
async function draftWithLink(deps = w.deps()) {
  await joinIdentityNow(w, IDENTITY.donor, deps);
  const draft = await service().createDraftFromImage(
    { actor: donorActor(), image: platter(), source: "messaging", source_ref: `fake:link-${Math.random()}` },
    deps,
  );
  if (!draft.ok) throw new Error(`draft failed: ${draft.error.code}`);
  const link = await core.issueVerificationLink({ donation_id: draft.data.id }, deps);
  if (!link.ok) throw new Error(`link failed: ${link.error.code}`);
  return { deps, donation_id: draft.data.id, token: link.data.token, link_id: link.data.link_id, expires_at: link.data.expires_at };
}

describe("opening a link (getLinkVerification)", () => {
  it("returns the checklist data and never consumes the link", async () => {
    const { deps, donation_id, token } = await draftWithLink();
    const s = service();
    for (let i = 0; i < 3; i++) {
      const view = await s.getLinkVerification({ token }, deps);
      expect(view.ok).toBe(true);
      if (view.ok) {
        expect(view.data).toMatchObject({ donation_id, status: "draft", ai_status: "succeeded", verified_facts: null, resubmit_token: null, is_synthetic: true });
        expect(view.data.ai_suggestion?.mode).toBe("fake");
      }
    }
  });

  it("does not expose a handle, address, offer or courier", async () => {
    const { deps, token } = await draftWithLink();
    const view = await service().getLinkVerification({ token }, deps);
    const json = JSON.stringify(view);
    for (const forbidden of ["handle", "address", "offer", "courier", "recipient", "phone"]) expect(json.toLowerCase()).not.toContain(forbidden);
  });

  it("serves the stored photo while the link is live", async () => {
    const { deps, token } = await draftWithLink();
    const img = await service().getLinkVerificationImage({ token }, deps);
    expect(img.ok).toBe(true);
    if (img.ok) {
      expect(img.data.mime).toBe("image/jpeg");
      expect(Array.from(img.data.bytes.subarray(0, 3))).toEqual([0xff, 0xd8, 0xff]);
    }
  });

  it("refuses every bad token with the same answer", async () => {
    const { deps, token } = await draftWithLink();
    const s = service();
    const answers = [
      await s.getLinkVerification({ token: "" }, deps),
      await s.getLinkVerification({ token: "x".repeat(43) }, deps),
      await s.getLinkVerification({ token: token.slice(0, -1) + (token.endsWith("A") ? "B" : "A") }, deps),
    ];
    for (const a of answers) expect(a).toMatchObject(refused);
  });
});

describe("submitting by link (submitDonorVerificationByLink)", () => {
  it("eligible facts: the donation becomes eligible, the link is consumed and no new link is offered", async () => {
    const { deps, donation_id, token } = await draftWithLink();
    const s = service();
    const r = await s.submitDonorVerificationByLink({ token, raw: factsAt() }, deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({ donation_id, status: "eligible", resubmit_token: null });
    expect(r.data.decision?.outcome).toBe("eligible");
    expect(r.data.verified_facts?.attestation.attested_at).not.toBe("2020-01-01T00:00:00.000Z"); // server-stamped
    // the link is spent: view, image and a second submit are all refused
    expect(await s.getLinkVerification({ token }, deps)).toMatchObject(refused);
    expect(await s.getLinkVerificationImage({ token }, deps)).toMatchObject(refused);
    expect(await s.submitDonorVerificationByLink({ token, raw: factsAt() }, deps)).toMatchObject(refused);
  });

  it("needs review: a fresh link comes back, the old one is spent, and the second submit can finish the job", async () => {
    const { deps, donation_id, token } = await draftWithLink();
    const s = service();
    const first = await s.submitDonorVerificationByLink({ token, raw: reviewFacts() }, deps);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.status).toBe("needs_review");
    expect(first.data.resubmit_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.data.resubmit_token).not.toBe(token);
    expect(first.data.donation_id).toBe(donation_id);
    expect(await s.getLinkVerification({ token }, deps)).toMatchObject(refused);

    const again = first.data.resubmit_token!;
    const view = await s.getLinkVerification({ token: again }, deps);
    expect(view.ok && view.data).toMatchObject({ status: "needs_review", donation_id });
    // the page's link_expires_at is the fresh link's, not the spent one's
    if (view.ok) expect(first.data.link_expires_at).toBe(view.data.link_expires_at);

    const second = await s.submitDonorVerificationByLink({ token: again, raw: factsAt() }, deps);
    expect(second.ok && second.data).toMatchObject({ status: "eligible", resubmit_token: null });
  });

  it("unknown allergens stay unknown and are decided by the gate, not by the AI suggestion", async () => {
    const { deps, token } = await draftWithLink();
    const allUnknown = Object.fromEntries(Object.keys(scene1_eligible_facts.allergens).map((a) => [a, "unknown"]));
    const r = await service().submitDonorVerificationByLink({ token, raw: factsAt(undefined, { allergens: allUnknown }) }, deps);
    expect(r.ok && r.data.status).toBe("needs_review");
    if (r.ok) expect(r.data.verified_facts?.allergens).toEqual(allUnknown);
  });

  it("schema-invalid facts make no core call and leave the link live", async () => {
    const { deps, token } = await draftWithLink();
    const spy = vi.spyOn(core, "submitVerification");
    try {
      const r = await service().submitDonorVerificationByLink({ token, raw: { dish_name: "x" } }, deps);
      expect(r).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
    expect((await service().getLinkVerification({ token }, deps)).ok).toBe(true);
  });

  it("facts core rejects roll the consumption back: the link still works afterwards", async () => {
    const { deps, token } = await draftWithLink();
    const s = service();
    const bad = factsAt(undefined, { servings: -5 });
    const r = await s.submitDonorVerificationByLink({ token, raw: bad }, deps);
    expect(r.ok).toBe(false);
    expect((await s.getLinkVerification({ token }, deps)).ok).toBe(true);
    expect((await s.submitDonorVerificationByLink({ token, raw: factsAt() }, deps)).ok).toBe(true);
  });

  it("two simultaneous submits with one token: exactly one wins", async () => {
    const { deps, donation_id, token } = await draftWithLink();
    const s = service();
    const [a, b] = await Promise.all([
      s.submitDonorVerificationByLink({ token, raw: factsAt() }, deps),
      s.submitDonorVerificationByLink({ token, raw: factsAt() }, deps),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const loser = a.ok ? b : a;
    expect(loser).toMatchObject(refused);
    const [row] = await w.db.select().from(donations).where(eq(donations.id, donation_id));
    expect(row!.version).toBe(2); // one submit, not two
  });
});

describe("expiry", () => {
  it("a link older than 30 minutes is refused for view, image and submit", async () => {
    const { deps, token } = await draftWithLink();
    deps.clock.advance(LINK_TTL_MS + 1000);
    const s = service();
    expect(await s.getLinkVerification({ token }, deps)).toMatchObject(refused);
    expect(await s.getLinkVerificationImage({ token }, deps)).toMatchObject(refused);
    expect(await s.submitDonorVerificationByLink({ token, raw: factsAt() }, deps)).toMatchObject(refused);
  });

  it("a link still live just inside the 30 minutes works", async () => {
    const { deps, token } = await draftWithLink();
    deps.clock.advance(LINK_TTL_MS - 5000);
    expect((await service().getLinkVerification({ token }, deps)).ok).toBe(true);
  });
});

describe("hygiene", () => {
  it("the raw token is never stored or audited: only its hash exists", async () => {
    const { deps, token } = await draftWithLink();
    const s = service();
    await s.getLinkVerification({ token }, deps);
    await s.submitDonorVerificationByLink({ token, raw: reviewFacts() }, deps);
    await s.getLinkVerification({ token: "x".repeat(43) }, deps);
    const rows = JSON.stringify(await w.db.select().from(verification_links));
    const audit = JSON.stringify(await w.db.select().from(audit_events));
    expect(rows).not.toContain(token);
    expect(audit).not.toContain(token);
  });

  it("refusals are audited with a reason but without the token", async () => {
    const { deps } = await draftWithLink();
    await service().getLinkVerification({ token: "y".repeat(43) }, deps);
    const events = (await w.db.select().from(audit_events)).filter((e) => e.type === "link.rejected");
    expect(events.length).toBeGreaterThan(0);
    expect(JSON.stringify(events)).not.toContain("y".repeat(43));
  });
});
