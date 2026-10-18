import {
  err,
  ok,
  type Actor,
  type Deps,
  type DonationCard,
  type Result,
  type VisionProvider,
  type VerificationLinkView,
  type VisionSuggestion,
} from "@/contracts";
import { VisionSuggestion as VisionSuggestionSchema } from "@/contracts";
import { validateImage, type ImageSource } from "./image-validation";
import { computeEditedFromAi, parseVerifiedFacts } from "./verified-facts";

// Lane-private intake service. It validates, calls injected core functions and vision, and never writes
// donation rows itself (CONTRACTS §9.2). It never calls dispatch: eligible donations are picked up by the
// worker tick (D-021). Core errors pass through unchanged.

export type IntakeCore = Pick<
  typeof import("@/core"),
  | "storeDonationImage"
  | "createDraft"
  | "attachAiResult"
  | "submitVerification"
  | "getDonationCard"
  | "getVerificationLinkView"
  | "getVerificationLinkImage"
>;

export const VISION_TIMEOUT_MS = 15_000;

export type CreateDraftInput = {
  actor: Actor;
  image: { mime: string; bytes_base64: string };
  source: ImageSource;
  source_ref?: string;
};

/** A custom provider could skip parseVisionOutput: re-check the contract (literal flags) and that its mode is honest. */
function revalidate(suggestion: VisionSuggestion, providerMode: VisionProvider["mode"]): Result<VisionSuggestion> {
  const parsed = VisionSuggestionSchema.safeParse(suggestion);
  if (!parsed.success || parsed.data.mode !== providerMode) {
    return err("AI_OUTPUT_INVALID", "Provider result failed the VisionSuggestion contract");
  }
  return ok(parsed.data);
}

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
    const result = await Promise.race([call, timeout]);
    return result.ok ? revalidate(result.data, vision.mode) : result;
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

  /** Link path (CONTRACTS section 8.4). Opening a link never consumes it. */
  async function getLinkVerification(input: { token: string }, deps?: Deps): Promise<Result<VerificationLinkView>> {
    return core.getVerificationLinkView(input, deps);
  }

  async function getLinkVerificationImage(
    input: { token: string },
    deps?: Deps,
  ): Promise<Result<{ mime: string; bytes: Uint8Array }>> {
    return core.getVerificationLinkImage(input, deps);
  }

  /**
   * Same parsing and edited_from_ai code as the web path. Facts are parsed first, so a schema-invalid body makes no
   * core call and the link stays live; core consumes the link only on a successful submit (one transaction).
   */
  async function submitDonorVerificationByLink(
    input: { token: string; raw: unknown },
    deps?: Deps,
  ): Promise<Result<VerificationLinkView>> {
    const facts = parseVerifiedFacts(input.raw);
    if (!facts.ok) return facts;

    const view = await core.getVerificationLinkView({ token: input.token }, deps);
    if (!view.ok) return view;

    const submitted = await core.submitVerification(
      {
        auth: { link_token: input.token },
        donation_id: view.data.donation_id,
        facts: facts.data,
        edited_from_ai: computeEditedFromAi(view.data.ai_suggestion, facts.data),
      },
      deps,
    );
    if (!submitted.ok) return submitted;

    const { card, resubmit_token } = submitted.data;
    // The submit already succeeded and consumed the link, so nothing below may turn it into an error. The old
    // link's expiry is the fallback if the fresh link's view cannot be read.
    let link_expires_at = view.data.link_expires_at;
    if (resubmit_token) {
      try {
        const fresh = await core.getVerificationLinkView({ token: resubmit_token }, deps);
        if (fresh.ok) link_expires_at = fresh.data.link_expires_at;
      } catch {
        /* keep the fallback */
      }
    }
    return ok({
      donation_id: card.id,
      donor_display_name: card.donor_display_name,
      status: card.status,
      ai_status: card.ai_status,
      ai_suggestion: card.ai_suggestion,
      verified_facts: card.verified_facts,
      decision: card.decision,
      link_expires_at,
      resubmit_token,
      is_synthetic: true,
    });
  }

  return { createDraftFromImage, submitDonorVerification, getLinkVerification, getLinkVerificationImage, submitDonorVerificationByLink };
}

export type IntakeService = ReturnType<typeof createIntakeService>;
