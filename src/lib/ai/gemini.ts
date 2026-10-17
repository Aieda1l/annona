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

export const DEFAULT_PROMPT_PATH = "src/lib/ai/prompts/annona-intake.v1.md";
export const GEMINI_TIMEOUT_MS = 15_000;
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

export function createGeminiProvider(config: {
  client: GeminiClientLike;
  model: string;
  timeout_ms?: number;
  /** Test seam; defaults to the v1 prompt file under the process working directory. */
  promptPath?: string;
}): VisionProvider {
  const { client, model, timeout_ms = GEMINI_TIMEOUT_MS } = config;

  let template: string | null = null;
  try {
    template = readFileSync(config.promptPath ?? join(process.cwd(), DEFAULT_PROMPT_PATH), "utf8");
  } catch {
    template = null; // reported as status "misconfigured"; every call fails closed
  }

  return {
    mode: "real",
    model,
    status: template === null ? "misconfigured" : "ok",
    async analyzeFoodImage({ image, donor_hint }) {
      if (template === null) return unavailable("Vision prompt is not available", false);

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
                parts: [
                  { inlineData: { mimeType: image.mime, data: image.bytes_base64 } },
                  { text: renderPrompt(template, donor_hint) },
                ],
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
            return unavailable("Gemini declined to process this photo", false, {
              reason: blockReason ?? finishReason,
            });
          }

          return parseVisionOutput(response.text ?? "", {
            provider: "gemini",
            model: response.modelVersion || model,
            mode: "real",
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
    },
  };
}
