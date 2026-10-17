import { describe, expect, it, vi } from "vitest";
import type { OutboundMessage } from "@/contracts";
import { createMessagingGateway } from "@/integrations/photon";
import { createPhotonGateway } from "@/integrations/photon/gateway-photon";

// T-MS-10 (real gateway mapping) and T-MS-13 prerequisites: request shape and response mapping for
// POST /v1/projects/{id}/messages (prompt §6 step 4; R-PH-4, R-PH-7). fetch is stubbed: nothing here touches the network,
// so every result is FAKE evidence. A real send is T-MS-13 and is recorded separately.

const KEY = "pho_sk_TEST_not_a_real_key";
const PROJECT = "pho_prj_test";
const URL_SENT = "https://api.photon.codes/v1/projects/pho_prj_test/messages";

const message = (over: Partial<OutboundMessage> = {}): OutboundMessage => ({
  to_identity_id: "b0000000-0000-4000-8000-000000000001",
  text: "Annona offer text\nline two",
  purpose: "offer",
  correlation: {},
  idempotency_key: "offer:abc:v1",
  ...over,
});

const route = { space_id: "pho_spc_1", sender_id: "pho_usr_line" };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function gatewayWith(respond: () => Promise<Response> | Response, lookup = async () => route as typeof route | null) {
  const fetchStub = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => respond());
  const gateway = createPhotonGateway(
    { project_id: PROJECT, api_key: KEY },
    { lookupRoute: lookup, fetch: fetchStub as unknown as typeof fetch },
  );
  return { gateway, fetchStub };
}

describe("T-MS-10 photon gateway request", () => {
  it("posts the exact text to the project's messages endpoint with the idempotency key and bearer key", async () => {
    const { gateway, fetchStub } = gatewayWith(() => json(202, { id: "pho_msg_sent1" }));
    await gateway.send(message());
    expect(fetchStub).toHaveBeenCalledTimes(1);
    const [url, init] = fetchStub.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(URL_SENT);
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${KEY}`);
    expect(headers.get("idempotency-key")).toBe("offer:abc:v1");
    expect(headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      spaceId: "pho_spc_1",
      senderId: "pho_usr_line",
      content: { type: "text", format: "plain", text: "Annona offer text\nline two" },
    });
  });

  it("is labeled real and imessage", () => {
    const { gateway } = gatewayWith(() => json(202, { id: "x" }));
    expect(gateway).toMatchObject({ mode: "real", channel: "imessage", status: "ok" });
  });

  it("does not call Photon for an identity with no space and sender to reply to", async () => {
    const { gateway, fetchStub } = gatewayWith(() => json(202, { id: "x" }), async () => null);
    expect(await gateway.send(message())).toEqual({ ok: false, error_code: "NOT_JOINED", retryable: false, mode: "real" });
    expect(fetchStub).not.toHaveBeenCalled();
  });
});

describe("T-MS-10 photon gateway response mapping", () => {
  it("treats 202 as accepted and returns Photon's message id (accepted is not delivered)", async () => {
    const { gateway } = gatewayWith(() => json(202, { id: "pho_msg_sent1", status: "dispatched" }));
    expect(await gateway.send(message())).toEqual({ ok: true, provider_message_id: "pho_msg_sent1", mode: "real" });
  });

  it("never invents a message id when a 202 carries none", async () => {
    const { gateway } = gatewayWith(() => json(202, {}));
    expect(await gateway.send(message())).toEqual({
      ok: false,
      error_code: "PROVIDER_UNAVAILABLE",
      retryable: true,
      mode: "real",
    });
  });

  it.each([
    [403, "SHARED_LINE_INBOUND_REQUIRED", "NOT_JOINED", false],
    [403, "SHARED_LINE_NOT_ASSIGNED", "NOT_JOINED", false],
    [422, "SHARED_LINE_GROUP_UNSUPPORTED", "INVALID_HANDLE", false],
    [429, "RATE_LIMITED", "RATE_LIMITED", true],
    [409, "IDEMPOTENCY_REQUEST_IN_PROGRESS", "PROVIDER_UNAVAILABLE", true],
    [422, "IDEMPOTENCY_KEY_REUSED", "PROVIDER_UNAVAILABLE", false],
    [402, "BILLING_SUSPENDED", "PROVIDER_UNAVAILABLE", false],
    [401, "NOT_AUTHENTICATED", "PROVIDER_UNAVAILABLE", false],
    [500, "INTERNAL_ERROR", "PROVIDER_UNAVAILABLE", true],
    [502, "UPSTREAM_FAILURE", "PROVIDER_UNAVAILABLE", true],
    [503, "UPSTREAM_UNAVAILABLE", "PROVIDER_UNAVAILABLE", true],
    [504, "UPSTREAM_TIMEOUT", "PROVIDER_UNAVAILABLE", true],
  ])("maps %i %s to %s (retryable %s)", async (status, code, error_code, retryable) => {
    const { gateway } = gatewayWith(() => json(status, { code }));
    expect(await gateway.send(message())).toEqual({ ok: false, error_code, retryable, mode: "real" });
  });

  it("maps an unparseable error body by status alone", async () => {
    const { gateway } = gatewayWith(() => new Response("<html>bad gateway</html>", { status: 502 }));
    expect(await gateway.send(message())).toMatchObject({ ok: false, error_code: "PROVIDER_UNAVAILABLE", retryable: true });
  });

  it.each([
    ["a network error", () => Promise.reject(new TypeError("fetch failed"))],
    ["a timeout", () => Promise.reject(new DOMException("timed out", "TimeoutError"))],
  ])("maps %s to a retryable PROVIDER_UNAVAILABLE", async (_name, respond) => {
    const { gateway } = gatewayWith(respond);
    expect(await gateway.send(message())).toEqual({
      ok: false,
      error_code: "PROVIDER_UNAVAILABLE",
      retryable: true,
      mode: "real",
    });
  });

  it("reports PROVIDER_UNAVAILABLE instead of throwing when the route lookup itself fails", async () => {
    const { gateway, fetchStub } = gatewayWith(() => json(202, { id: "x" }), async () => {
      throw new Error("store down");
    });
    expect(await gateway.send(message())).toMatchObject({ ok: false, error_code: "PROVIDER_UNAVAILABLE" });
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("never exposes the API key in a result", async () => {
    for (const respond of [
      () => json(202, { id: "pho_msg_sent1" }),
      () => json(500, { code: "INTERNAL_ERROR", detail: `leaked ${KEY}` }),
      () => Promise.reject(new Error(`boom ${KEY}`)),
    ]) {
      const { gateway } = gatewayWith(respond);
      expect(JSON.stringify(await gateway.send(message()))).not.toContain(KEY);
    }
  });
});

describe("T-MS-10 factory wiring", () => {
  it("createMessagingGateway returns the working photon gateway once credentials and a route lookup are given", async () => {
    const fetchStub = vi.fn(async () => json(202, { id: "pho_msg_sent2" }));
    const gateway = createMessagingGateway(
      { mode: "photon", project_id: PROJECT, api_key: KEY },
      { lookupRoute: async () => route, fetch: fetchStub as unknown as typeof fetch },
    );
    expect(gateway).toMatchObject({ mode: "real", status: "ok" });
    expect(await gateway.send(message())).toEqual({ ok: true, provider_message_id: "pho_msg_sent2", mode: "real" });
  });

  it("stays misconfigured without credentials even when a route lookup is given", async () => {
    const fetchStub = vi.fn();
    const gateway = createMessagingGateway(
      { mode: "photon", project_id: undefined, api_key: undefined },
      { lookupRoute: async () => route, fetch: fetchStub as unknown as typeof fetch },
    );
    expect(gateway.status).toBe("misconfigured");
    expect(await gateway.send(message())).toMatchObject({ ok: false, error_code: "PROVIDER_UNAVAILABLE" });
    expect(fetchStub).not.toHaveBeenCalled();
  });
});
