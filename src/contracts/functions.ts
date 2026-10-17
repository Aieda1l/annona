import type { HandoffStep, InboundIgnoreReason, OperatorAction, StoreKind } from "./enums";
import type {
  Actor,
  ClaimCommand,
  ClaimResult,
  DashboardSnapshot,
  DeclineCommand,
  DeclineResult,
  DeliveryStatusEvent,
  DonationCard,
  DraftReadyView,
  InboundMessage,
  InboundResult,
  OfferMessageView,
  OutboundMessage,
  VerificationLinkView,
  VerifiedFacts,
  VisionSuggestion,
} from "./entities";
import type { Offer, DonationSource } from "./domain";
import type { MessagingIdentity } from "./profiles";
import type { ThreadMessage, TickReport } from "./ops";
import type { Deps } from "./ports";
import type { Result } from "./result";

// CONTRACTS section 9.2 to 9.4 as signature types (contracts-2b). TYPES ONLY, no runtime. The lane barrels keep
// their own function bodies; these are the shared conformance target. Parameter shapes mirror the barrels on
// main. Core and workflow functions take an optional trailing `deps` (section 9.0).
//
// NOT typed here because section 9.3 / 9.4 gives no return type (Dev 2 / Dev 3 to propose via
// docs/requests/): listDispatchableDonations, markOfferSendFailed, recordOfferProviderMessage,
// recordDeliveryStatus, joinIdentity, optOutIdentity, findOpenOffersForCourier, getIdentity.
// The pure functions evaluateEligibility and findCandidates take lane-internal input types (Dev 2).

// ----- Dev 1 (section 9.2) -----
export type CreateDraftFromImageFn = (
  input: {
    actor: Actor;
    image: { mime: string; bytes_base64: string };
    source: DonationSource;
    source_ref?: string;
  },
  deps?: Deps,
) => Promise<Result<DonationCard>>;
export type ParseVerifiedFactsFn = (raw: unknown) => Result<VerifiedFacts>;
export type SubmitDonorVerificationFn = (
  input: { actor: Actor; donation_id: string; raw: unknown },
  deps?: Deps,
) => Promise<Result<DonationCard>>;
export type GetLinkVerificationFn = (input: { token: string }, deps?: Deps) => Promise<Result<VerificationLinkView>>;
export type SubmitDonorVerificationByLinkFn = (
  input: { token: string; raw: unknown },
  deps?: Deps,
) => Promise<Result<VerificationLinkView>>;

// ----- Dev 2, called by Dev 1 (section 9.3) -----
export type StoreDonationImageFn = (
  input: { mime: string; bytes: Uint8Array },
  deps?: Deps,
) => Promise<Result<{ image_id: string }>>;
export type CreateDraftFn = (
  input: { actor: Actor; image_id: string; source: DonationSource; source_ref: string | null },
  deps?: Deps,
) => Promise<Result<DonationCard>>;
export type AttachAiResultFn = (
  input: {
    donation_id: string;
    result: { ok: true; suggestion: VisionSuggestion } | { ok: false; error_code: string };
  },
  deps?: Deps,
) => Promise<Result<DonationCard>>;
export type SubmitVerificationFn = (
  input: {
    auth: { actor: Actor } | { link_token: string };
    donation_id: string;
    facts: VerifiedFacts;
    edited_from_ai: string[];
  },
  deps?: Deps,
) => Promise<Result<{ card: DonationCard; resubmit_token: string | null }>>;
export type IssueVerificationLinkFn = (
  input: { donation_id: string },
  deps?: Deps,
) => Promise<Result<{ link_id: string; token: string; expires_at: string }>>;
export type GetVerificationLinkViewFn = (input: { token: string }, deps?: Deps) => Promise<Result<VerificationLinkView>>;
export type GetVerificationLinkImageFn = (
  input: { token: string },
  deps?: Deps,
) => Promise<Result<{ mime: string; bytes: Uint8Array }>>;

// ----- Dev 2, called by Dev 3 (section 9.3) -----
export type CreateNextOffersFn = (input: { donation_id: string }, deps?: Deps) => Promise<Result<Offer[]>>;
export type OpenOfferForSendFn = (
  input: { offer_id: string },
  deps?: Deps,
) => Promise<Result<{ offer: Offer; identity: MessagingIdentity; message_view: OfferMessageView }>>;
export type RecordStatusEventFn = (evt: DeliveryStatusEvent, deps?: Deps) => Promise<"first" | "duplicate">;
export type ClaimOfferFn = (command: ClaimCommand, deps?: Deps) => Promise<ClaimResult>;
export type DeclineOfferFn = (command: DeclineCommand, deps?: Deps) => Promise<DeclineResult>;
export type ExpireDueFn = (deps?: Deps) => Promise<{
  expired_offer_ids: string[];
  expired_donation_ids: string[];
  dispatchable_donation_ids: string[];
}>;
export type ListPendingSendOffersFn = (deps?: Deps) => Promise<Offer[]>;
export type ResolveIdentityByHandleFn = (
  provider: "photon" | "fake",
  handle: string,
  deps?: Deps,
) => Promise<MessagingIdentity | null>;
export type RecordInboundMessageFn = (
  provider: "photon" | "fake",
  provider_message_id: string,
  payload: unknown,
  deps?: Deps,
) => Promise<{ status: "first" | "duplicate"; stored_result: InboundResult | null }>;
export type SaveInboundResultFn = (
  input: { provider: "photon" | "fake"; provider_message_id: string; result: InboundResult },
  deps?: Deps,
) => Promise<void>;
export type RecordOutboundMessageFn = (
  input: { message: OutboundMessage; provider_message_id: string | null },
  deps?: Deps,
) => Promise<void>;
export type ListMessagesFn = (input: { identity_id?: string }, deps?: Deps) => Promise<ThreadMessage[]>;
export type RecordIgnoredInboundFn = (
  input: { provider: "photon" | "fake"; provider_message_id: string; reason: InboundIgnoreReason; handle_masked: string },
  deps?: Deps,
) => Promise<void>;

// ----- Dev 2, called by routes (section 9.3 / 10) -----
export type RecordHandoffFn = (
  input: { actor: Actor; donation_id: string; step: HandoffStep; simulated: true },
  deps?: Deps,
) => Promise<Result<DonationCard>>;
export type OperatorActionFn = (
  input: { actor: Actor; donation_id: string; action: OperatorAction; note: string },
  deps?: Deps,
) => Promise<Result<DonationCard>>;
export type GetDonationCardFn = (actor: Actor, id: string, deps?: Deps) => Promise<Result<DonationCard>>;
export type GetDashboardSnapshotFn = (actor: Actor, deps?: Deps) => Promise<Result<DashboardSnapshot>>;
export type SetLastTickFn = (at: string, deps?: Deps) => Promise<void>;
export type GetSystemStatusFn = (
  deps?: Deps,
) => Promise<{ last_tick_at: string | null; store: StoreKind; policy_version: string }>;
export type ResetDemoFn = (input: { keep_identities: true }, deps?: Deps) => Promise<Result<{ reset_at: string }>>;

// ----- Dev 3 (section 9.4) -----
export type HandleInboundFn = (msg: InboundMessage, deps?: Deps) => Promise<InboundResult>;
export type HandleDeliveryStatusFn = (evt: DeliveryStatusEvent, deps?: Deps) => Promise<void>;
export type TickFn = (deps?: Deps) => Promise<TickReport>;
export type DispatchDonationFn = (donation_id: string, deps?: Deps) => Promise<TickReport>;
export type FormatOfferMessageFn = (view: OfferMessageView) => string;
export type FormatDraftReadyMessageFn = (view: DraftReadyView) => string;
