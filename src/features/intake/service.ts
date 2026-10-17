import {
  err,
  ok,
  type Actor,
  type Deps,
  type DonationCard,
  type Result,
  type VisionProvider,
  type VisionSuggestion,
} from "@/contracts";
import { validateImage, type ImageSource } from "./image-validation";
import { computeEditedFromAi, parseVerifiedFacts } from "./verified-facts";

// Lane-private intake service. It validates, calls injected core functions and vision, and never writes
// donation rows itself (CONTRACTS §9.2). It never calls dispatch: eligible donations are picked up by the
// worker tick (D-021). Core errors pass through unchanged.

export type IntakeCore = Pick<
  typeof import("@/core"),
  "storeDonationImage" | "createDraft" | "attachAiResult" | "submitVerification" | "getDonationCard"
>;

export const VISION_TIMEOUT_MS = 15_000;

export type CreateDraftInput = {
  actor: Actor;
  image: { mime: string; bytes_base64: string };
  source: ImageSource;
  source_ref?: string;
};

/** Race vision against the timeout. Throws, timeouts and late answers all become PROVIDER_UNAVAILABLE. */
async function analyze(
  vision: VisionProvider,
  image: { mime: string; bytes_base64: string },
  timeoutMs: number,
): Promise<Result<VisionSuggestion>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Result<VisionSuggestion>>((resolve) => {
    timer = setTimeout(
      () => resolve(err("PROVIDER_UNAVAILABLE", "Vision call timed out", { retryable: true })),
      timeoutMs,
    );
  });
  const call = (async () => vision.analyzeFoodImage({ image }))().catch(() =>
    err<VisionSuggestion>("PROVIDER_UNAVAILABLE", "Vision provider failed", { retryable: true }),
  );
  try {
    return await Promise.race([call, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function createIntakeService(config: { core: IntakeCore; vision: VisionProvider; timeout_ms?: number }) {
  const { core, vision, timeout_ms = VISION_TIMEOUT_MS } = config;

  async function createDraftFromImage(input: CreateDraftInput, deps?: Deps): Promise<Result<DonationCard>> {
    const valid = validateImage(input.image, input.source);
    if (!valid.ok) return valid;

    const stored = await core.storeDonationImage(
      { mime: valid.data.mime, bytes: Buffer.from(input.image.bytes_base64, "base64") },
      deps,
    );
    if (!stored.ok) return stored;

    const draft = await core.createDraft(
      { actor: input.actor, image_id: stored.data.image_id, source: input.source, source_ref: input.source_ref ?? null },
      deps,
    );
    if (!draft.ok) return draft;
    // Idempotent repeat (same source_ref): the AI step already ran, so do not call vision again.
    if (draft.data.ai_status !== "pending") return draft;

    const analysis = await analyze(deps?.vision ?? vision, { mime: valid.data.mime, bytes_base64: input.image.bytes_base64 }, timeout_ms);
    return core.attachAiResult(
      {
        donation_id: draft.data.id,
        result: analysis.ok ? { ok: true, suggestion: analysis.data } : { ok: false, error_code: analysis.error.code },
      },
      deps,
    );
  }

  async function submitDonorVerification(
    input: { actor: Actor; donation_id: string; raw: unknown },
    deps?: Deps,
  ): Promise<Result<DonationCard>> {
    const facts = parseVerifiedFacts(input.raw);
    if (!facts.ok) return facts;

    const card = await core.getDonationCard(input.actor, input.donation_id, deps);
    if (!card.ok) return card;

    const submitted = await core.submitVerification(
      {
        auth: { actor: input.actor },
        donation_id: input.donation_id,
        facts: facts.data,
        edited_from_ai: computeEditedFromAi(card.data.ai_suggestion, facts.data),
      },
      deps,
    );
    return submitted.ok ? ok(submitted.data.card) : submitted;
  }

  return { createDraftFromImage, submitDonorVerification };
}

export type IntakeService = ReturnType<typeof createIntakeService>;
