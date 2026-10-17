import type { MessagingGateway, MessagingGatewayConfig } from "@/contracts";
import { createFakeGateway } from "./gateway-fake";

/**
 * Photon mode with missing credentials is `misconfigured`: every send fails with PROVIDER_UNAVAILABLE and the
 * gateway never falls back to the fake (CONTRACTS §12). The real send adapter lands in slice 2; until then a
 * correctly configured real gateway answers NOT_IMPLEMENTED.
 */
export function createMessagingGateway(config: MessagingGatewayConfig): MessagingGateway {
  if (config.mode === "fake") return createFakeGateway();

  const configured = Boolean(config.project_id?.trim()) && Boolean(config.api_key?.trim());
  return {
    mode: "real",
    channel: "imessage",
    status: configured ? "ok" : "misconfigured",
    async send() {
      if (!configured) return { ok: false, error_code: "PROVIDER_UNAVAILABLE", retryable: false, mode: "real" };
      return { ok: false, error_code: "NOT_IMPLEMENTED", retryable: false, mode: "real" };
    },
  };
}
