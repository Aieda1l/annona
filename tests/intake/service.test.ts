import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  err,
  scene1_eligible_facts,
  scene1_vision_suggestion,
  type Deps,
  type VisionProvider,
  type VisionSuggestion,
} from "@/contracts";
import { createFakeVisionProvider } from "@/lib/ai/fake";
import { createVisionProvider } from "@/lib/ai";
import { createIntakeService } from "@/features/intake/service";
import { createCoreDouble, DONOR } from "./doubles/core";

const fixture = (id: string) => ({
  mime: "image/jpeg",
  bytes_base64: readFileSync(join(process.cwd(), "fixtures/intake/images", `${id}.jpg`)).toString("base64"),
});

function spyVision(impl: VisionProvider["analyzeFoodImage"]) {
  const analyzeFoodImage = vi.fn(impl);
  return { provider: { mode: "real", model: "m", status: "ok", analyzeFoodImage } as VisionProvider, analyzeFoodImage };
}

function setup(vision: VisionProvider = createFakeVisionProvider(), timeout_ms?: number) {
  const d = createCoreDouble();
  const service = createIntakeService({ core: d.core, vision, ...(timeout_ms ? { timeout_ms } : {}) });
  return { ...d, service };
}

describe("createDraftFromImage", () => {
  it("stores the image, creates a draft, runs vision and attaches the suggestion", async () => {
    const { core, service } = setup();
    const r = await service.createDraftFromImage({ actor: DONOR, image: fixture("sandwich_platter"), source: "web_upload" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({ status: "draft", ai_status: "succeeded" });
    expect(r.data.ai_suggestion).toMatchObject({ mode: "fake", provider: "fake" });
    expect(core.storeDonationImage).toHaveBeenCalledTimes(1);
    expect(core.storeDonationImage.mock.calls[0]![0].mime).toBe("image/jpeg");
    expect(Buffer.from(core.storeDonationImage.mock.calls[0]![0].bytes).toString("base64")).toBe(fixture("sandwich_platter").bytes_base64);
    expect(core.createDraft).toHaveBeenCalledWith(
      { actor: DONOR, image_id: "img-1", source: "web_upload", source_ref: null },
      undefined,
    );
  });

  it("passes source_ref and deps through to core", async () => {
    const { core, service } = setup();
    const deps: Deps = {};
    await service.createDraftFromImage(
      { actor: DONOR, image: fixture("pasta_tray"), source: "messaging", source_ref: "msg-1" },
      deps,
    );
    expect(core.createDraft.mock.calls[0]![0].source_ref).toBe("msg-1");
    expect(core.storeDonationImage.mock.calls[0]![1]).toBe(deps);
    expect(core.createDraft.mock.calls[0]![1]).toBe(deps);
    expect(core.attachAiResult.mock.calls[0]![1]).toBe(deps);
  });

  describe("T-IN-09: validation happens before any store or AI call", () => {
    const bytes = (n: number) => Buffer.alloc(n, 1).toString("base64");
    it.each([
      ["text/plain upload", { mime: "text/plain", bytes_base64: bytes(100) }, "web_upload"],
      ["2 MB JPEG on web_upload", { mime: "image/jpeg", bytes_base64: bytes(2 * 1024 * 1024) }, "web_upload"],
      ["6 MB JPEG on messaging", { mime: "image/jpeg", bytes_base64: bytes(6 * 1024 * 1024) }, "messaging"],
      ["HEIC while HEIC_ACCEPTED is false", { mime: "image/heic", bytes_base64: bytes(100) }, "messaging"],
      ["HEIC on web_upload", { mime: "image/heic", bytes_base64: bytes(100) }, "web_upload"],
    ] as const)("rejects %s", async (_label, image, source) => {
      const { core } = setup();
      const { provider, analyzeFoodImage } = spyVision(async () => err("PROVIDER_UNAVAILABLE", "unused"));
      const s = createIntakeService({ core, vision: provider });
      const r = await s.createDraftFromImage({ actor: DONOR, image, source });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("VALIDATION_FAILED");
      expect(core.storeDonationImage).not.toHaveBeenCalled();
      expect(core.createDraft).not.toHaveBeenCalled();
      expect(analyzeFoodImage).not.toHaveBeenCalled();
    });

    it("accepts a 3 MB JPEG from messaging and calls vision once", async () => {
      const { core } = setup();
      const { provider, analyzeFoodImage } = spyVision(async () => err("PROVIDER_UNAVAILABLE", "stub"));
      const s = createIntakeService({ core, vision: provider });
      const r = await s.createDraftFromImage({
        actor: DONOR,
        image: { mime: "image/jpeg", bytes_base64: bytes(3 * 1024 * 1024) },
        source: "messaging",
      });
      expect(r.ok).toBe(true);
      expect(analyzeFoodImage).toHaveBeenCalledTimes(1);
    });
  });

  describe("AI failure still returns the draft (T-IN-04, T-IN-05, T-IN-11)", () => {
    it("T-IN-04: malformed model output -> ai_status failed with AI_OUTPUT_INVALID, draft exists", async () => {
      const { core, service } = setup();
      const r = await service.createDraftFromImage({ actor: DONOR, image: fixture("malformed_output"), source: "fixture" });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data).toMatchObject({ status: "draft", ai_status: "failed", ai_suggestion: null });
      expect(core.attachAiResult.mock.calls[0]![0].result).toEqual({ ok: false, error_code: "AI_OUTPUT_INVALID" });
    });

    it("T-IN-05: a provider that throws -> PROVIDER_UNAVAILABLE", async () => {
      const { provider } = spyVision(async () => {
        throw new Error("boom sk-secret");
      });
      const { core, service } = setup(provider);
      const r = await service.createDraftFromImage({ actor: DONOR, image: fixture("pasta_tray"), source: "web_upload" });
      expect(r.ok && r.data.ai_status).toBe("failed");
      expect(core.attachAiResult.mock.calls[0]![0].result).toEqual({ ok: false, error_code: "PROVIDER_UNAVAILABLE" });
      expect(JSON.stringify(core.attachAiResult.mock.calls)).not.toContain("sk-secret");
    });

    it("T-IN-05: a provider that reports a safety block -> PROVIDER_UNAVAILABLE", async () => {
      const { provider } = spyVision(async () => err("PROVIDER_UNAVAILABLE", "blocked by safety"));
      const { core, service } = setup(provider);
      await service.createDraftFromImage({ actor: DONOR, image: fixture("pasta_tray"), source: "web_upload" });
      expect(core.attachAiResult.mock.calls[0]![0].result).toEqual({ ok: false, error_code: "PROVIDER_UNAVAILABLE" });
    });

    it("T-IN-05: a misconfigured gemini provider fails closed and never yields fake output", async () => {
      const vision = createVisionProvider({ mode: "gemini", api_key: undefined, model: undefined });
      const { service } = setup(vision);
      const r = await service.createDraftFromImage({ actor: DONOR, image: fixture("sandwich_platter"), source: "web_upload" });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.data).toMatchObject({ ai_status: "failed", ai_suggestion: null });
    });

    it("T-IN-11: a suggestion with a safety claim never reaches core (parser fails it)", async () => {
      const { core } = setup();
      // A provider whose text failed the parser guard (parseVisionOutput) reports AI_OUTPUT_INVALID.
      const claimProvider: VisionProvider = {
        mode: "fake",
        model: null,
        status: "ok",
        analyzeFoodImage: async () => err("AI_OUTPUT_INVALID", "Model output contains an absence or safety claim"),
      };
      const s = createIntakeService({ core, vision: claimProvider });
      const r = await s.createDraftFromImage({ actor: DONOR, image: fixture("sandwich_platter"), source: "web_upload" });
      expect(r.ok && r.data.ai_status).toBe("failed");
      expect(core.attachAiResult.mock.calls[0]![0].result).toEqual({ ok: false, error_code: "AI_OUTPUT_INVALID" });
    });
  });

  describe("15 s timeout", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("fails with PROVIDER_UNAVAILABLE when vision never answers, and ignores a late answer", async () => {
      let resolveLate!: (r: Awaited<ReturnType<VisionProvider["analyzeFoodImage"]>>) => void;
      const { provider } = spyVision(() => new Promise((res) => (resolveLate = res)));
      const { core, service } = setup(provider);
      const pending = service.createDraftFromImage({ actor: DONOR, image: fixture("pasta_tray"), source: "web_upload" });
      await vi.advanceTimersByTimeAsync(14_999);
      expect(core.attachAiResult).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      const r = await pending;
      expect(r.ok && r.data.ai_status).toBe("failed");
      expect(core.attachAiResult).toHaveBeenCalledTimes(1);
      expect(core.attachAiResult.mock.calls[0]![0].result).toEqual({ ok: false, error_code: "PROVIDER_UNAVAILABLE" });
      resolveLate({ ok: true, data: scene1_vision_suggestion as VisionSuggestion });
      await vi.runAllTimersAsync();
      expect(core.attachAiResult).toHaveBeenCalledTimes(1);
    });

    it("honors a custom timeout_ms and leaves no timer behind on success", async () => {
      const { provider } = spyVision(() => new Promise(() => {}));
      const { core, service } = setup(provider, 1000);
      const pending = service.createDraftFromImage({ actor: DONOR, image: fixture("pasta_tray"), source: "web_upload" });
      await vi.advanceTimersByTimeAsync(1000);
      await pending;
      expect(core.attachAiResult).toHaveBeenCalledTimes(1);

      const ok = setup();
      await ok.service.createDraftFromImage({ actor: DONOR, image: fixture("pasta_tray"), source: "web_upload" });
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe("idempotency and core errors", () => {
    it("a repeated source_ref returns the existing card without another vision call", async () => {
      const { provider, analyzeFoodImage } = spyVision(async () => ({ ok: true, data: scene1_vision_suggestion }));
      const { core, service } = setup(provider);
      const input = { actor: DONOR, image: fixture("pasta_tray"), source: "messaging", source_ref: "msg-7" } as const;
      const first = await service.createDraftFromImage(input);
      const second = await service.createDraftFromImage(input);
      expect(first.ok && second.ok).toBe(true);
      if (first.ok && second.ok) expect(second.data.id).toBe(first.data.id);
      expect(analyzeFoodImage).toHaveBeenCalledTimes(1);
      expect(core.attachAiResult).toHaveBeenCalledTimes(1);
    });

    it("returns a storeDonationImage error unchanged and does not create a draft", async () => {
      const { core, service } = setup();
      const failure = err("INTERNAL", "disk full");
      core.storeDonationImage.mockResolvedValueOnce(failure);
      const r = await service.createDraftFromImage({ actor: DONOR, image: fixture("pasta_tray"), source: "web_upload" });
      expect(r).toBe(failure);
      expect(core.createDraft).not.toHaveBeenCalled();
    });

    it("returns a createDraft NOT_AUTHORIZED unchanged and makes no AI call", async () => {
      const { provider, analyzeFoodImage } = spyVision(async () => err("PROVIDER_UNAVAILABLE", "unused"));
      const { core, service } = setup(provider);
      const failure = err("NOT_AUTHORIZED", "suspended donor");
      core.createDraft.mockResolvedValueOnce(failure);
      const r = await service.createDraftFromImage({ actor: DONOR, image: fixture("pasta_tray"), source: "web_upload" });
      expect(r).toBe(failure);
      expect(analyzeFoodImage).not.toHaveBeenCalled();
    });

    it("returns an attachAiResult error unchanged", async () => {
      const { core, service } = setup();
      const failure = err("INVALID_TRANSITION", "not a draft");
      core.attachAiResult.mockResolvedValueOnce(failure);
      const r = await service.createDraftFromImage({ actor: DONOR, image: fixture("pasta_tray"), source: "web_upload" });
      expect(r).toBe(failure);
    });
  });
});

describe("submitDonorVerification", () => {
  async function draftWithPlatter() {
    const s = setup();
    const draft = await s.service.createDraftFromImage({ actor: DONOR, image: fixture("sandwich_platter"), source: "web_upload" });
    if (!draft.ok) throw new Error("draft failed");
    return { ...s, id: draft.data.id };
  }

  it("T-IN-06: schema-invalid facts -> VALIDATION_FAILED and core is not called", async () => {
    const { core, service, id } = await draftWithPlatter();
    const bad: Record<string, unknown> = { ...scene1_eligible_facts };
    delete bad.allergens;
    const r = await service.submitDonorVerification({ actor: DONOR, donation_id: id, raw: bad });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("VALIDATION_FAILED");
    expect(core.getDonationCard).not.toHaveBeenCalled();
    expect(core.submitVerification).not.toHaveBeenCalled();
  });

  it("T-IN-07: computes edited_from_ai server-side, passes it to core and returns it on the card", async () => {
    const { core, service, id } = await draftWithPlatter();
    const facts = {
      ...scene1_eligible_facts,
      dish_name: "Family-style sandwich tray",
      servings: 24,
      allergens: { ...scene1_eligible_facts.allergens, wheat: "not_in_listed_ingredients" },
    };
    const r = await service.submitDonorVerification({ actor: DONOR, donation_id: id, raw: facts });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.edited_from_ai).toEqual(expect.arrayContaining(["servings", "dish_name", "allergens.wheat"]));
    const call = core.submitVerification.mock.calls[0]![0];
    expect(call.auth).toEqual({ actor: DONOR });
    expect(call.donation_id).toBe(id);
    expect(call.edited_from_ai).toEqual(r.data.edited_from_ai);
  });

  it("T-IN-07: with no AI suggestion (AI failed) edited_from_ai is empty", async () => {
    const s = setup();
    const draft = await s.service.createDraftFromImage({ actor: DONOR, image: fixture("malformed_output"), source: "fixture" });
    if (!draft.ok) throw new Error("draft failed");
    const r = await s.service.submitDonorVerification({ actor: DONOR, donation_id: draft.data.id, raw: scene1_eligible_facts });
    expect(r.ok).toBe(true);
    expect(s.core.submitVerification.mock.calls[0]![0].edited_from_ai).toEqual([]);
  });

  it("T-IN-08: AI possible allergens never populate donor statuses; an unknown sesame stays unknown", async () => {
    const { core, service, id } = await draftWithPlatter();
    const allergens = Object.fromEntries(Object.keys(scene1_eligible_facts.allergens).map((a) => [a, "unknown"]));
    const facts = { ...scene1_eligible_facts, allergens };
    const r = await service.submitDonorVerification({ actor: DONOR, donation_id: id, raw: facts });
    expect(r.ok).toBe(true);
    const sent = core.submitVerification.mock.calls[0]![0].facts;
    expect(sent.allergens).toEqual(allergens); // wheat, milk, eggs (AI-listed) are still `unknown`
    expect(Object.values(sent.allergens).every((s) => s === "unknown")).toBe(true);
    if (r.ok) expect(r.data.status).toBe("needs_review"); // double only; re-run against real core with ALLERGEN_UNKNOWN
  });

  it("passes core errors through unchanged and never dispatches", async () => {
    const { core, service, id } = await draftWithPlatter();
    for (const code of ["NOT_AUTHORIZED", "INVALID_TRANSITION"] as const) {
      const failure = err(code, "from core");
      core.submitVerification.mockResolvedValueOnce(failure);
      const r = await service.submitDonorVerification({ actor: DONOR, donation_id: id, raw: scene1_eligible_facts });
      expect(r).toBe(failure);
    }
    expect(Object.keys(core)).not.toContain("dispatchDonation");
  });

  it("returns a getDonationCard error unchanged and does not submit", async () => {
    const { core, service } = setup();
    const r = await service.submitDonorVerification({ actor: DONOR, donation_id: "missing", raw: scene1_eligible_facts });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NOT_FOUND");
    expect(core.submitVerification).not.toHaveBeenCalled();
  });

  it("passes deps through to core", async () => {
    const { core, service, id } = await draftWithPlatter();
    const deps: Deps = {};
    await service.submitDonorVerification({ actor: DONOR, donation_id: id, raw: scene1_eligible_facts }, deps);
    expect(core.getDonationCard.mock.calls[0]![2]).toBe(deps);
    expect(core.submitVerification.mock.calls[0]![1]).toBe(deps);
  });
});
