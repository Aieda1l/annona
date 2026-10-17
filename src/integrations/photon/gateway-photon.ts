import type { MessagingGateway, OutboundMessage, SendResult } from "@/contracts";

// Real Photon 2.0 Beta send (prompt §6 step 4; R-PH-4, R-PH-7): POST /v1/projects/{id}/messages over plain fetch.
// 202 means accepted, not delivered. Photon replays a repeated Idempotency-Key, so the text for a key must be identical.
// Failures are mapped to the contract's SendResult and never carry the API key or Photon's error body.

const BASE_URL = "https://api.photon.codes";
const DEFAULT_TIMEOUT_MS = 10_000; // ASSUMPTION (prompt §6): 10 s

/** Where to reply: the joined identity's Photon space and the line's sender (CONTRACTS §3.1). */
export type PhotonRoute = { space_id: string; sender_id: string };

export type PhotonGatewayOptions = {
  lookupRoute: (identity_id: string) => Promise<PhotonRoute | null>;
  fetch?: typeof fetch;
  timeoutMs?: number;
  baseUrl?: string;
};

const failure = (error_code: Extract<SendResult, { ok: false }>["error_code"], retryable: boolean): SendResult => ({
  ok: false,
  error_code,
  retryable,
  mode: "real",
});

function mapFailure(status: number, code: string | undefined): SendResult {
  if (code === "SHARED_LINE_INBOUND_REQUIRED" || code === "SHARED_LINE_NOT_ASSIGNED") return failure("NOT_JOINED", false);
  if (code === "SHARED_LINE_GROUP_UNSUPPORTED") return failure("INVALID_HANDLE", false);
  if (status === 429) return failure("RATE_LIMITED", true);
  if (code === "IDEMPOTENCY_REQUEST_IN_PROGRESS") return failure("PROVIDER_UNAVAILABLE", true);
  if (code === "IDEMPOTENCY_KEY_REUSED") return failure("PROVIDER_UNAVAILABLE", false); // a text-determinism bug
  return failure("PROVIDER_UNAVAILABLE", status >= 500);
}

export function createPhotonGateway(
  config: { project_id: string; api_key: string },
  options: PhotonGatewayOptions,
): MessagingGateway {
  const doFetch = options.fetch ?? fetch;
  const url = `${options.baseUrl ?? BASE_URL}/v1/projects/${config.project_id}/messages`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    mode: "real",
    channel: "imessage",
    status: "ok",
    async send(message: OutboundMessage): Promise<SendResult> {
      let route: PhotonRoute | null;
      try {
        route = await options.lookupRoute(message.to_identity_id);
      } catch {
        return failure("PROVIDER_UNAVAILABLE", true);
      }
      if (route === null) return failure("NOT_JOINED", false);

      try {
        const response = await doFetch(url, {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.api_key}`,
            "content-type": "application/json",
            "idempotency-key": message.idempotency_key,
          },
          body: JSON.stringify({
            spaceId: route.space_id,
            senderId: route.sender_id,
            content: { type: "text", format: "plain", text: message.text },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const body: unknown = await response.json().catch(() => null);
        const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};

        if (response.status >= 200 && response.status < 300) {
          // Never invent a provider id: an accepted send without one is reported as a failure to record it.
          return typeof record.id === "string" && record.id !== ""
            ? { ok: true, provider_message_id: record.id, mode: "real" }
            : failure("PROVIDER_UNAVAILABLE", true);
        }
        return mapFailure(response.status, typeof record.code === "string" ? record.code : undefined);
      } catch {
        return failure("PROVIDER_UNAVAILABLE", true); // network error, abort or timeout
      }
    },
  };
}
