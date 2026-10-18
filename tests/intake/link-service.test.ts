import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { err, scene1_eligible_facts, type Deps } from "@/contracts";
import { createFakeVisionProvider } from "@/lib/ai/fake";
import { createIntakeService } from "@/features/intake/service";
import { createCoreDouble, DONOR } from "./doubles/core";

// T-IN-13 (service level): link path, CONTRACTS §8.4 and §9.2. Same parsing and edited_from_ai code as the web path.
const image = {
  mime: "image/jpeg",
  bytes_base64: readFileSync(join(process.cwd(), "fixtures/intake/images/sandwich_platter.jpg")).toString("base64"),
};
const allUnknown = Object.fromEntries(Object.keys(scene1_eligible_facts.allergens).map((a) => [a, "unknown"]));

async function setup() {
  const d = createCoreDouble();
  const service = createIntakeService({ core: d.core, vision: createFakeVisionProvider() });
  const draft = await service.createDraftFromImage({ actor: DONOR, image, source: "web_upload" });
  if (!draft.ok) throw new Error("draft failed");
  return { ...d, service, donation_id: draft.data.id, token: d.issueLink(draft.data.id) };
}

describe("getLinkVerification", () => {
  it("returns the core view and never consumes the link", async () => {
    const { service, core, token, donation_id } = await setup();
    for (let i = 0; i < 3; i++) {
      const r = await service.getLinkVerification({ token });
      expect(r.ok && r.data.donation_id).toBe(donation_id);
    }
    expect(core.submitVerification).not.toHaveBeenCalled();
  });

  it("passes a core NOT_AUTHORIZED through unchanged", async () => {
    const { service } = await setup();
    const r = await service.getLinkVerification({ token: "unknown" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NOT_AUTHORIZED");
  });

  it("passes deps through", async () => {
    const { service, core, token } = await setup();
    const deps: Deps = {};
    await service.getLinkVerification({ token }, deps);
    expect(core.getVerificationLinkView.mock.calls[0]![1]).toBe(deps);
  });
});

describe("getLinkVerificationImage", () => {
  it("returns the image bytes for a live link and NOT_AUTHORIZED otherwise", async () => {
    const { service, token } = await setup();
    const ok = await service.getLinkVerificationImage({ token });
    expect(ok.ok && ok.data.mime).toBe("image/jpeg");
    const bad = await service.getLinkVerificationImage({ token: "nope" });
    expect(bad.ok).toBe(false);
  });
});

describe("submitDonorVerificationByLink", () => {
  it("calls core submitVerification once with auth { link_token } and the donation id from the link view", async () => {
    const { service, core, token, donation_id } = await setup();
    const r = await service.submitDonorVerificationByLink({ token, raw: scene1_eligible_facts });
    expect(r.ok).toBe(true);
    expect(core.submitVerification).toHaveBeenCalledTimes(1);
    const call = core.submitVerification.mock.calls[0]![0];
    expect(call.auth).toEqual({ link_token: token });
    expect(call.donation_id).toBe(donation_id);
    expect(call.facts).toEqual(scene1_eligible_facts);
  });

  it("computes the same edited_from_ai as the web path for the same facts", async () => {
    const facts = {
      ...scene1_eligible_facts,
      dish_name: "Family tray",
      servings: 24,
      allergens: { ...scene1_eligible_facts.allergens, wheat: "not_in_listed_ingredients" },
    };
    const link = await setup();
    await link.service.submitDonorVerificationByLink({ token: link.token, raw: facts });
    const web = await setup();
    await web.service.submitDonorVerification({ actor: DONOR, donation_id: web.donation_id, raw: facts });
    const fromLink = link.core.submitVerification.mock.calls[0]![0].edited_from_ai;
    expect(fromLink).toEqual(web.core.submitVerification.mock.calls[0]![0].edited_from_ai);
    expect(fromLink).toEqual(expect.arrayContaining(["dish_name", "servings", "allergens.wheat"]));
  });

  it("returns a VerificationLinkView built from the submitted card, with no resubmit token when eligible", async () => {
    const { service, token, donation_id } = await setup();
    const r = await service.submitDonorVerificationByLink({ token, raw: scene1_eligible_facts });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({ donation_id, status: "eligible", resubmit_token: null, is_synthetic: true });
    expect(r.data.verified_facts).toEqual(scene1_eligible_facts);
    expect(r.data.link_expires_at).toBeTruthy();
  });

  it("on needs_review returns the fresh link as resubmit_token so the donor can fix the listed items", async () => {
    const { service, token, links } = await setup();
    const r = await service.submitDonorVerificationByLink({ token, raw: { ...scene1_eligible_facts, allergens: allUnknown } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.status).toBe("needs_review");
    expect(r.data.resubmit_token).toBeTruthy();
    expect(r.data.resubmit_token).not.toBe(token);
    expect(links.get(r.data.resubmit_token!)?.consumed).toBe(false);
    expect(links.get(token)?.consumed).toBe(true);
  });

  it("a schema-invalid body returns VALIDATION_FAILED and makes no core call at all (the link stays live)", async () => {
    const { service, core, token } = await setup();
    const bad: Record<string, unknown> = { ...scene1_eligible_facts };
    delete bad.allergens;
    const r = await service.submitDonorVerificationByLink({ token, raw: bad });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("VALIDATION_FAILED");
    expect(core.getVerificationLinkView).not.toHaveBeenCalled();
    expect(core.submitVerification).not.toHaveBeenCalled();
    const stillLive = await service.getLinkVerification({ token });
    expect(stillLive.ok).toBe(true);
  });

  it("an invalid token returns NOT_AUTHORIZED and never reaches submitVerification", async () => {
    const { service, core } = await setup();
    const r = await service.submitDonorVerificationByLink({ token: "nope", raw: scene1_eligible_facts });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NOT_AUTHORIZED");
    expect(core.submitVerification).not.toHaveBeenCalled();
  });

  it("a link consumed between view and submit returns core's NOT_AUTHORIZED unchanged and no resubmit token", async () => {
    const { service, core, token } = await setup();
    const failure = err("NOT_AUTHORIZED", "from core");
    core.submitVerification.mockResolvedValueOnce(failure);
    const r = await service.submitDonorVerificationByLink({ token, raw: scene1_eligible_facts });
    expect(r).toBe(failure);
  });

  it("a second submit with the same token loses (consumed only on success, then gone)", async () => {
    const { service, token } = await setup();
    expect((await service.submitDonorVerificationByLink({ token, raw: scene1_eligible_facts })).ok).toBe(true);
    const again = await service.submitDonorVerificationByLink({ token, raw: scene1_eligible_facts });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("NOT_AUTHORIZED");
  });

  it("a failed refresh of the new link never turns a successful submit into an error", async () => {
    const { service, core, token } = await setup();
    const original = core.getVerificationLinkView.getMockImplementation()!;
    core.getVerificationLinkView.mockImplementation(async (input, deps) => {
      // the first call (before submit) works; any later call (the refresh) fails
      return core.getVerificationLinkView.mock.calls.length > 1 ? err("INTERNAL", "boom") : original(input, deps);
    });
    const r = await service.submitDonorVerificationByLink({ token, raw: { ...scene1_eligible_facts, allergens: allUnknown } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.resubmit_token).toBeTruthy();
  });

  it("passes deps through to core", async () => {
    const { service, core, token } = await setup();
    const deps: Deps = {};
    await service.submitDonorVerificationByLink({ token, raw: scene1_eligible_facts }, deps);
    expect(core.getVerificationLinkView.mock.calls[0]![1]).toBe(deps);
    expect(core.submitVerification.mock.calls[0]![1]).toBe(deps);
  });
});
