import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OutboundMessage } from "@/contracts";
import { createMessagingGateway } from "@/integrations/photon";
import { createFakeGateway } from "@/integrations/photon/gateway-fake";

// T-MS-10 (gateway part): the fake never touches the network; photon mode without keys is
// `misconfigured` and every send fails with PROVIDER_UNAVAILABLE. It never silently becomes fake (CONTRACTS §12).

const message = (idempotency_key: string): OutboundMessage => ({
  to_identity_id: "11111111-1111-4111-8111-111111111111",
  text: "Annona test message",
  purpose: "offer",
  correlation: {},
  idempotency_key,
});

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("T-MS-10 fake gateway", () => {
  it("is labeled simulated and ok", () => {
    const gateway = createMessagingGateway({ mode: "fake", project_id: undefined, api_key: undefined });
    expect(gateway).toMatchObject({ mode: "fake", channel: "simulated", status: "ok" });
  });

  it("returns a deterministic provider_message_id per idempotency key", async () => {
    const gateway = createFakeGateway();
    const first = await gateway.send(message("offer:abc:v1"));
    const again = await gateway.send(message("offer:abc:v1"));
    const other = await gateway.send(message("offer:def:v1"));
    expect(first).toEqual({ ok: true, provider_message_id: "fake_offer:abc:v1", mode: "fake" });
    expect(again).toEqual(first);
    expect(other).toMatchObject({ ok: true, provider_message_id: "fake_offer:def:v1" });
  });

  it("makes no network call", async () => {
    await createFakeGateway().send(message("offer:abc:v1"));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("can be told to fail, so send-failure paths are testable", async () => {
    const gateway = createFakeGateway({ fail: { error_code: "RATE_LIMITED", retryable: true } });
    expect(await gateway.send(message("offer:abc:v1"))).toEqual({
      ok: false,
      error_code: "RATE_LIMITED",
      retryable: true,
      mode: "fake",
    });
  });
});

describe("T-MS-10 photon mode without credentials", () => {
  it.each([
    ["no key", { project_id: "pho_prj_test", api_key: undefined }],
    ["no project id", { project_id: undefined, api_key: "pho_sk_test" }],
    ["a blank key", { project_id: "pho_prj_test", api_key: "   " }],
    ["nothing", { project_id: undefined, api_key: undefined }],
  ])("with %s it is real-mode and misconfigured, never fake", (_name, creds) => {
    const gateway = createMessagingGateway({ mode: "photon", ...creds });
    expect(gateway).toMatchObject({ mode: "real", channel: "imessage", status: "misconfigured" });
  });

  it("fails every send with PROVIDER_UNAVAILABLE and makes no network call", async () => {
    const gateway = createMessagingGateway({ mode: "photon", project_id: undefined, api_key: undefined });
    expect(await gateway.send(message("offer:abc:v1"))).toEqual({
      ok: false,
      error_code: "PROVIDER_UNAVAILABLE",
      retryable: false,
      mode: "real",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is ok and real once both credentials are present", () => {
    const gateway = createMessagingGateway({ mode: "photon", project_id: "pho_prj_test", api_key: "pho_sk_test" });
    expect(gateway).toMatchObject({ mode: "real", channel: "imessage", status: "ok" });
  });
});
