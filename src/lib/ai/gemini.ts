import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ContentListUnion } from "@google/genai";
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
      config: { responseMimeType: string; responseJsonSchema: unknown; abortSignal: AbortSignal };
    }): Promise<{
      text?: string;
      modelVersion?: string;
      promptFeedback?: { blockReason?: string };
      candidates?: Array<{ finishReason?: string }>;
    }>;
  };
};

export const PROMPT_VERSIONS = ["v1", "v2"] as const;
export type PromptVersion = (typeof PROMPT_VERSIONS)[number];
/** Stays v1 until a version passes the release rule (docs/PROMPT_EVAL.md §6); flip this one constant then. */
export const DEFAULT_PROMPT_VERSION: PromptVersion = "v1";
export const promptPathFor = (version: PromptVersion) => `src/lib/ai/prompts/annona-intake.${version}.md`;

// Total budget stays 15 s (D-012): two attempts of 7 s. A typical call takes about 2 s; the retry exists for the
// occasional stall. Vision has no side effects, so retrying a retryable provider failure is safe.
export const GEMINI_ATTEMPT_TIMEOUT_MS = 7_000;
export const GEMINI_MAX_ATTEMPTS = 2;
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
  if (status === undefined) return unavailable("Gemini request failed", true);
  return unavailable(`Gemini request failed (HTTP ${status})`, status === 429 || status >= 500, { status });
}

export type GeminiAttemptEvent = { attempt: number; ok: boolean; error_code?: string; retryable?: boolean; ms: number };

export function createGeminiProvider(config: {
  client: GeminiClientLike;
  model: string;
  /** Per-attempt timeout. */
  timeout_ms?: number;
  /** Total attempts, including the first. 1 disables the retry. */
  max_attempts?: number;
  promptVersion?: PromptVersion;
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
  ): Promise<Result<VisionSuggestion>> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<Result<VisionSuggestion>>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(unavailable("Gemini request timed out", true));
      }, timeout_ms);
    });

    const call = (async (): Promise<Result<VisionSuggestion>> => {
      try {
        const response = await client.models.generateContent({
          model,
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
          },
        });

        const blockReason = response.promptFeedback?.blockReason;
        const finishReason = response.candidates?.[0]?.finishReason;
        if (
          (blockReason && blockReason !== "BLOCKED_REASON_UNSPECIFIED") ||
          (finishReason && BLOCKED_FINISH_REASONS.has(finishReason))
        ) {
          return unavailable("Gemini declined to process this photo", false, { reason: blockReason ?? finishReason });
        }

        return parseVisionOutput(response.text ?? "", {
          provider: "gemini",
          model: response.modelVersion || model,
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

      let result: Result<VisionSuggestion> = unavailable("Gemini request failed", true);
      for (let attempt = 1; attempt <= Math.max(1, max_attempts); attempt++) {
        const started = Date.now();
        result = await attemptOnce(prompt, image);
        const failure = result.ok ? null : result.error;
        config.onAttempt?.({
          attempt,
          ok: result.ok,
          ...(failure ? { error_code: failure.code, retryable: failure.retryable } : {}),
          ms: Date.now() - started,
        });
        // Retry only retryable provider failures (stalls, network, 429, 5xx). Never retry a safety block, a 4xx,
        // or bad model output: re-rolling until the output passes would defeat the fail-closed guard.
        const retryable = failure !== null && failure.code === "PROVIDER_UNAVAILABLE" && failure.retryable;
        if (!retryable) return result;
      }
      return result;
    },
  };
}
