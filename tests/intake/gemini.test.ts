import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALLERGENS, scene1_vision_suggestion } from "@/contracts";
import { createGeminiProvider, renderPrompt, sanitizeHint, type GeminiClientLike } from "@/lib/ai/gemini";

// T-IN-05: the real adapter against an injected fake SDK client. No network.
const IMAGE = { mime: "image/jpeg", bytes_base64: Buffer.from("fake image bytes").toString("base64") };
const MODEL = "gemini-3.5-flash-lite";

const modelOutput = () => {
  const { prompt_id, prompt_version, provider, model, mode, ...rest } = scene1_vision_suggestion;
  void [prompt_id, prompt_version, provider, model, mode];
  return rest;
};
const ok = (over: Record<string, unknown> = {}) => ({
  text: JSON.stringify(modelOutput()),
  modelVersion: MODEL,
  candidates: [{ finishReason: "STOP" }],
  ...over,
});

function setup(
  impl: GeminiClientLike["models"]["generateContent"],
  extra: Partial<Pick<Parameters<typeof createGeminiProvider>[0], "timeout_ms" | "max_attempts" | "onAttempt" | "promptVersion">> = {},
) {
  const generateContent = vi.fn(impl);
  const provider = createGeminiProvider({ client: { models: { generateContent } }, model: MODEL, ...extra });
  return { provider, generateContent };
}
const analyze = (p: ReturnType<typeof setup>["provider"], donor_hint?: string, image = IMAGE) =>
  p.analyzeFoodImage({ image, ...(donor_hint === undefined ? {} : { donor_hint }) });

describe("provider shape", () => {
  it("is a ready real-mode provider for the configured model", () => {
    const { provider } = setup(async () => ok());
    expect(provider).toMatchObject({ mode: "real", model: MODEL, status: "ok" });
  });

  it("is misconfigured, and always PROVIDER_UNAVAILABLE, when the prompt file is missing", async () => {
    const generateContent = vi.fn();
    const provider = createGeminiProvider({ client: { models: { generateContent } }, model: MODEL, promptPath: "/nope/missing.md" });
    expect(provider.status).toBe("misconfigured");
    const r = await analyze(provider);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PROVIDER_UNAVAILABLE");
    expect(generateContent).not.toHaveBeenCalled();
  });
});

describe("request", () => {
  it("sends the image first, then the rendered prompt, asking for schema-constrained JSON", async () => {
    const { provider, generateContent } = setup(async () => ok());
    await analyze(provider);
    expect(generateContent).toHaveBeenCalledTimes(1);
    const req = generateContent.mock.calls[0]![0] as {
      model: string;
      contents: { role: string; parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> }[];
      config: { responseMimeType: string; responseJsonSchema: Record<string, unknown>; abortSignal: AbortSignal };
    };
    expect(req.model).toBe(MODEL);
    const parts = req.contents[0]!.parts;
    expect(parts[0]!.inlineData).toEqual({ mimeType: "image/jpeg", data: IMAGE.bytes_base64 });
    expect(parts[1]!.text).toContain("# ROLE");
    expect(req.config.responseMimeType).toBe("application/json");
    expect(req.config.abortSignal).toBeInstanceOf(AbortSignal);
    const schema = req.config.responseJsonSchema;
    expect(schema).not.toHaveProperty("$schema");
    expect(schema.required).toEqual(
      expect.arrayContaining(["image_quality", "ingredients_verified", "handling_verified", "requires_donor_confirmation"]),
    );
    expect(Object.keys(schema.properties as object)).not.toContain("provider");
  });

  it("passes the original MIME type through unchanged, HEIC included", async () => {
    const { provider, generateContent } = setup(async () => ok());
    await analyze(provider, undefined, { mime: "image/heic", bytes_base64: IMAGE.bytes_base64 });
    const parts = (generateContent.mock.calls[0]![0] as { contents: { parts: { inlineData?: { mimeType: string } }[] }[] }).contents[0]!.parts;
    expect(parts[0]!.inlineData?.mimeType).toBe("image/heic");
  });

  it("fills both template slots, leaving no placeholders", async () => {
    const { provider, generateContent } = setup(async () => ok());
    await analyze(provider);
    const text = (generateContent.mock.calls[0]![0] as { contents: { parts: { text?: string }[] }[] }).contents[0]!.parts[1]!.text!;
    expect(text).toContain(ALLERGENS.join(", "));
    expect(text).toContain("none provided");
    expect(text).not.toMatch(/\{\{|\}\}/);
  });
});

describe("renderPrompt / sanitizeHint", () => {
  it.each([
    [undefined, "none provided"],
    ["", "none provided"],
    ["   \n\t ", "none provided"],
    ["  pasta   bake\nfor\tlunch  ", "pasta bake for lunch"],
    ["a\u0000b\u0007c\u001b[31md", "a b c [31md"],
  ])("sanitizes %j -> %j", (input, expected) => {
    expect(sanitizeHint(input)).toBe(expected);
  });

  it("caps the hint at 200 characters", () => {
    expect(sanitizeHint("x".repeat(500))).toHaveLength(200);
  });

  it("inserts the hint literally: no special replacement patterns, no re-expansion of slots", () => {
    const tpl = "A: {{allergen_list}}\nB: {{donor_hint}}";
    const out = renderPrompt(tpl, "$& {{allergen_list}} $1");
    expect(out).toContain("B: $& {{allergen_list}} $1");
    expect(out.split(ALLERGENS.join(", "))).toHaveLength(2); // the list appears once, in slot A only
  });
});

describe("successful output", () => {
  it("parses and stamps provenance, using the model version the API reports", async () => {
    const { provider } = setup(async () => ok({ modelVersion: "gemini-3.5-flash-lite-001" }));
    const r = await analyze(provider);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({
      prompt_id: "annona-intake",
      prompt_version: "v1",
      provider: "gemini",
      mode: "real",
      model: "gemini-3.5-flash-lite-001",
      ingredients_verified: false,
      requires_donor_confirmation: true,
    });
  });

  it("falls back to the configured model when the API reports no version", async () => {
    const { provider } = setup(async () => ok({ modelVersion: undefined }));
    const r = await analyze(provider);
    expect(r.ok && r.data.model).toBe(MODEL);
  });
});

describe("provider failures -> PROVIDER_UNAVAILABLE, never fake output", () => {
  const httpError = (status: number) => Object.assign(new Error("boom AIza-not-a-real-key Bearer ya29.not-a-real-token"), { status });

  it.each([
    [429, true],
    [500, true],
    [503, true],
    [400, false],
    [403, false],
    [404, false],
  ])("HTTP %i (retryable %s)", async (status, retryable) => {
    const { provider } = setup(async () => Promise.reject(httpError(status)));
    const r = await analyze(provider);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatchObject({ code: "PROVIDER_UNAVAILABLE", retryable });
    expect(JSON.stringify(r)).not.toMatch(/AIza|ya29|Bearer|boom/);
  });

  it("a network error without a status is retryable", async () => {
    const { provider } = setup(async () => Promise.reject(new TypeError("fetch failed")));
    const r = await analyze(provider);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ code: "PROVIDER_UNAVAILABLE", retryable: true });
  });

  it("a synchronous throw is also contained", async () => {
    const { provider } = setup(() => {
      throw new Error("sync boom");
    });
    const r = await analyze(provider);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PROVIDER_UNAVAILABLE");
  });

  describe("timeout", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("aborts the request and fails when the client never answers", async () => {
      let signal!: AbortSignal;
      const { provider } = setup((req) => {
        signal = (req as { config: { abortSignal: AbortSignal } }).config.abortSignal;
        return new Promise(() => {});
      }, { timeout_ms: 1000, max_attempts: 1 });
      const pending = analyze(provider);
      await vi.advanceTimersByTimeAsync(1000);
      const r = await pending;
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatchObject({ code: "PROVIDER_UNAVAILABLE", retryable: true });
      expect(signal.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("leaves no timer behind after a fast answer", async () => {
      const { provider } = setup(async () => ok());
      await analyze(provider);
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});

describe("retry: one retry on retryable provider failures", () => {
  const httpErr = (status: number) => Object.assign(new Error("x"), { status });

  it.each([429, 500, 503])("retries once after HTTP %i and returns the second answer", async (status) => {
    const { provider, generateContent } = setup(async () => ok());
    generateContent.mockRejectedValueOnce(httpErr(status));
    const r = await analyze(provider);
    expect(r.ok).toBe(true);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("retries a network error without a status", async () => {
    const { provider, generateContent } = setup(async () => ok());
    generateContent.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect((await analyze(provider)).ok).toBe(true);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it.each([400, 403, 404])("does not retry HTTP %i", async (status) => {
    const { provider, generateContent } = setup(async () => Promise.reject(httpErr(status)));
    const r = await analyze(provider);
    expect(r.ok).toBe(false);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("does not retry a safety block", async () => {
    const { provider, generateContent } = setup(async () => ok({ candidates: [{ finishReason: "SAFETY" }] }));
    expect((await analyze(provider)).ok).toBe(false);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["non-JSON text", { text: "not json" }],
    ["a safety claim", { text: JSON.stringify({ ...modelOutput(), uncertainty_notes: ["These look nut-free."] }) }],
  ])("does not retry bad model output (%s): no re-rolling until it passes", async (_label, over) => {
    const { provider, generateContent } = setup(async () => ok(over));
    const r = await analyze(provider);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("AI_OUTPUT_INVALID");
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("gives up after the second failure, reporting PROVIDER_UNAVAILABLE", async () => {
    const { provider, generateContent } = setup(async () => Promise.reject(httpErr(503)));
    const r = await analyze(provider);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ code: "PROVIDER_UNAVAILABLE", retryable: true });
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("max_attempts: 1 disables the retry", async () => {
    const { provider, generateContent } = setup(async () => Promise.reject(httpErr(503)), { max_attempts: 1 });
    await analyze(provider);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("reports every attempt through onAttempt", async () => {
    const events: Array<Record<string, unknown>> = [];
    const { provider, generateContent } = setup(async () => ok(), { onAttempt: (e) => events.push(e as unknown as Record<string, unknown>) });
    generateContent.mockRejectedValueOnce(httpErr(503));
    await analyze(provider);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ attempt: 1, ok: false, error_code: "PROVIDER_UNAVAILABLE", retryable: true });
    expect(events[1]).toMatchObject({ attempt: 2, ok: true });
    expect(typeof events[0]!.ms).toBe("number");
  });

  describe("with timeouts", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("a stalled first attempt is cut at the attempt timeout and the retry succeeds", async () => {
      const signals: AbortSignal[] = [];
      const { provider, generateContent } = setup(async () => ok(), { timeout_ms: 7000 });
      generateContent.mockImplementationOnce((req) => {
        signals.push((req as { config: { abortSignal: AbortSignal } }).config.abortSignal);
        return new Promise(() => {});
      });
      const pending = analyze(provider);
      await vi.advanceTimersByTimeAsync(6999);
      expect(generateContent).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      const r = await pending;
      expect(r.ok).toBe(true);
      expect(generateContent).toHaveBeenCalledTimes(2);
      expect(signals[0]!.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("two stalled attempts finish within the 15 s total budget, with fresh abort signals", async () => {
      const signals: AbortSignal[] = [];
      const { provider } = setup((req) => {
        signals.push((req as { config: { abortSignal: AbortSignal } }).config.abortSignal);
        return new Promise(() => {});
      });
      let done = false;
      const pending = analyze(provider).then((r) => ((done = true), r));
      await vi.advanceTimersByTimeAsync(13_999);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const r = await pending;
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatchObject({ code: "PROVIDER_UNAVAILABLE", retryable: true });
      expect(signals).toHaveLength(2);
      expect(signals[0]).not.toBe(signals[1]);
      expect(signals.every((s) => s.aborted)).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});

describe("prompt version", () => {
  const textOf = (generateContent: ReturnType<typeof setup>["generateContent"]) =>
    (generateContent.mock.calls[0]![0] as { contents: { parts: { text?: string }[] }[] }).contents[0]!.parts[1]!.text!;

  it("defaults to v1 and stamps it", async () => {
    const { provider } = setup(async () => ok());
    const r = await analyze(provider);
    expect(r.ok && r.data.prompt_version).toBe("v1");
  });

  it("v3 loads the v3 file and stamps v3", async () => {
    const { provider, generateContent } = setup(async () => ok(), { promptVersion: "v3" });
    const r = await analyze(provider);
    expect(r.ok && r.data.prompt_version).toBe("v3");
    expect(textOf(generateContent)).toContain("No food is visible in the photo.");
  });

  it("v2 loads the v2 file and stamps v2", async () => {
    const { provider, generateContent } = setup(async () => ok(), { promptVersion: "v2" });
    const r = await analyze(provider);
    expect(r.ok && r.data.prompt_version).toBe("v2");
    expect(textOf(generateContent)).toContain("Confidence belongs to each dish name");
  });
});

describe("safety blocks -> PROVIDER_UNAVAILABLE (R-AI-6)", () => {
  it.each(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT", "RECITATION"])(
    "finishReason %s, even if text is present",
    async (finishReason) => {
      const { provider } = setup(async () => ok({ candidates: [{ finishReason }] }));
      const r = await analyze(provider);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatchObject({ code: "PROVIDER_UNAVAILABLE", retryable: false });
    },
  );

  it("a prompt-level block reason with no candidates", async () => {
    const { provider } = setup(async () => ({ text: undefined, promptFeedback: { blockReason: "SAFETY" } }));
    const r = await analyze(provider);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PROVIDER_UNAVAILABLE");
  });

  it("an unspecified block reason is not a block", async () => {
    const { provider } = setup(async () => ok({ promptFeedback: { blockReason: "BLOCKED_REASON_UNSPECIFIED" } }));
    expect((await analyze(provider)).ok).toBe(true);
  });
});

describe("bad model output -> AI_OUTPUT_INVALID", () => {
  it.each([
    ["undefined text", { text: undefined }],
    ["empty text", { text: "" }],
    ["prose", { text: "It looks like sandwiches." }],
    ["truncated JSON (MAX_TOKENS)", { text: '{"image_quality": "usable", "dish_sugg', candidates: [{ finishReason: "MAX_TOKENS" }] }],
    ["a schema violation", { text: JSON.stringify({ ...modelOutput(), ingredients_verified: true }) }],
    ["a provenance key from the model", { text: JSON.stringify({ ...modelOutput(), provider: "gemini" }) }],
    [
      "a safety claim in a note",
      { text: JSON.stringify({ ...modelOutput(), uncertainty_notes: ["These look nut-free."] }) },
    ],
  ])("%s", async (_label, over) => {
    const { provider } = setup(async () => ok(over));
    const r = await analyze(provider);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("AI_OUTPUT_INVALID");
  });
});
