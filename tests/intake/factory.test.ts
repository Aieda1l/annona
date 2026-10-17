import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
const ctor = vi.hoisted(() => vi.fn());
const generateContent = vi.hoisted(() => vi.fn());
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
    constructor(opts: unknown) {
      ctor(opts);
    }
  },
}));

import { createVisionProvider } from "@/lib/ai";

// T-IN-05 (misconfigured case): the factory never falls back to fake output (CONTRACTS §12).
const platter = {
  mime: "image/jpeg",
  bytes_base64: readFileSync(join(process.cwd(), "fixtures/intake/images/sandwich_platter.jpg")).toString("base64"),
};

describe("createVisionProvider", () => {
  beforeEach(() => {
    ctor.mockClear();
    generateContent.mockReset();
  });

  it("fake mode returns the labeled fake provider", async () => {
    const p = createVisionProvider({ mode: "fake", api_key: undefined, model: undefined });
    expect(p).toMatchObject({ mode: "fake", model: null, status: "ok" });
    const r = await p.analyzeFoodImage({ image: platter });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.mode).toBe("fake");
  });

  it("fake mode ignores a key and model", () => {
    const p = createVisionProvider({ mode: "fake", api_key: "k", model: "m" });
    expect(p).toMatchObject({ mode: "fake", model: null });
  });

  it.each([undefined, "", "   "])("gemini with api_key %j is misconfigured and never answers", async (api_key) => {
    const p = createVisionProvider({ mode: "gemini", api_key, model: undefined });
    expect(p).toMatchObject({ mode: "real", status: "misconfigured" });
    const r = await p.analyzeFoodImage({ image: platter });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PROVIDER_UNAVAILABLE");
  });

  it("gemini reports the configured model, defaulting to gemini-3.5-flash-lite", () => {
    expect(createVisionProvider({ mode: "gemini", api_key: undefined, model: undefined }).model).toBe("gemini-3.5-flash-lite");
    expect(createVisionProvider({ mode: "gemini", api_key: "k", model: "gemini-3.8-flash" }).model).toBe("gemini-3.8-flash");
  });

  it("gemini with a key builds the real adapter with an explicit apiKey and no Vertex", () => {
    const p = createVisionProvider({ mode: "gemini", api_key: " test-key ", model: undefined });
    expect(p).toMatchObject({ mode: "real", status: "ok", model: "gemini-3.5-flash-lite" });
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(ctor).toHaveBeenCalledWith({ apiKey: "test-key" });
  });

  it("gemini with a key never falls back to fake output when the call fails", async () => {
    generateContent.mockRejectedValueOnce(Object.assign(new Error("boom"), { status: 503 }));
    const p = createVisionProvider({ mode: "gemini", api_key: "test-key", model: undefined });
    const r = await p.analyzeFoodImage({ image: platter });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PROVIDER_UNAVAILABLE");
  });

  it("no key means no client is built", () => {
    createVisionProvider({ mode: "gemini", api_key: undefined, model: undefined });
    expect(ctor).not.toHaveBeenCalled();
  });

  it("error messages never echo the api key", async () => {
    generateContent.mockRejectedValueOnce(new Error("request with key sk-secret-123 failed"));
    const p = createVisionProvider({ mode: "gemini", api_key: "sk-secret-123", model: undefined });
    const r = await p.analyzeFoodImage({ image: platter });
    expect(JSON.stringify(r)).not.toContain("sk-secret-123");
  });
});
