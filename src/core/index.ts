import {
  notImplementedError,
  notImplementedResult,
  type Actor,
  type DashboardSnapshot,
  type Deps,
  type DonationCard,
  type HandoffStep,
  type OperatorAction,
  type Result,
  type StoreKind,
  type VerificationLinkView,
} from "@/contracts";

// Barrel owned by Dev 2 after the baseline (keep exported names stable). CONTRACTS §9.3.
// Core functions get time from the injected Clock; none accepts a client timestamp.
// Shapes marked "contracts-2" are lane-internal until the captain's follow-up PR types them.

const OWNER = "Dev 2";

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

// ----- claim, decline, STOP, slice 2(b) -----
export { claimOffer, declineOffer } from "./service/claims";
export { optOutIdentity } from "./service/opt-out";

// ----- dispatch, slice 2(b) -----
export {
  createNextOffers,
  openOfferForSend,
  markOfferSendFailed,
  recordOfferProviderMessage,
  expireDue,
  listPendingSendOffers,
  listDispatchableDonations,
} from "./service/dispatch";

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











// ----- messaging identities and logs -----










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
