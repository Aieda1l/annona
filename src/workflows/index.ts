import {
  notImplementedError,
  type Deps,
  type DeliveryStatusEvent,
  type DraftReadyView,
  type InboundMessage,
  type InboundResult,
  type OfferMessageView,
} from "@/contracts";

// Barrel owned by Dev 3 after the baseline (keep exported names stable). CONTRACTS §9.4.

const OWNER = "Dev 3";

export type TickReport = {
  at: string;
  expired_offers: number;
  expired_donations: number;
  offers_created: number;
  offers_sent: number;
  send_failures: number;
};

/** Same path for real Photon messages and simulated-phone messages, including donor photos. */
export async function handleInbound(_msg: InboundMessage, _deps?: Deps): Promise<InboundResult> {
  throw notImplementedError(OWNER, "handleInbound");
}

export async function handleDeliveryStatus(_evt: DeliveryStatusEvent, _deps?: Deps): Promise<void> {
  throw notImplementedError(OWNER, "handleDeliveryStatus");
}

export async function tick(_deps?: Deps): Promise<TickReport> {
  throw notImplementedError(OWNER, "tick");
}

/** Used only by the operator's "Dispatch now" button. */
export async function dispatchDonation(_donation_id: string, _deps?: Deps): Promise<TickReport> {
  throw notImplementedError(OWNER, "dispatchDonation");
}

export function formatOfferMessage(_view: OfferMessageView): string {
  throw notImplementedError(OWNER, "formatOfferMessage");
}

export function formatDraftReadyMessage(_view: DraftReadyView): string {
  throw notImplementedError(OWNER, "formatDraftReadyMessage");
}
