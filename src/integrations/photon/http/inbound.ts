import { err, type Clock, type DeliveryStatusEvent, type InboundMessage, type InboundResult } from "@/contracts";
import { getServices } from "@/server/container";
import { toResponse } from "@/server/http";
import { handleDeliveryStatus, handleInbound } from "@/workflows";
import { failureResponse, forbidden, hasInternalSecret, internalSecretFromEnv } from "@/workflows/http/auth";
import { normalizePhotonEvent } from "../normalize";

// POST /api/messaging/photon/inbound (CONTRACTS §10). Authenticate first. Photon's webhook signature scheme is
// UNVERIFIED (docs/handoffs/dev-3.md), so only the relay worker's internal secret is accepted until it is confirmed;
// an unauthenticated public inbound route must never exist (prompt §13).

export function createInboundRouteHandler(deps: {
  internalSecret: () => string | undefined;
  clock: Clock;
  handleInbound: (message: InboundMessage) => Promise<InboundResult>;
  handleDeliveryStatus: (event: DeliveryStatusEvent) => Promise<void>;
}) {
  return async function POST(request: Request): Promise<Response> {
    if (!hasInternalSecret(request, deps.internalSecret())) return forbidden();

    // The raw text is read first so signature verification can use the exact body once its scheme is confirmed.
    let raw: unknown;
    try {
      raw = JSON.parse(await request.text());
    } catch {
      return toResponse(err("VALIDATION_FAILED", "Body is not valid JSON."));
    }

    const normalized = normalizePhotonEvent(raw, { clock: deps.clock });
    if (!normalized.ok) return toResponse(normalized);

    try {
      const event = normalized.data;
      if ("ignored" in event) {
        // Acknowledged so Photon does not retry events we do not act on.
      } else if ("sender_handle" in event) {
        await deps.handleInbound(event);
      } else {
        await deps.handleDeliveryStatus(event);
      }
    } catch (error) {
      // A non-2xx makes Photon redeliver; dedupe and the 30 s reclaim make that safe (CONTRACTS §8.2).
      return failureResponse("POST /api/messaging/photon/inbound", error);
    }
    return Response.json({ received: true });
  };
}

export const POST = createInboundRouteHandler({
  internalSecret: internalSecretFromEnv,
  // Resolved per request so importing this module never builds the service container.
  clock: { now: () => getServices().clock.now() },
  handleInbound: (message) => handleInbound(message),
  handleDeliveryStatus: (event) => handleDeliveryStatus(event),
});
