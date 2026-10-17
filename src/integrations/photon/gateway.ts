import type { MessagingGateway, MessagingGatewayConfig } from "@/contracts";
import { createFakeGateway } from "./gateway-fake";
import { createPhotonGateway, type PhotonGatewayOptions, type PhotonRoute } from "./gateway-photon";

/**
 * Where a joined identity can be replied to: its Photon space and the line's sender. Resolved through core's barrel
 * (lanes import each other only through barrels). A missing or non-joined identity has no route.
 */
async function coreRouteLookup(identity_id: string): Promise<PhotonRoute | null> {
  const { getIdentity } = await import("@/core");
  const identity = await getIdentity(identity_id);
  if (!identity || identity.status !== "joined") return null;
  const space = identity.provider_space_id;
  const sender = identity.provider_sender_id;
  return typeof space === "string" && typeof sender === "string" ? { space_id: space, sender_id: sender } : null;
}

/**
 * Photon mode with missing credentials is `misconfigured`: every send fails with PROVIDER_UNAVAILABLE and the
 * gateway never falls back to the fake (CONTRACTS §12). Options exist for tests (a stub fetch, a fixed route lookup).
 */
export function createMessagingGateway(
  config: MessagingGatewayConfig,
  options: Partial<PhotonGatewayOptions> = {},
): MessagingGateway {
  if (config.mode === "fake") return createFakeGateway();

  const project_id = config.project_id?.trim();
  const api_key = config.api_key?.trim();
  if (!project_id || !api_key) {
    return {
      mode: "real",
      channel: "imessage",
      status: "misconfigured",
      async send() {
        return { ok: false, error_code: "PROVIDER_UNAVAILABLE", retryable: false, mode: "real" };
      },
    };
  }

  return createPhotonGateway({ project_id, api_key }, { ...options, lookupRoute: options.lookupRoute ?? coreRouteLookup });
}
