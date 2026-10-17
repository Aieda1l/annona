import {
  notImplementedError,
  notImplementedResult,
  type Actor,
  type ClaimCommand,
  type ClaimResult,
  type DashboardSnapshot,
  type DeclineCommand,
  type DeclineResult,
  type Deps,
  type DonationCard,
  type HandoffStep,
  type OfferMessageView,
  type OperatorAction,
  type Result,
  type StoreKind,
  type VerificationLinkView,
} from "@/contracts";

// Barrel owned by Dev 2 after the baseline (keep exported names stable). CONTRACTS §9.3.
// Core functions get time from the injected Clock; none accepts a client timestamp.
// Shapes marked "contracts-2" are lane-internal until the captain's follow-up PR types them.

const OWNER = "Dev 2";
type Pending = Record<string, unknown>; // contracts-2: replace with the typed entity

// ----- pure (CONTRACTS §9.3) -----
export { evaluateEligibility } from "./eligibility";
export { findCandidates } from "./matching";
export { createTestClock } from "./clock";

// ----- messaging identities and logs, slice 2(b) -----
export { resolveIdentityByHandle, getIdentity, joinIdentity, findOpenOffersForCourier } from "./service/identities";
export {
  recordInboundMessage,
  saveInboundResult,
  recordIgnoredInbound,
  recordOutboundMessage,
  hasOutboundMessage,
  listMessages,
  recordStatusEvent,
  recordDeliveryStatus,
} from "./service/messages";

// ----- intake (called by Dev 1), slice 2(a) -----
export { storeDonationImage, createDraft, attachAiResult, submitVerification } from "./service/intake";
export { getDonationCard } from "./service/cards";




// ----- verification links -----
export async function issueVerificationLink(
  _input: { donation_id: string },
  _deps?: Deps,
): Promise<Result<{ link_id: string; token: string; expires_at: string }>> {
  return notImplementedResult(OWNER, "issueVerificationLink");
}

export async function getVerificationLinkView(_input: { token: string }, _deps?: Deps): Promise<Result<VerificationLinkView>> {
  return notImplementedResult(OWNER, "getVerificationLinkView");
}

export async function getVerificationLinkImage(
  _input: { token: string },
  _deps?: Deps,
): Promise<Result<{ mime: string; bytes: Uint8Array }>> {
  return notImplementedResult(OWNER, "getVerificationLinkImage");
}

// ----- dispatch -----
export async function createNextOffers(_input: { donation_id: string }, _deps?: Deps): Promise<Result<Pending[]>> {
  return notImplementedResult(OWNER, "createNextOffers");
}

export async function openOfferForSend(
  _input: { offer_id: string },
  _deps?: Deps,
): Promise<Result<{ offer: Pending; identity: Pending; message_view: OfferMessageView }>> {
  return notImplementedResult(OWNER, "openOfferForSend");
}

export async function markOfferSendFailed(_input: { offer_id: string; reason: string }, _deps?: Deps): Promise<Result<Pending>> {
  return notImplementedResult(OWNER, "markOfferSendFailed");
}

export async function recordOfferProviderMessage(
  _input: { offer_id: string; provider_message_id: string },
  _deps?: Deps,
): Promise<Result<Pending>> {
  return notImplementedResult(OWNER, "recordOfferProviderMessage");
}



export async function claimOffer(_command: ClaimCommand, _deps?: Deps): Promise<ClaimResult> {
  throw notImplementedError(OWNER, "claimOffer");
}

export async function declineOffer(_command: DeclineCommand, _deps?: Deps): Promise<DeclineResult> {
  throw notImplementedError(OWNER, "declineOffer");
}

export async function expireDue(
  _deps?: Deps,
): Promise<{ expired_offer_ids: string[]; expired_donation_ids: string[]; dispatchable_donation_ids: string[] }> {
  throw notImplementedError(OWNER, "expireDue");
}

export async function listPendingSendOffers(_deps?: Deps): Promise<Pending[]> {
  throw notImplementedError(OWNER, "listPendingSendOffers");
}

export async function listDispatchableDonations(_deps?: Deps): Promise<Pending[]> {
  throw notImplementedError(OWNER, "listDispatchableDonations");
}

// ----- messaging identities and logs -----



export async function optOutIdentity(_input: { identity_id: string }, _deps?: Deps): Promise<Result<Pending>> {
  return notImplementedResult(OWNER, "optOutIdentity");
}







// ----- handoff, operator, read models -----
export async function recordHandoff(
  _input: { actor: Actor; donation_id: string; step: HandoffStep; simulated: true },
  _deps?: Deps,
): Promise<Result<DonationCard>> {
  return notImplementedResult(OWNER, "recordHandoff");
}

export async function operatorAction(
  _input: { actor: Actor; donation_id: string; action: OperatorAction; note: string },
  _deps?: Deps,
): Promise<Result<DonationCard>> {
  return notImplementedResult(OWNER, "operatorAction");
}


export async function getDashboardSnapshot(_actor: Actor, _deps?: Deps): Promise<Result<DashboardSnapshot>> {
  return notImplementedResult(OWNER, "getDashboardSnapshot");
}

export async function setLastTick(_at: string, _deps?: Deps): Promise<void> {
  throw notImplementedError(OWNER, "setLastTick");
}

export async function getSystemStatus(
  _deps?: Deps,
): Promise<{ last_tick_at: string | null; store: StoreKind; policy_version: string }> {
  throw notImplementedError(OWNER, "getSystemStatus");
}

export async function resetDemo(_input: { keep_identities: true }, _deps?: Deps): Promise<Result<{ reset_at: string }>> {
  return notImplementedResult(OWNER, "resetDemo");
}
