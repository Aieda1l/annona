import { describe, expect, it, vi } from "vitest";
import { err, ok, eligibleCard, scene1_eligible_facts, scene1_vision_suggestion, type VerificationLinkView } from "@/contracts";
import { createVerifyHandlers } from "@/features/intake/http/verify";
import { createIntakeService } from "@/features/intake/service";
import { createFakeVisionProvider } from "@/lib/ai/fake";
import { createCoreDouble } from "./doubles/core";
import { jsonRequest } from "./doubles/http";

// T-IN-13 (HTTP level): /api/verify/{view,image,submit}. Token authorization only: no session, no cookie, uniform 403.
const TOKEN = "T0kEn-abcdefghijklmnopqrstuvwxyz0123456789_";
const UNIFORM = "This link has expired or was already used. Text the photo again for a new link.";
const URL_ = "http://localhost/api/verify/";

const view: VerificationLinkView = {
  donation_id: eligibleCard.id,
  donor_display_name: "Rainier Catering (synthetic)",
  status: "draft",
  ai_status: "succeeded",
  ai_suggestion: scene1_vision_suggestion,
  verified_facts: null,
  decision: null,
  link_expires_at: "2026-10-17T23:40:00.000Z",
  resubmit_token: null,
  is_synthetic: true,
};

function handlers(over: Partial<Parameters<typeof createVerifyHandlers>[0]> = {}) {
  const getLinkVerification = vi.fn(async () => ok(view));
  const getLinkVerificationImage = vi.fn(async () => ok({ mime: "image/jpeg", bytes: new Uint8Array([9, 8, 7]) }));
  const submitDonorVerificationByLink = vi.fn(async () => ok(view));
  return {
    getLinkVerification,
    getLinkVerificationImage,
    submitDonorVerificationByLink,
    ...createVerifyHandlers({ getLinkVerification, getLinkVerificationImage, submitDonorVerificationByLink, ...over }),
  };
}
const post = (name: string, body: unknown, cookie?: string) => jsonRequest(URL_ + name, body, cookie);
const body = async (res: Response) => (await res.json()) as { ok: boolean; data?: unknown; error?: { code: string; message: string } };

describe("response hygiene", () => {
  it("VIEW sets no-store and no-referrer, sets no cookie, and ignores any session cookie", async () => {
    const h = handlers();
    const res = await h.VIEW(post("view", { token: TOKEN }, "annona_session=whatever"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(h.getLinkVerification).toHaveBeenCalledWith({ token: TOKEN });
  });

  it("never echoes the token in an error response", async () => {
    const h = handlers({ getLinkVerification: async () => err("NOT_AUTHORIZED", `bad token ${TOKEN}`) });
    const res = await h.VIEW(post("view", { token: TOKEN }));
    const text = await res.text();
    expect(text).not.toContain(TOKEN);
    expect([...res.headers.values()].join(" ")).not.toContain(TOKEN);
  });
});

describe("uniform errors", () => {
  it.each(["NOT_AUTHORIZED", "NOT_FOUND"] as const)("core %s becomes the same 403 with the contract's message", async (code) => {
    const h = handlers({
      getLinkVerification: async () => err(code, "reason that must not leak: consumed at 12:01"),
      getLinkVerificationImage: async () => err(code, "revoked"),
      submitDonorVerificationByLink: async () => err(code, "expired"),
    });
    for (const [fn, name, payload] of [
      [h.VIEW, "view", { token: TOKEN }],
      [h.IMAGE, "image", { token: TOKEN }],
      [h.SUBMIT, "submit", { token: TOKEN, facts: scene1_eligible_facts }],
    ] as const) {
      const res = await fn(post(name, payload));
      expect(res.status).toBe(403);
      expect(await body(res)).toMatchObject({ ok: false, error: { code: "NOT_AUTHORIZED", message: UNIFORM } });
    }
  });
});

describe("request validation", () => {
  it.each([
    ["not JSON", "{nope"],
    ["empty body", ""],
    ["no token", {}],
    ["a non-string token", { token: 42 }],
    ["an empty token", { token: "" }],
    ["an extra key", { token: TOKEN, extra: 1 }],
  ])("VIEW and IMAGE reject %s with 400 and never call core", async (_label, payload) => {
    const h = handlers();
    for (const [fn, name] of [[h.VIEW, "view"], [h.IMAGE, "image"]] as const) {
      const res = await fn(post(name, payload));
      expect(res.status).toBe(400);
      expect((await body(res)).error?.code).toBe("VALIDATION_FAILED");
    }
    expect(h.getLinkVerification).not.toHaveBeenCalled();
    expect(h.getLinkVerificationImage).not.toHaveBeenCalled();
  });

  it.each([
    ["no facts", { token: TOKEN }],
    ["no token", { facts: scene1_eligible_facts }],
    ["an extra key", { token: TOKEN, facts: scene1_eligible_facts, actor: { role: "donor" } }],
    ["an oversized body", { token: TOKEN, facts: { ingredients_text: "x".repeat(70_000) } }],
  ])("SUBMIT rejects %s with 400 and never calls the service", async (_label, payload) => {
    const h = handlers();
    const res = await h.SUBMIT(post("submit", payload));
    expect(res.status).toBe(400);
    expect(h.submitDonorVerificationByLink).not.toHaveBeenCalled();
  });
});

describe("SUBMIT", () => {
  it("passes the token and the raw facts to the service unmodified", async () => {
    const h = handlers();
    const raw = { ...scene1_eligible_facts, unexpected_key: true }; // the service, not the handler, rejects it
    const res = await h.SUBMIT(post("submit", { token: TOKEN, facts: raw }));
    expect(res.status).toBe(200);
    expect(h.submitDonorVerificationByLink).toHaveBeenCalledWith({ token: TOKEN, raw });
  });

  it("maps a VALIDATION_FAILED from the service to 400 (and the link stays live)", async () => {
    const { core } = createCoreDouble();
    const service = createIntakeService({ core, vision: createFakeVisionProvider() });
    const h = createVerifyHandlers({
      getLinkVerification: service.getLinkVerification,
      getLinkVerificationImage: service.getLinkVerificationImage,
      submitDonorVerificationByLink: service.submitDonorVerificationByLink,
    });
    const bad: Record<string, unknown> = { ...scene1_eligible_facts };
    delete bad.allergens;
    const res = await h.SUBMIT(post("submit", { token: TOKEN, facts: bad }));
    expect(res.status).toBe(400);
    expect(core.getVerificationLinkView).not.toHaveBeenCalled();
    expect(core.submitVerification).not.toHaveBeenCalled();
  });
});

describe("IMAGE", () => {
  it("returns the bytes with the stored content type, no-store, nosniff and no-referrer", async () => {
    const h = handlers();
    const res = await h.IMAGE(post("image", { token: TOKEN }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([9, 8, 7]);
  });

  it("refuses to serve a content type that is not an image", async () => {
    const h = handlers({ getLinkVerificationImage: async () => ok({ mime: "text/html", bytes: new Uint8Array([60]) }) });
    const res = await h.IMAGE(post("image", { token: TOKEN }));
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).not.toBe("text/html");
  });
});
