import {
  notImplementedResult,
  type DeliveryStatusEvent,
  type InboundMessage,
  type MessagingGateway,
  type MessagingGatewayConfig,
  type Result,
} from "@/contracts";

// Barrel owned by Dev 3 after the baseline (keep exported names stable). CONTRACTS §9.4.

/** Baseline stub: `mode` is `real` only for the photon selector; `send` returns NOT_IMPLEMENTED. */
export function createMessagingGateway(config: MessagingGatewayConfig): MessagingGateway {
  const mode = config.mode === "photon" ? "real" : "fake";
  return {
    mode,
    channel: mode === "real" ? "imessage" : "simulated",
    status: "ok",
    async send() {
      return { ok: false, error_code: "NOT_IMPLEMENTED", retryable: false, mode };
    },
  };
}

export function normalizePhotonEvent(
  _raw: unknown,
): Result<InboundMessage | DeliveryStatusEvent | { ignored: true }> {
  return notImplementedResult("Dev 3", "normalizePhotonEvent");
}
