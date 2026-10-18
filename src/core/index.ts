import { notImplementedResult, type Deps, type Result, type VerificationLinkView } from "@/contracts";

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

// ----- handoff, operator, read models, demo reset, slice 2(c) -----
export { recordHandoff } from "./service/handoff";
export { operatorAction } from "./service/operator";
export { getDashboardSnapshot } from "./service/dashboard";
export { setLastTick, getSystemStatus } from "./service/status";
export { resetDemo } from "./service/demo";
