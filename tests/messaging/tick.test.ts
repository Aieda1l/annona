import { describe, expect, it } from "vitest";
import type { OutboundMessage, SendResult } from "@/contracts";
import { createFakeGateway } from "@/integrations/photon/gateway-fake";
import { createTicker } from "@/workflows/tick";
import { createCoreDouble } from "./doubles/core";
import { createClock, createDispatchDouble } from "./doubles/dispatch";

// T-MS-06..T-MS-09, T-MS-10 (send-failure part), T-MS-11, T-MS-16: tick() against a test clock and an in-memory core.
// Pacific times: 22:00Z = 3:00 PM PDT. The donor cutoff is 03:00Z = 8:00 PM PDT. The response window is 60 s.

const D1 = "d0000000-0000-4000-8000-000000000001";
const D2 = "d0000000-0000-4000-8000-000000000002";
const A = "b0000000-0000-4000-8000-00000000000a";
const B = "b0000000-0000-4000-8000-00000000000b";
const C = "b0000000-0000-4000-8000-00000000000c";
const START = new Date("2026-10-17T22:00:00.000Z");
const CUTOFF = new Date("2026-10-18T03:00:00.000Z");

function setup(opts: { candidates?: string[]; gateway?: Parameters<typeof createFakeGateway>[0] } = {}) {
  const clock = createClock(START);
  const base = createCoreDouble();
  base.seedIdentity({ id: A, handle: "a@example.invalid" });
  base.seedIdentity({ id: B, handle: "b@example.invalid" });
  base.seedIdentity({ id: C, handle: "c@example.invalid", status: "awaiting_join" });
  const d = createDispatchDouble(clock, base);
  d.seedDonation({ id: D1, cutoff: CUTOFF, candidates: opts.candidates ?? [A, B] });

  const sent: OutboundMessage[] = [];
  const fake = createFakeGateway(opts.gateway);
  const gateway = {
    ...fake,
    async send(m: OutboundMessage): Promise<SendResult> {
      sent.push(m);
      return fake.send(m);
    },
  };
  return { clock, d, sent, gateway, ticker: createTicker({ core: d.core, gateway, clock }) };
}

describe("T-MS-06 offers and escalation", () => {
  it("offers the donation to the first courier, sends once, and records the provider message id", async () => {
    const { d, sent, ticker } = setup();
    const report = await ticker.tick();
    const offer = d.offersFor(D1)[0];
    expect(offer).toMatchObject({ identity_id: A, status: "open", short_code: "K7M3" });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to_identity_id: A,
      purpose: "offer",
      idempotency_key: `offer:${offer?.offer_id}:v1`,
    });
    expect(offer?.provider_message_id).toBe(`fake_offer:${offer?.offer_id}:v1`);
    expect(report).toEqual({
      at: "2026-10-17T22:00:00.000Z",
      expired_offers: 0,
      expired_donations: 0,
      offers_created: 1,
      offers_sent: 1,
      send_failures: 0,
    });
  });

  it("builds the offer text from the view: code, allergen wording, area, recipient, deadline, no address", async () => {
    const { sent, ticker } = setup();
    await ticker.tick();
    const text = sent[0]?.text ?? "";
    expect(text).toContain("pickup offer K7M3");
    expect(text).toContain("Contains (donor-declared): wheat, milk, eggs.");
    expect(text).toContain("Pickup area: Capitol Hill.");
    expect(text).toContain("For Eastlake Community Pantry.");
    expect(text).toContain("Reply YES K7M3 or NO K7M3 by 3:01 PM.");
    expect(text).not.toMatch(/address|Ave|Way/i);
  });

  it("does nothing more on an immediate second tick", async () => {
    const { d, sent, ticker } = setup();
    await ticker.tick();
    const again = await ticker.tick();
    expect(sent).toHaveLength(1);
    expect(d.offersFor(D1)).toHaveLength(1);
    expect(again).toMatchObject({ offers_created: 0, offers_sent: 0, expired_offers: 0 });
  });

  it("offers courier B once A's offer has expired", async () => {
    const { clock, d, sent, ticker } = setup();
    await ticker.tick();
    clock.advance(61_000);
    const report = await ticker.tick();
    const [first, second] = d.offersFor(D1);
    expect(first).toMatchObject({ identity_id: A, status: "expired" });
    expect(second).toMatchObject({ identity_id: B, status: "open", short_code: "H4M9" });
    expect(sent.map((m) => m.to_identity_id)).toEqual([A, B]);
    expect(report).toMatchObject({ expired_offers: 1, offers_created: 1, offers_sent: 1 });
  });
});

describe("T-MS-07 decline", () => {
  it("offers courier B on the next tick after A declines", async () => {
    const { d, sent, ticker } = setup();
    await ticker.tick();
    d.decline(d.offersFor(D1)[0]?.offer_id as string);
    await ticker.tick();
    expect(sent.map((m) => m.to_identity_id)).toEqual([A, B]);
    expect(d.offersFor(D1)[1]).toMatchObject({ identity_id: B, status: "open" });
  });
});

describe("T-MS-08 late reply", () => {
  it("leaves B's offer open and untouched by further ticks after A's offer expired", async () => {
    const { clock, d, sent, ticker } = setup();
    await ticker.tick();
    clock.advance(61_000);
    await ticker.tick();
    clock.advance(10_000);
    const report = await ticker.tick();
    expect(d.offersFor(D1)[1]).toMatchObject({ identity_id: B, status: "open" });
    expect(sent).toHaveLength(2);
    expect(report).toMatchObject({ expired_offers: 0, offers_created: 0, offers_sent: 0 });
  });
});

describe("T-MS-09 cutoff", () => {
  it("creates no offer and sends nothing once the cutoff has passed; the donation expires", async () => {
    const { clock, d, sent, ticker } = setup();
    clock.advance(CUTOFF.getTime() - START.getTime());
    const report = await ticker.tick();
    expect(sent).toHaveLength(0);
    expect(d.offersFor(D1)).toHaveLength(0);
    expect(d.donation(D1)?.status).toBe("expired");
    expect(report).toMatchObject({ expired_donations: 1, offers_created: 0, offers_sent: 0 });
  });

  it("expires an open offer at the cutoff and offers nobody else", async () => {
    const { clock, d, sent, ticker } = setup();
    await ticker.tick();
    clock.advance(CUTOFF.getTime() - START.getTime());
    await ticker.tick();
    expect(d.offersFor(D1)[0]?.status).toBe("expired");
    expect(d.donation(D1)?.status).toBe("expired");
    expect(sent).toHaveLength(1);
  });
});

describe("T-MS-10 send failures", () => {
  it("fails the offer to a courier who never joined without calling the gateway, then offers the next candidate", async () => {
    const { d, sent, ticker } = setup({ candidates: [C, B] });
    const first = await ticker.tick();
    expect(d.offersFor(D1)[0]).toMatchObject({ identity_id: C, status: "send_failed", failure: "courier_not_joined" });
    expect(sent).toHaveLength(0);
    expect(first).toMatchObject({ offers_created: 1, offers_sent: 0, send_failures: 1 });
    await ticker.tick();
    expect(sent.map((m) => m.to_identity_id)).toEqual([B]);
  });

  it("marks the offer send_failed with the gateway's error and moves on, never re-sending to the same courier", async () => {
    const { d, sent, ticker } = setup({ gateway: { fail: { error_code: "RATE_LIMITED", retryable: true } } });
    const report = await ticker.tick();
    expect(d.offersFor(D1)[0]).toMatchObject({ identity_id: A, status: "send_failed", failure: "RATE_LIMITED" });
    expect(report).toMatchObject({ offers_sent: 0, send_failures: 1 });
    await ticker.tick();
    expect(sent.map((m) => m.to_identity_id)).toEqual([A, B]);
    expect(sent.filter((m) => m.to_identity_id === A)).toHaveLength(1);
  });

  it("records a misconfigured real gateway as send_failed, never as sent", async () => {
    const { d, ticker } = setup({ gateway: { fail: { error_code: "PROVIDER_UNAVAILABLE", retryable: false } } });
    await ticker.tick();
    expect(d.offersFor(D1)[0]).toMatchObject({ status: "send_failed", failure: "PROVIDER_UNAVAILABLE" });
    expect(d.offersFor(D1)[0]?.provider_message_id).toBeNull();
  });
});

describe("T-MS-11 concurrent ticks", () => {
  it.each([2, 3, 5])("%i simultaneous ticks create and send exactly one offer", async (n) => {
    const { d, sent, ticker } = setup();
    await Promise.all(Array.from({ length: n }, () => ticker.tick()));
    expect(d.offersFor(D1)).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect(d.base.calls.outbound).toHaveLength(1);
  });
});

describe("T-MS-16 exhaustion", () => {
  it("marks the donation unmatched when every candidate has declined or let the offer expire, and sends nothing more", async () => {
    const { clock, d, sent, ticker } = setup();
    await ticker.tick();
    d.decline(d.offersFor(D1)[0]?.offer_id as string);
    await ticker.tick();
    clock.advance(61_000);
    await ticker.tick();
    expect(d.donation(D1)).toMatchObject({ status: "unmatched", reason: "CANDIDATES_EXHAUSTED" });
    expect(sent).toHaveLength(2);
    await ticker.tick();
    expect(sent).toHaveLength(2);
  });
});

describe("tick bookkeeping and isolation", () => {
  it("records the tick time from the injected clock", async () => {
    const { clock, d, ticker } = setup();
    await ticker.tick();
    clock.advance(5_000);
    await ticker.tick();
    expect(d.lastTicks).toEqual(["2026-10-17T22:00:00.000Z", "2026-10-17T22:00:05.000Z"]);
  });

  it("keeps processing other donations when one fails unexpectedly, then reports the failure", async () => {
    const { d, sent, ticker } = setup();
    d.seedDonation({ id: D2, cutoff: CUTOFF, candidates: [B] });
    d.breakDonation(D1);
    await expect(ticker.tick()).rejects.toThrow(D1);
    expect(d.offersFor(D2)).toHaveLength(1);
    expect(d.offersFor(D2)[0]?.status).toBe("open");
    expect(sent.map((m) => m.to_identity_id)).toEqual([B]);
    expect(d.lastTicks).toHaveLength(0);
  });

  it("dispatchDonation offers only the named donation and expires nothing", async () => {
    const { d, sent, ticker } = setup();
    d.seedDonation({ id: D2, cutoff: CUTOFF, candidates: [B] });
    const report = await ticker.dispatchDonation(D2);
    expect(d.offersFor(D2)).toHaveLength(1);
    expect(d.offersFor(D1)).toHaveLength(0);
    expect(report).toMatchObject({ offers_created: 1, offers_sent: 1, expired_offers: 0 });
    expect(sent.map((m) => m.to_identity_id)).toEqual([B]);
  });
});
