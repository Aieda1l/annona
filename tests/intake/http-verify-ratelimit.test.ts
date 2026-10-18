import { describe, expect, it, vi } from "vitest";
import { ok, type VerificationLinkView } from "@/contracts";
import { createVerifyHandlers } from "@/features/intake/http/verify";
import { clientKey, createRateLimiter } from "@/features/intake/http/rate-limit";
import { jsonRequest } from "./doubles/http";

const TOKEN = "T0kEn-abcdefghijklmnopqrstuvwxyz0123456789_";
const URL_ = "http://localhost/api/verify/";

describe("createRateLimiter", () => {
  it("allows `limit` calls per window, then refuses until the window passes", () => {
    let t = 0;
    const allow = createRateLimiter({ limit: 2, windowMs: 1000, now: () => t });
    expect([allow("a"), allow("a"), allow("a")]).toEqual([true, true, false]);
    expect(allow("b")).toBe(true);
    t = 1000;
    expect(allow("a")).toBe(true);
  });
});

describe("clientKey", () => {
  it("uses the first forwarded address, then x-real-ip, then a shared bucket", () => {
    const req = (h: Record<string, string>) => new Request(URL_ + "view", { headers: h });
    expect(clientKey(req({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("1.1.1.1");
    expect(clientKey(req({ "x-real-ip": "3.3.3.3" }))).toBe("3.3.3.3");
    expect(clientKey(req({}))).toBe("unknown");
  });
});

describe("/api/verify/* rate limit", () => {
  it("returns 429 before reading the body or calling core, on all three routes", async () => {
    const getLinkVerification = vi.fn(async () => ok({} as VerificationLinkView));
    const getLinkVerificationImage = vi.fn(async () => ok({ mime: "image/jpeg", bytes: new Uint8Array([1]) }));
    const submitDonorVerificationByLink = vi.fn(async () => ok({} as never));
    const h = createVerifyHandlers({ getLinkVerification, getLinkVerificationImage, submitDonorVerificationByLink, allow: () => false });
    for (const [name, fn] of [["view", h.VIEW], ["image", h.IMAGE], ["submit", h.SUBMIT]] as const) {
      const res = await fn(jsonRequest(URL_ + name, { token: TOKEN, facts: {} }));
      expect(res.status).toBe(429);
      expect(res.headers.get("retry-after")).toBe("60");
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    expect(getLinkVerification).not.toHaveBeenCalled();
    expect(getLinkVerificationImage).not.toHaveBeenCalled();
    expect(submitDonorVerificationByLink).not.toHaveBeenCalled();
  });

  it("the default limiter lets normal use through and stops a flood from one client", async () => {
    const getLinkVerification = vi.fn(async () => ok({} as VerificationLinkView));
    const h = createVerifyHandlers({
      getLinkVerification,
      getLinkVerificationImage: vi.fn() as never,
      submitDonorVerificationByLink: vi.fn() as never,
    });
    const statuses: number[] = [];
    for (let i = 0; i < 62; i++) statuses.push((await h.VIEW(jsonRequest(URL_ + "view", { token: TOKEN }))).status);
    expect(statuses.slice(0, 60).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(60)).toEqual([429, 429]);
  });
});
