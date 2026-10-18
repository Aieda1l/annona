import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALLERGENS, scene1_vision_suggestion } from "@/contracts";
import { createGeminiProvider, needsSecondOpinion, resolveEscalationModel, renderPrompt, sanitizeHint, type GeminiClientLike } from "@/lib/ai/gemini";

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
  extra: Partial<Pick<Parameters<typeof createGeminiProvider>[0], "timeout_ms" | "max_attempts" | "onAttempt" | "promptVersion" | "escalation_model">> = {},
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

// Issue #61: a prod call took ~6 s from iad1, so a 7 s cut-off lost slow-but-fine answers. One attempt may now use
// 9 s, and the retry gets only what is left of the 14 s total (never a fresh 9 s).
describe("default timing (9 s per attempt, 14 s total)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("an answer after 8 s is accepted without a retry", async () => {
    const { provider, generateContent } = setup(() => new Promise((res) => setTimeout(() => res(ok()), 8000)));
    const pending = analyze(provider);
    await vi.advanceTimersByTimeAsync(8000);
    expect((await pending).ok).toBe(true);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("a stalled first attempt is cut at 9 s and the retry gets the remaining 5 s", async () => {
    const { provider, generateContent } = setup(() => new Promise(() => {}));
    let done = false;
    const pending = analyze(provider).then((r) => ((done = true), r));
    await vi.advanceTimersByTimeAsync(9000);
    expect(generateContent).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const r = await pending;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.details?.reason).toBe("timeout.timeout");
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

describe("resolveEscalationModel", () => {
  it.each([
    [undefined, "gemini-3.5-flash-lite", "gemini-3.8-flash"],
    ["gemini-3.1-pro-preview", "gemini-3.5-flash-lite", "gemini-3.1-pro-preview"],
    [" gemini-3.8-flash ", "gemini-3.5-flash-lite", "gemini-3.8-flash"],
    ["off", "gemini-3.5-flash-lite", undefined],
    ["OFF", "gemini-3.5-flash-lite", undefined],
    ["none", "gemini-3.5-flash-lite", undefined],
    ["", "gemini-3.5-flash-lite", undefined],
    ["gemini-3.8-flash", "gemini-3.8-flash", undefined], // same as the base model: nothing to escalate to
    [undefined, "gemini-3.8-flash", undefined],
  ])("env %j with base %s -> %s", (envValue, base, expected) => {
    expect(resolveEscalationModel(base, envValue)).toBe(expected);
  });
});

describe("needsSecondOpinion", () => {
  const sug = (patch: Partial<typeof scene1_vision_suggestion>) => ({ ...scene1_vision_suggestion, ...patch });
  const dish = (c: "low" | "medium" | "high") => ({ name: "x", confidence: c });

  it.each([
    ["every dish is low", sug({ dish_suggestions: [dish("low"), dish("low")] }), true],
    ["no dish at all on a usable photo", sug({ dish_suggestions: [] }), true],
    ["one medium dish", sug({ dish_suggestions: [dish("low"), dish("medium")] }), false],
    ["a high dish", sug({ dish_suggestions: [dish("high")] }), false],
    ["a poor photo (the photo is the limit, not the model)", sug({ image_quality: "poor", dish_suggestions: [dish("low")] }), false],
    ["a non-food photo", sug({ image_quality: "not_food", dish_suggestions: [] }), false],
  ])("%s -> %s", (_label, s, expected) => {
    expect(needsSecondOpinion(s as never)).toBe(expected);
  });
});

describe("escalation to a stronger model when the first answer is not confident", () => {
  const BIG = "gemini-3.8-flash";
  const lowConfidence = () => ok({ text: JSON.stringify({ ...modelOutput(), dish_suggestions: [{ name: "mixed buffet dishes", confidence: "low" }] }) });
  const confident = () => ok({ modelVersion: BIG, text: JSON.stringify({ ...modelOutput(), dish_suggestions: [{ name: "fried rice", confidence: "high" }] }) });
  const reqOf = (g: ReturnType<typeof setup>["generateContent"], i: number) =>
    g.mock.calls[i]![0] as { model: string; config: { thinkingConfig?: { thinkingLevel: string } }; contents: { parts: { text?: string }[] }[] };

  it("asks the stronger model once, at LOW thinking, and returns its answer stamped with its own model", async () => {
    const { provider, generateContent } = setup(async () => confident(), { escalation_model: BIG });
    generateContent.mockImplementationOnce(async () => lowConfidence());
    const r = await analyze(provider);
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(reqOf(generateContent, 0).model).toBe(MODEL);
    expect(reqOf(generateContent, 0).config.thinkingConfig).toBeUndefined();
    expect(reqOf(generateContent, 1).model).toBe(BIG);
    expect(reqOf(generateContent, 1).config.thinkingConfig).toEqual({ thinkingLevel: "LOW" });
    expect(reqOf(generateContent, 1).contents[0]!.parts[1]!.text).toBe(reqOf(generateContent, 0).contents[0]!.parts[1]!.text);
    expect(r.ok && r.data.model).toBe(BIG);
    expect(r.ok && r.data.dish_suggestions[0]!.name).toBe("fried rice");
  });

  it.each([
    ["a medium-confidence dish", () => ok()],
    ["a poor photo", () => ok({ text: JSON.stringify({ ...modelOutput(), image_quality: "poor", dish_suggestions: [{ name: "x", confidence: "low" }], estimated_servings: null }) })],
    ["a non-food photo", () => ok({ text: JSON.stringify({ ...modelOutput(), image_quality: "not_food", dish_suggestions: [], visible_components: [], estimated_servings: null, possible_allergens: [] }) })],
  ])("does not escalate on %s", async (_label, first) => {
    const { provider, generateContent } = setup(async () => first(), { escalation_model: BIG });
    expect((await analyze(provider)).ok).toBe(true);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("does nothing extra when escalation is not configured", async () => {
    const { provider, generateContent } = setup(async () => lowConfidence());
    const r = await analyze(provider);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(r.ok && r.data.model).toBe(MODEL);
  });

  it("is ignored when the escalation model is the same as the base model", async () => {
    const { provider, generateContent } = setup(async () => lowConfidence(), { escalation_model: MODEL });
    await analyze(provider);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a provider error", () => Promise.reject(Object.assign(new Error("x"), { status: 503 }))],
    ["a safety block", async () => ok({ candidates: [{ finishReason: "SAFETY" }] })],
    ["unusable output", async () => ok({ text: "not json" })],
    ["a claim word", async () => ok({ text: JSON.stringify({ ...modelOutput(), uncertainty_notes: ["Looks nut-free."] }) })],
  ])("keeps the first answer when the escalation fails with %s (never worse than without it)", async (_label, bigImpl) => {
    const { provider, generateContent } = setup(async () => lowConfidence(), { escalation_model: BIG });
    generateContent.mockImplementationOnce(async () => lowConfidence());
    generateContent.mockImplementationOnce(bigImpl as never);
    const r = await analyze(provider);
    expect(r.ok).toBe(true);
    expect(r.ok && r.data.model).toBe(MODEL);
    expect(generateContent).toHaveBeenCalledTimes(2); // one escalation attempt, no retry of it
  });

  it("reports the escalated attempt through onAttempt", async () => {
    const events: Array<Record<string, unknown>> = [];
    const { provider, generateContent } = setup(async () => confident(), { escalation_model: BIG, onAttempt: (e) => events.push(e as never) });
    generateContent.mockImplementationOnce(async () => lowConfidence());
    await analyze(provider);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ attempt: 1, ok: true, escalated: false, model: MODEL });
    expect(events[1]).toMatchObject({ ok: true, escalated: true, model: BIG });
  });

  describe("time budget", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("skips escalation when less than 3 s of the 14 s budget remains", async () => {
      // first attempt stalls until cut at 9 s, the retry answers after 3 s: 12 s used, 2 s left
      const { provider, generateContent } = setup(async () => lowConfidence(), { escalation_model: BIG });
      generateContent.mockImplementationOnce(() => new Promise(() => {}));
      generateContent.mockImplementationOnce(() => new Promise((res) => setTimeout(() => res(lowConfidence()), 3000)));
      const pending = analyze(provider);
      await vi.advanceTimersByTimeAsync(12_000);
      const r = await pending;
      expect(r.ok).toBe(true);
      expect(generateContent).toHaveBeenCalledTimes(2);
    });

    it("never runs past the 14 s total: a stalled escalation is cut at the remaining time and the first answer is kept", async () => {
      const { provider, generateContent } = setup(async () => lowConfidence(), { escalation_model: BIG });
      generateContent.mockImplementationOnce(async () => lowConfidence());
      generateContent.mockImplementationOnce(() => new Promise(() => {}));
      let done = false;
      const pending = analyze(provider).then((r) => ((done = true), r));
      await vi.advanceTimersByTimeAsync(13_999);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const r = await pending;
      expect(r.ok && r.data.model).toBe(MODEL);
      expect(vi.getTimerCount()).toBe(0);
    });
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

// Issue #61: the stored failure needs a coarse cause so a deployed failure can be diagnosed. The trail covers every
// attempt, because a stall followed by a fast 429 and a plain stall look the same from the outside.
describe("failure reason trail (details.reason)", () => {
  const httpErr = (status: number) => Object.assign(new Error("boom AIza-not-a-real-key"), { status });
  const reasonOf = (r: Awaited<ReturnType<typeof analyze>>) => (r.ok ? undefined : r.error.details?.reason);

  it.each([
    [429, "http_429.http_429"],
    [503, "http_503.http_503"],
  ])("HTTP %i on both attempts", async (status, trail) => {
    const { provider } = setup(async () => Promise.reject(httpErr(status)));
    expect(reasonOf(await analyze(provider))).toBe(trail);
  });

  it("a non-retryable 403 stops after one attempt", async () => {
    const { provider } = setup(async () => Promise.reject(httpErr(403)));
    expect(reasonOf(await analyze(provider))).toBe("http_403");
  });

  it("a network error has no status", async () => {
    const { provider } = setup(async () => Promise.reject(new TypeError("fetch failed")));
    expect(reasonOf(await analyze(provider))).toBe("network.network");
  });

  it("a safety block is 'blocked', without the provider's block text", async () => {
    const { provider } = setup(async () => ok({ candidates: [{ finishReason: "SAFETY" }] }));
    expect(reasonOf(await analyze(provider))).toBe("blocked");
  });

  it("a stall then a fast 429 keeps both causes", async () => {
    vi.useFakeTimers();
    try {
      let n = 0;
      const { provider } = setup(() => (++n === 1 ? new Promise(() => {}) : Promise.reject(httpErr(429))), { timeout_ms: 7000 });
      const pending = analyze(provider);
      await vi.advanceTimersByTimeAsync(7000);
      expect(reasonOf(await pending)).toBe("timeout.http_429");
    } finally {
      vi.useRealTimers();
    }
  });

  it("never carries error text", async () => {
    const { provider } = setup(async () => Promise.reject(httpErr(500)));
    expect(JSON.stringify(await analyze(provider))).not.toMatch(/AIza|boom/);
  });
});
