import type { MessagingGateway, OutboundMessage, SendResult } from "@/contracts";
import type { MessagingCore } from "./core-port";

// Every send goes through here (CONTRACTS §3.10): any purpose except stop_ack requires a joined recipient.
// Otherwise the gateway is not called and the attempt is recorded with no provider message id.

export type OutboundSender = (message: OutboundMessage) => Promise<SendResult>;

export function createOutboundSender(deps: {
  core: Pick<MessagingCore, "getIdentity" | "recordOutboundMessage">;
  gateway: MessagingGateway;
}): OutboundSender {
  const { core, gateway } = deps;
  const notJoined = (): SendResult => ({ ok: false, error_code: "NOT_JOINED", retryable: false, mode: gateway.mode });

  return async (message) => {
    const identity = await core.getIdentity(message.to_identity_id);
    // No identity row to attach the attempt to, so nothing is recorded.
    if (identity === null) return notJoined();

    if (message.purpose !== "stop_ack" && identity.status !== "joined") {
      await core.recordOutboundMessage({ message, provider_message_id: null });
      return notJoined();
    }

    const result = await gateway.send(message);
    await core.recordOutboundMessage({ message, provider_message_id: result.ok ? result.provider_message_id : null });
    return result;
  };
}
