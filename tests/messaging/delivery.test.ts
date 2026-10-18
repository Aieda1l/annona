import { describe, expect, it } from "vitest";
import type { DeliveryStatusEvent } from "@/contracts";
import { createFakeGateway } from "@/integrations/photon/gateway-fake";
import { createDeliveryHandler } from "@/workflows/delivery";
import { createTicker } from "@/workflows/tick";
import { createCoreDouble } from "./doubles/core";
import { createClock, createDispatchDouble } from "./doubles/dispatch";

// T-MS-10 (delivery part): a `failed` delivery event closes a still-open offer early via markOfferSendFailed, exactly
// once (dedupe on provider_event_id). Delivery events never start, extend or stop a deadline (CONTRACTS §7).

const D1 = "d0000000-0000-4000-8000-000000000001";
const A = "b0000000-0000-4000-8000-00000000000a";
const B = "b0000000-0000-4000-8000-00000000000b";

async function setup() {
  const clock = createClock(new Date("2026-10-17T22:00:00.000Z"));
  const base = createCoreDouble();
  base.seedIdentity({ id: A, handle: "a@example.invalid" });
  base.seedIdentity({ id: B, handle: "b@example.invalid" });
  const d = createDispatchDouble(clock, base);
  d.seedDonation({ id: D1, cutoff: new Date("2026-10-18T03:00:00.000Z"), candidates: [A, B] });
  const ticker = createTicker({ core: d.core, gateway: createFakeGateway(), clock });
  await ticker.tick();
  const offer = d.offersFor(D1)[0];
  const event = (status: DeliveryStatusEvent["status"], over: Partial<DeliveryStatusEvent> = {}): DeliveryStatusEvent => ({
    provider: "photon",
    provider_event_id: `evt_${status}`,
    provider_message_id: offer?.provider_message_id as string,
    status,
    failure_code: null,
    at: "2026-10-17T22:00:05.000Z",
    ...over,
  });
  return { clock, d, ticker, offer, event, handle: createDeliveryHandler({ core: d.core }) };
}

describe("T-MS-10 delivery status events", () => {
  it("records a delivered event on the matching offer without touching its deadline or status", async () => {
    const { d, offer, event, handle } = await setup();
    const before = offer?.expires_at;
    await handle(event("delivered"));
    expect(d.offer(offer?.offer_id as string)).toMatchObject({ delivery_status: "delivered", status: "open", expires_at: before });
    expect(d.statusCalls).toHaveLength(1);
  });

  it("records an accepted event too", async () => {
    const { d, offer, event, handle } = await setup();
    await handle(event("accepted"));
    expect(d.offer(offer?.offer_id as string)?.delivery_status).toBe("accepted");
  });

  it("applies a duplicate event again (core is idempotent): the offer is unchanged", async () => {
    const { d, offer, event, handle } = await setup();
    await handle(event("delivered"));
    await handle(event("delivered"));
    expect(d.statusCalls).toHaveLength(2);
    expect(d.offer(offer?.offer_id as string)).toMatchObject({ delivery_status: "delivered", status: "open" });
  });

  it("a late accepted event never undoes delivered (core keeps the furthest status)", async () => {
    const { d, offer, event, handle } = await setup();
    await handle(event("delivered"));
    await handle(event("accepted"));
    expect(d.offer(offer?.offer_id as string)?.delivery_status).toBe("delivered");
  });

  it("a redelivered event still updates the offer when the first attempt was recorded but the update failed", async () => {
    const { d, offer, event, handle } = await setup();
    let fail = true;
    const original = d.core.recordDeliveryStatus;
    d.core.recordDeliveryStatus = async (evt) => {
      if (fail) {
        fail = false;
        throw new Error("connection lost");
      }
      return original(evt);
    };
    await expect(handle(event("delivered"))).rejects.toThrow("connection lost");
    await handle(event("delivered")); // Photon redelivers; core now says "duplicate" for the ledger row
    expect(d.offer(offer?.offer_id as string)?.delivery_status).toBe("delivered");
  });

  it("closes a still-open offer when delivery failed, with Photon's failure code, and the next tick offers B", async () => {
    const { d, ticker, offer, event, handle } = await setup();
    await handle(event("failed", { failure_code: "recipient_opted_out" }));
    expect(d.offer(offer?.offer_id as string)).toMatchObject({ status: "send_failed", failure: "recipient_opted_out" });
    await ticker.tick();
    expect(d.offersFor(D1)[1]).toMatchObject({ identity_id: B, status: "open" });
  });

  it("uses a generic reason when Photon gives no failure code", async () => {
    const { d, offer, event, handle } = await setup();
    await handle(event("failed"));
    expect(d.offer(offer?.offer_id as string)?.failure).toBe("delivery_failed");
  });

  it("closes the offer once even if the failed event arrives twice", async () => {
    const { d, offer, event, handle } = await setup();
    let closes = 0;
    const original = d.core.markOfferSendFailed;
    d.core.markOfferSendFailed = async (input) => {
      closes += 1;
      return original(input);
    };
    await handle(event("failed"));
    await handle(event("failed"));
    expect(d.offer(offer?.offer_id as string)?.status).toBe("send_failed");
    expect(closes).toBe(1);
  });

  it("does not reopen or fail an offer that already expired when a late failed event arrives", async () => {
    const { clock, d, ticker, offer, event, handle } = await setup();
    clock.advance(61_000);
    await ticker.tick();
    await handle(event("failed", { provider_event_id: "evt_late" }));
    expect(d.offer(offer?.offer_id as string)?.status).toBe("expired");
  });

  it("does nothing for a message that is not an offer (a reply, for example)", async () => {
    const { d, event, handle } = await setup();
    await handle(event("failed", { provider_event_id: "evt_other", provider_message_id: "pho_msg_reply" }));
    expect(d.offersFor(D1)[0]?.status).toBe("open");
  });
});
