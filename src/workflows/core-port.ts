import type {
  ActorRole,
  ClaimCommand,
  ClaimResult,
  DeclineCommand,
  DeclineResult,
  InboundIgnoreReason,
  InboundResult,
  MessagingIdentityStatus,
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
