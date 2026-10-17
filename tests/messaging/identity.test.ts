import { describe, expect, it } from "vitest";
import type { MessagingIdentityStatus, OutboundMessage, SendResult } from "@/contracts";
import { createFakeGateway } from "@/integrations/photon/gateway-fake";
import { createOutboundSender } from "@/workflows/outbound";
import { createCoreDouble } from "./doubles/core";

// T-MS-15 (joined-only part): every outbound message except stop_ack requires status = joined (CONTRACTS §3.10).
// Otherwise gateway.send is not called, the result is NOT_JOINED, and the attempt is recorded.

const ID = "b0000000-0000-4000-8000-000000000001";

const message = (over: Partial<OutboundMessage> = {}): OutboundMessage => ({
  to_identity_id: ID,
  text: "hello",
  purpose: "offer",
  correlation: {},
  idempotency_key: "offer:o1:v1",
  ...over,
});

function setup(status: MessagingIdentityStatus | null, gatewayOptions?: Parameters<typeof createFakeGateway>[0]) {
  const double = createCoreDouble();
  if (status) double.seedIdentity({ id: ID, handle: "courier@example.invalid", status });
  const sent: OutboundMessage[] = [];
  const base = createFakeGateway(gatewayOptions);
  const gateway = {
    ...base,
    async send(m: OutboundMessage): Promise<SendResult> {
      sent.push(m);
      return base.send(m);
    },
  };
  return { double, sent, send: createOutboundSender({ core: double.core, gateway }) };
}

describe("T-MS-15 outbound is joined-only", () => {
  it.each(["awaiting_join", "opted_out"] as const)("does not send an offer to a %s identity", async (status) => {
    const { double, sent, send } = setup(status);
    expect(await send(message())).toEqual({ ok: false, error_code: "NOT_JOINED", retryable: false, mode: "fake" });
    expect(sent).toHaveLength(0);
    expect(double.calls.outbound).toEqual([{ message: message(), provider_message_id: null }]);
  });

  it.each(["join_ack", "draft_ready", "claim_result", "help"] as const)(
    "does not send a %s message to an opted-out identity",
    async (purpose) => {
      const { sent, send } = setup("opted_out");
      expect(await send(message({ purpose }))).toMatchObject({ ok: false, error_code: "NOT_JOINED" });
      expect(sent).toHaveLength(0);
    },
  );

  it("still sends stop_ack to an opted-out identity", async () => {
    const { double, sent, send } = setup("opted_out");
    const result = await send(message({ purpose: "stop_ack", idempotency_key: "reply:m1:v1" }));
    expect(result).toEqual({ ok: true, provider_message_id: "fake_reply:m1:v1", mode: "fake" });
    expect(sent).toHaveLength(1);
    expect(double.calls.outbound).toHaveLength(1);
  });

  it("sends to a joined identity once and records the provider message id", async () => {
    const { double, sent, send } = setup("joined");
    const result = await send(message());
    expect(result).toEqual({ ok: true, provider_message_id: "fake_offer:o1:v1", mode: "fake" });
    expect(sent).toHaveLength(1);
    expect(double.calls.outbound).toEqual([{ message: message(), provider_message_id: "fake_offer:o1:v1" }]);
  });

  it("records a failed send with no provider message id and returns the failure", async () => {
    const { double, send } = setup("joined", { fail: { error_code: "RATE_LIMITED", retryable: true } });
    expect(await send(message())).toEqual({ ok: false, error_code: "RATE_LIMITED", retryable: true, mode: "fake" });
    expect(double.calls.outbound).toEqual([{ message: message(), provider_message_id: null }]);
  });

  it("does not send or record anything for an unknown identity", async () => {
    const { double, sent, send } = setup(null);
    expect(await send(message())).toMatchObject({ ok: false, error_code: "NOT_JOINED" });
    expect(sent).toHaveLength(0);
    expect(double.calls.outbound).toHaveLength(0);
  });
});
