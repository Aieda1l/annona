import type { MessagingGateway, SendResult } from "@/contracts";

// Labeled simulated gateway (CONTRACTS §9.1): no network, persists nothing. The workflow layer records every send.
type SendFailure = Extract<SendResult, { ok: false }>;

export type FakeGatewayOptions = {
  /** Test hook: make every send fail with this error. */
  fail?: Pick<SendFailure, "error_code" | "retryable">;
};

export function createFakeGateway(options: FakeGatewayOptions = {}): MessagingGateway {
  return {
    mode: "fake",
    channel: "simulated",
    status: "ok",
    async send(message) {
      if (options.fail) return { ok: false, ...options.fail, mode: "fake" };
      return { ok: true, provider_message_id: `fake_${message.idempotency_key}`, mode: "fake" };
    },
  };
}
