import type {
  ActorRole,
  ClaimCommand,
  ClaimResult,
  DeclineCommand,
  DeclineResult,
  DeliveryStatusEvent,
  InboundIgnoreReason,
  InboundResult,
  MessagingIdentityStatus,
  OfferMessageView,
  OutboundMessage,
  Result,
} from "@/contracts";

// The slice of Dev 2's core that messaging uses (CONTRACTS §9.3), typed on my side of the boundary.
// Core's lane-internal shapes are untyped until the captain's contracts-2 PR, so the workflows depend on this
// port and tests inject an in-memory double. A thin adapter over `@/core` fills it at CP1.5.

/** The fields of a MessagingIdentity (CONTRACTS §3.1) that the messaging lane reads. */
export type IdentityView = {
  id: string;
  handle: string;
  provider: "photon" | "fake";
  actor_role: ActorRole;
  actor_id: string;
  status: MessagingIdentityStatus;
  provider_space_id: string | null;
  provider_sender_id: string | null;
};

export type MessagingCore = {
  recordInboundMessage(
    provider: "photon" | "fake",
    provider_message_id: string,
    payload: unknown,
  ): Promise<{ status: "first" | "duplicate"; stored_result: InboundResult | null }>;
  saveInboundResult(input: {
    provider: "photon" | "fake";
    provider_message_id: string;
    result: InboundResult;
  }): Promise<void>;
  resolveIdentityByHandle(provider: "photon" | "fake", handle: string): Promise<IdentityView | null>;
  getIdentity(identity_id: string): Promise<IdentityView | null>;
  joinIdentity(input: {
    identity_id: string;
    provider_space_id: string | null;
    provider_sender_id: string | null;
  }): Promise<Result<unknown>>;
  optOutIdentity(input: { identity_id: string }): Promise<Result<unknown>>;
  findOpenOffersForCourier(courier_id: string): Promise<{ offer_id: string }[]>;
  claimOffer(command: ClaimCommand): Promise<ClaimResult>;
  declineOffer(command: DeclineCommand): Promise<DeclineResult>;
  recordIgnoredInbound(input: {
    provider: "photon" | "fake";
    provider_message_id: string;
    reason: InboundIgnoreReason;
    handle_masked: string;
  }): Promise<void>;
  recordOutboundMessage(input: { message: OutboundMessage; provider_message_id: string | null }): Promise<void>;
  /** True when outbound_messages already holds this idempotency key (makes reprocessing a reclaimed row safe). */
  hasOutboundMessage(idempotency_key: string): Promise<boolean>;
};

/** The dispatch side of core that tick() drives (CONTRACTS §7, §9.3). Every step is a conditional update in core. */
export type DispatchCore = {
  expireDue(): Promise<{
    expired_offer_ids: string[];
    expired_donation_ids: string[];
    dispatchable_donation_ids: string[];
  }>;
  listDispatchableDonations(): Promise<{ donation_id: string }[]>;
  /** Creates the next wave of offers for an eligible donation (S-04), or marks it unmatched (S-05). */
  createNextOffers(input: { donation_id: string }): Promise<Result<{ offer_id: string }[]>>;
  listPendingSendOffers(): Promise<{ offer_id: string }[]>;
  /** Commits the offer as `open` with its deadline before any send; returns what the message is built from. */
  openOfferForSend(input: {
    offer_id: string;
  }): Promise<Result<{ offer_id: string; identity: IdentityView; message_view: OfferMessageView }>>;
  markOfferSendFailed(input: { offer_id: string; reason: string }): Promise<Result<unknown>>;
  recordOfferProviderMessage(input: { offer_id: string; provider_message_id: string }): Promise<Result<unknown>>;
  setLastTick(at: string): Promise<void>;
};

/** Delivery-status side of core (CONTRACTS §9.3): dedupe by provider_event_id, then update the matching offer. */
export type DeliveryCore = {
  recordStatusEvent(evt: DeliveryStatusEvent): Promise<"first" | "duplicate">;
  /** Updates the offer whose provider_message_id matches; offer_id is null for messages that are not offers. */
  recordDeliveryStatus(
    evt: DeliveryStatusEvent,
  ): Promise<Result<{ offer_id: string | null; offer_status: string | null }>>;
  markOfferSendFailed(input: { offer_id: string; reason: string }): Promise<Result<unknown>>;
};
