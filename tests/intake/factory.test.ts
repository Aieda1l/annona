import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createVisionProvider } from "@/lib/ai";

// T-IN-05 (misconfigured case): the factory never falls back to fake output (CONTRACTS §12).
const platter = {
  mime: "image/jpeg",
  bytes_base64: readFileSync(join(process.cwd(), "fixtures/intake/images/sandwich_platter.jpg")).toString("base64"),
};

describe("createVisionProvider", () => {
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

  it("gemini with a key is a real-mode stub until slice 2: PROVIDER_UNAVAILABLE, never fake output", async () => {
    const p = createVisionProvider({ mode: "gemini", api_key: "test-key", model: undefined });
    expect(p).toMatchObject({ mode: "real", status: "ok" });
    const r = await p.analyzeFoodImage({ image: platter });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PROVIDER_UNAVAILABLE");
  });

  it("error messages never echo the api key", async () => {
    const p = createVisionProvider({ mode: "gemini", api_key: "sk-secret-123", model: undefined });
    const r = await p.analyzeFoodImage({ image: platter });
    expect(JSON.stringify(r)).not.toContain("sk-secret-123");
  });
});
