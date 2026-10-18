import type { Actor, DonationCard, DraftReadyView, InboundMessage, Result } from "@/contracts";
import type { FetchImageResult } from "@/integrations/photon/attachments";
import type { IdentityView } from "./core-port";
import { formatDraftReadyMessage, intakeFailedText, linkUnavailableText } from "./templates";

// A joined donor's photo (CONTRACTS §3.10, §8.4, D-031): download the exact bytes, have Dev 1's intake draft it, have core
// issue the one-time checklist link, and reply with the AI guess plus the link. Anything that goes wrong before a draft
// exists becomes `intake_failed`. Unexpected errors throw so the delivery is retried (intake is idempotent on source_ref).
// The token only ever appears inside the reply text. It is never logged and never part of a key.

export type PhotoReply = {
  purpose: "draft_ready" | "intake_failed";
  text: string;
  idempotency_key: string;
} | null;

export type PhotoDeps = {
  /** A Photon attachment id, or in fake mode a fixture id from the simulated phone. */
  fetchImage(ref: { provider_attachment_id?: string; fixture_id?: string }): Promise<FetchImageResult>;
  /** Dev 1's createDraftFromImage (through its barrel). */
  createDraft(input: {
    actor: Actor;
    image: { mime: string; bytes_base64: string };
    source: "messaging";
    source_ref: string;
  }): Promise<Result<DonationCard>>;
  /** Core's issueVerificationLink. */
  issueLink(input: { donation_id: string }): Promise<Result<{ link_id: string; token: string; expires_at: string }>>;
  hasOutboundMessage(idempotency_key: string): Promise<boolean>;
  appBaseUrl(): string | undefined;
  demoMode(): boolean;
};

/** Errors that mean "this photo cannot become a draft": the donor gets intake_failed. Everything else is retried. */
const REFUSALS = new Set(["VALIDATION_FAILED", "NOT_AUTHORIZED"]);

/** The only issueVerificationLink results worth a retry: a fault on our side, not a decision about this donation. */
const RETRIED_LINK_FAULTS = new Set(["INTERNAL"]);

export function createPhotoHandler(deps: PhotoDeps) {
  return async function handlePhoto(identity: IdentityView, msg: InboundMessage): Promise<PhotoReply> {
    const base = deps.appBaseUrl()?.replace(/\/+$/, "");
    if (!base) {
      // Every donor photo retries until this is fixed, so make the cause obvious to whoever is watching the logs.
      console.error("[photo] APP_BASE_URL is not set: donor photos cannot be given a checklist link until it is");
      throw new Error("APP_BASE_URL is not set, so a checklist link cannot be built");
    }

    const failed: PhotoReply = {
      purpose: "intake_failed",
      text: intakeFailedText(),
      idempotency_key: `reply:${msg.provider_message_id}:v1`,
    };

    const attachment = msg.attachments.find((a) => a.kind === "image");
    if (!attachment) return failed;

    const fetched = await deps.fetchImage({
      provider_attachment_id: attachment.provider_attachment_id,
      fixture_id: attachment.fixture_id,
    });
    if (!fetched.ok) return failed;

    const draft = await deps.createDraft({
      actor: { role: "donor", id: identity.actor_id },
      image: { mime: fetched.image.mime, bytes_base64: Buffer.from(fetched.image.bytes).toString("base64") },
      source: "messaging",
      source_ref: `${msg.provider}:${msg.provider_message_id}`,
    });
    if (!draft.ok) {
      if (REFUSALS.has(draft.error.code)) return failed;
      throw new Error(
        draft.error.code === "NOT_IMPLEMENTED"
          ? "NOT_IMPLEMENTED (owner Dev 1): createDraftFromImage"
          : `createDraftFromImage failed: ${draft.error.code}`,
      );
    }
    const card = draft.data;

    // A reprocessed message must not issue a second link or send a second reply for the same draft.
    const idempotency_key = `draft_ready:${card.id}:v1`;
    if (await deps.hasOutboundMessage(idempotency_key)) return null;

    const link = await deps.issueLink({ donation_id: card.id });
    if (!link.ok) {
      // Core refusing to issue a link (not built yet, donation no longer open, donor not joined, not found) will not change
      // on a retry, and throwing would make the relay redeliver this photo forever and hold every later inbound message (a
      // courier's YES included) behind it. Answer instead, so the cursor moves on. Only a system fault (INTERNAL) is retried.
      if (RETRIED_LINK_FAULTS.has(link.error.code)) throw new Error(`issueVerificationLink failed: ${link.error.code}`);
      const reason = link.error.details?.reason;
      console.error(
        `[photo] issueVerificationLink refused: ${link.error.code}${typeof reason === "string" && /^[a-z_]{1,40}$/.test(reason) ? ` (${reason})` : ""}; the donor was pointed to the web upload`,
      );
      return { purpose: "intake_failed", text: linkUnavailableText(), idempotency_key: failed.idempotency_key };
    }

    const view: DraftReadyView = {
      ai_status: card.ai_status,
      dish_guess: card.ai_suggestion?.dish_suggestions[0]?.name ?? null,
      possible_allergens: [...new Set(card.ai_suggestion?.possible_allergens.map((p) => p.allergen) ?? [])],
      link_url: `${base}/v#${link.data.token}`,
      link_expires_at: link.data.expires_at,
      demo_mode: deps.demoMode(),
    };
    return { purpose: "draft_ready", text: formatDraftReadyMessage(view), idempotency_key };
  };
}
