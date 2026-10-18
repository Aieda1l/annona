import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ContentListUnion, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import { ALLERGENS, VisionModelOutput, err, type Result, type VisionProvider, type VisionSuggestion } from "@/contracts";
import { parseVisionOutput } from "./parse";

// Real Gemini vision adapter (server-only). It takes an injected SDK client so production can pass an
// API-key client and local runs can pass a Vertex/ADC client through the same code. Every failure fails
// closed: provider errors, safety blocks and timeouts are PROVIDER_UNAVAILABLE; unusable model output is
// AI_OUTPUT_INVALID (via parseVisionOutput). It never returns fake output and never echoes error text,
// which could carry credentials.

/** The slice of the `@google/genai` client this adapter uses. `new GoogleGenAI(...)` satisfies it. */
export type GeminiClientLike = {
  models: {
    generateContent(params: {
      model: string;
      contents: ContentListUnion;
      config: {
        responseMimeType: string;
        responseJsonSchema: unknown;
        abortSignal: AbortSignal;
        thinkingConfig?: { thinkingLevel: ThinkingLevel };
      };
    }): Promise<{
      text?: string;
      modelVersion?: string;
      promptFeedback?: { blockReason?: string };
      candidates?: Array<{ finishReason?: string }>;
    }>;
  };
};

export const PROMPT_VERSIONS = ["v1", "v2", "v3"] as const;
export type PromptVersion = (typeof PROMPT_VERSIONS)[number];
/** Stays v1 until a version passes the release rule (docs/PROMPT_EVAL.md §6); flip this one constant then. */
export const DEFAULT_PROMPT_VERSION: PromptVersion = "v1";
export const promptPathFor = (version: PromptVersion) => `src/lib/ai/prompts/annona-intake.${version}.md`;

// The service allows 15 s in total (D-012); the adapter works inside 14 s of it. One attempt may use up to 9 s: a
// production call from iad1 took about 6 s (issue #61), and a 7 s cut-off threw away slow but valid answers. The retry
// exists for a fast failure (429, 5xx, network) or a stall, and gets only the time left, never a fresh 9 s. Vision has
// no side effects, so retrying a retryable provider failure is safe.
export const GEMINI_ATTEMPT_TIMEOUT_MS = 9_000;
export const GEMINI_TOTAL_BUDGET_MS = 14_000;
export const GEMINI_MAX_ATTEMPTS = 2;

// Second opinion from a stronger model (docs/PROMPT_EVAL.md §13). It runs inside the same total budget as the
// retry path (attempts x timeout = 14 s, under the 15 s the service allows) and only when at least this much
// time is left. Measured 2026-10-17: gemini-3.8-flash at the default thinking level took 8-37 s; at LOW it took
// 2.6-4.6 s with no thinking tokens (MINIMAL is rejected by this model).
export const DEFAULT_ESCALATION_MODEL = "gemini-3.8-flash";
export const ESCALATION_MIN_REMAINING_MS = 3_000;
// The SDK's enum is a string enum; a literal avoids a runtime import of the SDK in this module.
const ESCALATION_THINKING = { thinkingLevel: "LOW" as unknown as ThinkingLevel };
const MAX_HINT_CHARS = 200;

/** Finish reasons that mean the provider declined to answer: a blocked photo, not bad model output. */
const BLOCKED_FINISH_REASONS = new Set([
  "SAFETY",
  "PROHIBITED_CONTENT",
  "BLOCKLIST",
  "SPII",
  "IMAGE_SAFETY",
  "IMAGE_PROHIBITED_CONTENT",
  "RECITATION",
]);

// The model-facing schema is the contract's VisionModelOutput, so there is no second schema to drift.
const RESPONSE_JSON_SCHEMA = (() => {
  const schema = z.toJSONSchema(VisionModelOutput, { io: "output" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
})();

/**
 * The stronger model for second opinions. Unset env means the default model; `off`, `none` or empty disables it;
 * a model equal to the base model is pointless, so it is disabled too.
 */
export function resolveEscalationModel(base: string, envValue: string | undefined): string | undefined {
  const value = envValue === undefined ? DEFAULT_ESCALATION_MODEL : envValue.trim();
  if (!value || ["off", "none"].includes(value.toLowerCase())) return undefined;
  return value === base ? undefined : value;
}

/**
 * True when the first model is not confident: the photo is usable but no dish is above `low`. A `poor` or
 * `not_food` rating is about the photo, which a stronger model cannot fix, so it never escalates.
 */
export function needsSecondOpinion(s: VisionSuggestion): boolean {
  return s.image_quality === "usable" && (s.dish_suggestions.length === 0 || s.dish_suggestions.every((d) => d.confidence === "low"));
}

/** One line of plain text: control characters removed, whitespace collapsed, capped. Never instructions. */
export function sanitizeHint(hint: string | undefined): string {
  const cleaned = (hint ?? "").replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim().slice(0, MAX_HINT_CHARS);
  return cleaned || "none provided";
}

/** Fill the template slots. Function replacers keep `$&`-style text in the hint literal; the hint goes in last. */
export function renderPrompt(template: string, donorHint: string | undefined): string {
  return template
    .replace("{{allergen_list}}", () => ALLERGENS.join(", "))
    .replace("{{donor_hint}}", () => sanitizeHint(donorHint));
}

function unavailable(message: string, retryable: boolean, details?: Record<string, unknown>): Result<VisionSuggestion> {
  return err("PROVIDER_UNAVAILABLE", message, { retryable, ...(details ? { details } : {}) });
}

function classify(error: unknown): Result<VisionSuggestion> {
  const raw = (error as { status?: unknown } | null)?.status;
  const status = typeof raw === "number" ? raw : undefined;
  if (status === undefined) return unavailable("Gemini request failed", true, { reason: "network" });
  return unavailable(`Gemini request failed (HTTP ${status})`, status === 429 || status >= 500, { status, reason: `http_${status}` });
}

/**
 * A coarse, text-free cause for a stored failure (issue #61): `timeout`, `network`, `http_<status>` or `blocked`.
 * Never the provider's message or block text, which could carry credentials or the photo's content.
 */
function reasonOf(result: Result<VisionSuggestion>): string | null {
  if (result.ok) return null;
  const reason = result.error.details?.reason;
  return typeof reason === "string" && /^[a-z0-9_]{1,24}$/.test(reason) ? reason : null;
}

export type GeminiAttemptEvent = {
  attempt: number;
  ok: boolean;
  error_code?: string;
  retryable?: boolean;
  ms: number;
  /** The model this attempt asked for. */
  model: string;
  /** True for the stronger-model second opinion. */
  escalated: boolean;
};

export function createGeminiProvider(config: {
  client: GeminiClientLike;
  model: string;
  /** Per-attempt timeout (a later attempt gets at most what is left of the total). */
  timeout_ms?: number;
  /** Total time for all attempts and the second opinion. Default: 14 s, or `timeout_ms` x attempts when `timeout_ms` is set. */
  total_budget_ms?: number;
  /** Total attempts, including the first. 1 disables the retry. */
  max_attempts?: number;
  promptVersion?: PromptVersion;
  /**
   * Stronger model for a second opinion when the first answer is not confident (see needsSecondOpinion). One
   * attempt, no retry, LOW thinking, within the same total budget. If it fails for any reason the first answer is
   * kept, so escalation can never make availability worse. Ignored when equal to `model`.
   */
  escalation_model?: string;
  /** Called after every attempt (for evals and logs). Receives no request or response content. */
  onAttempt?: (event: GeminiAttemptEvent) => void;
  /** Test seam; overrides the prompt file for the version. */
  promptPath?: string;
}): VisionProvider {
  const { client, model, timeout_ms = GEMINI_ATTEMPT_TIMEOUT_MS, max_attempts = GEMINI_MAX_ATTEMPTS } = config;
  const promptVersion = config.promptVersion ?? DEFAULT_PROMPT_VERSION;

  let template: string | null = null;
  try {
    template = readFileSync(config.promptPath ?? join(process.cwd(), promptPathFor(promptVersion)), "utf8");
  } catch {
    template = null; // reported as status "misconfigured"; every call fails closed
  }

  async function attemptOnce(
    prompt: string,
    image: { mime: string; bytes_base64: string },
    opts: { model: string; timeoutMs: number; thinking?: boolean } = { model, timeoutMs: timeout_ms },
  ): Promise<Result<VisionSuggestion>> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<Result<VisionSuggestion>>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(unavailable("Gemini request timed out", true, { reason: "timeout" }));
      }, opts.timeoutMs);
    });

    const call = (async (): Promise<Result<VisionSuggestion>> => {
      try {
        const response = await client.models.generateContent({
          model: opts.model,
          contents: [
            {
              role: "user",
              parts: [{ inlineData: { mimeType: image.mime, data: image.bytes_base64 } }, { text: prompt }],
            },
          ],
          config: {
            responseMimeType: "application/json",
            responseJsonSchema: RESPONSE_JSON_SCHEMA,
            abortSignal: controller.signal,
            ...(opts.thinking ? { thinkingConfig: ESCALATION_THINKING } : {}),
          },
        });

        const blockReason = response.promptFeedback?.blockReason;
        const finishReason = response.candidates?.[0]?.finishReason;
        if (
          (blockReason && blockReason !== "BLOCKED_REASON_UNSPECIFIED") ||
          (finishReason && BLOCKED_FINISH_REASONS.has(finishReason))
        ) {
          return unavailable("Gemini declined to process this photo", false, { reason: "blocked", block_reason: blockReason ?? finishReason });
        }

        return parseVisionOutput(response.text ?? "", {
          provider: "gemini",
          model: response.modelVersion || opts.model,
          mode: "real",
          prompt_version: promptVersion,
        });
      } catch (error) {
        return classify(error);
      }
    })();

    try {
      return await Promise.race([call, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    mode: "real",
    model,
    status: template === null ? "misconfigured" : "ok",
    async analyzeFoodImage({ image, donor_hint }) {
      if (template === null) return unavailable("Vision prompt is not available", false);
      const prompt = renderPrompt(template, donor_hint);

      const startedAll = Date.now();
      const budget_ms =
        config.total_budget_ms ?? (config.timeout_ms === undefined ? GEMINI_TOTAL_BUDGET_MS : timeout_ms * Math.max(1, max_attempts));
      const report = (attempt: number, result: Result<VisionSuggestion>, started: number, usedModel: string, escalated: boolean) => {
        const failure = result.ok ? null : result.error;
        config.onAttempt?.({
          attempt,
          ok: result.ok,
          ...(failure ? { error_code: failure.code, retryable: failure.retryable } : {}),
          ms: Date.now() - started,
          model: usedModel,
          escalated,
        });
      };

      let result: Result<VisionSuggestion> = unavailable("Gemini request failed", true);
      const trail: string[] = [];
      for (let attempt = 1; attempt <= Math.max(1, max_attempts); attempt++) {
        const started = Date.now();
        const left = budget_ms - (started - startedAll);
        result = await attemptOnce(prompt, image, { model, timeoutMs: Math.max(1, Math.min(timeout_ms, left)) });
        report(attempt, result, started, model, false);
        const cause = reasonOf(result);
        if (cause) trail.push(cause);
        const failure = result.ok ? null : result.error;
        // Retry only retryable provider failures (stalls, network, 429, 5xx). Never retry a safety block, a 4xx,
        // or bad model output: re-rolling until the output passes would defeat the fail-closed guard.
        const retryable = failure !== null && failure.code === "PROVIDER_UNAVAILABLE" && failure.retryable;
        if (!retryable) break;
      }

      // Second opinion: only for a valid but unconfident answer, within the remaining budget, once.
      const escalationModel = config.escalation_model;
      if (escalationModel && escalationModel !== model && result.ok && needsSecondOpinion(result.data)) {
        const remaining = budget_ms - (Date.now() - startedAll);
        if (remaining >= ESCALATION_MIN_REMAINING_MS) {
          const started = Date.now();
          const second = await attemptOnce(prompt, image, { model: escalationModel, timeoutMs: remaining, thinking: true });
          report(1, second, started, escalationModel, true);
          if (second.ok) return second; // same strict parse and claim-word guard as the first answer
        }
      }
      // Every attempt's cause, joined with "." (a stall then a fast 429 reads `timeout.http_429`).
      if (!result.ok && trail.length > 0) {
        return { ok: false, error: { ...result.error, details: { ...result.error.details, reason: trail.join(".") } } };
      }
      return result;
    },
  };
}
