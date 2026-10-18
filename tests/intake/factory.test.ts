import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scene1_vision_suggestion } from "@/contracts";
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
    if (!r.ok) expect(r.error).toMatchObject({ code: "PROVIDER_UNAVAILABLE", retryable: false });
    expect(generateContent).not.toHaveBeenCalled();
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

  describe("escalation to the stronger model", () => {
    const answer = (confidence: "low" | "high", modelVersion: string) => {
      const { prompt_id, prompt_version, provider, model, mode, ...rest } = scene1_vision_suggestion;
      void [prompt_id, prompt_version, provider, model, mode];
      return { text: JSON.stringify({ ...rest, dish_suggestions: [{ name: "x", confidence }] }), modelVersion, candidates: [{ finishReason: "STOP" }] };
    };
    afterEach(() => vi.unstubAllEnvs());

    it("is on by default: a low-confidence answer gets a second opinion from gemini-3.8-flash", async () => {
      generateContent.mockResolvedValueOnce(answer("low", "gemini-3.5-flash-lite")).mockResolvedValueOnce(answer("high", "gemini-3.8-flash"));
      const p = createVisionProvider({ mode: "gemini", api_key: "test-key", model: undefined });
      const r = await p.analyzeFoodImage({ image: platter });
      expect(generateContent.mock.calls.map((c) => (c[0] as { model: string }).model)).toEqual(["gemini-3.5-flash-lite", "gemini-3.8-flash"]);
      expect(r.ok && r.data.model).toBe("gemini-3.8-flash");
    });

    it("a confident answer is not escalated", async () => {
      generateContent.mockResolvedValueOnce(answer("high", "gemini-3.5-flash-lite"));
      const p = createVisionProvider({ mode: "gemini", api_key: "test-key", model: undefined });
      await p.analyzeFoodImage({ image: platter });
      expect(generateContent).toHaveBeenCalledTimes(1);
    });

    it("GEMINI_ESCALATION_MODEL=off disables it", async () => {
      vi.stubEnv("GEMINI_ESCALATION_MODEL", "off");
      generateContent.mockResolvedValueOnce(answer("low", "gemini-3.5-flash-lite"));
      const p = createVisionProvider({ mode: "gemini", api_key: "test-key", model: undefined });
      await p.analyzeFoodImage({ image: platter });
      expect(generateContent).toHaveBeenCalledTimes(1);
    });

    it("GEMINI_ESCALATION_MODEL picks another model", async () => {
      vi.stubEnv("GEMINI_ESCALATION_MODEL", "gemini-3.1-pro-preview");
      generateContent.mockResolvedValueOnce(answer("low", "gemini-3.5-flash-lite")).mockResolvedValueOnce(answer("high", "gemini-3.1-pro-preview"));
      const p = createVisionProvider({ mode: "gemini", api_key: "test-key", model: undefined });
      await p.analyzeFoodImage({ image: platter });
      expect((generateContent.mock.calls[1]![0] as { model: string }).model).toBe("gemini-3.1-pro-preview");
    });

    it("the fake provider never escalates and never calls the SDK", async () => {
      const p = createVisionProvider({ mode: "fake", api_key: "k", model: undefined });
      await p.analyzeFoodImage({ image: platter });
      expect(generateContent).not.toHaveBeenCalled();
    });
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
