import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { InboundMessage } from "@/contracts";
import { inbound_messages, messaging_identities, offers, outbound_messages, provider_status_events } from "@/db/schema";
import { createFakeGateway } from "@/integrations/photon/gateway-fake";
import { bindCore } from "@/workflows/core-binding";
import { createDeliveryHandler } from "@/workflows/delivery";
import { createInboundHandler } from "@/workflows/inbound";
import { createTicker } from "@/workflows/tick";
import { IDENTITY, at, joinIdentityNow, makeEligibleDonation, makeWorld, resetWorld, type World } from "../core/helpers/world";

// The adapter over Dev 2's real core, on the PGlite test world: messaging's ports behave like the doubles did.

let w: World;
beforeAll(async () => {
  w = await makeWorld();
});
afterAll(async () => w.close());
beforeEach(async () => {
  await resetWorld(w);
  for (const table of [outbound_messages, inbound_messages, provider_status_events]) await w.db.delete(table);
});

async function setup() {
  const deps = w.deps();
  const core = bindCore(deps);
  const gateway = createFakeGateway();
  const ticker = createTicker({ core, gateway, clock: deps.clock });
  const inbound = createInboundHandler({ core, gateway });
  const delivery = createDeliveryHandler({ core });
  return { deps, core, gateway, ticker, inbound, delivery };
}

const message = (text: string, over: Partial<InboundMessage> = {}): InboundMessage => ({
  provider: "fake",
  provider_message_id: `in_${Math.random().toString(36).slice(2)}`,
  sender_handle: "",
  text,
  attachments: [],
  received_at: at(0).toISOString(),
  provider_event_id: null,
  provider_space_id: null,
  provider_line_sender_id: null,
  ...over,
});

async function handleOf(identityId: string): Promise<string> {
  const identity = await bindCore(w.deps()).getIdentity(identityId);
  if (!identity) throw new Error("identity missing");
  return identity.handle;
}

describe("bindCore: tick over the real core", () => {
  it("opens a pending offer, sends it once, and stores the provider message id on the offer", async () => {
    const { ticker } = await setup();
    await joinIdentityNow(w, IDENTITY.courier_a, w.deps());
    const donation_id = await makeEligibleDonation(w);

    const report = await ticker.dispatchDonation(donation_id);

    expect(report.offers_created).toBeGreaterThan(0);
    expect(report.offers_sent).toBeGreaterThan(0);
    const rows = await w.db.select().from(offers).where(eq(offers.donation_id, donation_id));
    expect(rows.some((o) => o.status === "open" && o.provider_message_id !== null)).toBe(true);
  });

  it("a tick finishes even though core's setLastTick is not built yet (the report is still returned)", async () => {
    const { ticker } = await setup();
    await expect(ticker.tick()).resolves.toMatchObject({ offers_created: expect.any(Number) });
  });
});

describe("bindCore: inbound over the real core", () => {
  it("JOIN from a seeded courier joins them and sends one reply", async () => {
    const { inbound } = await setup();
    await w.db.update(messaging_identities).set({ status: "awaiting_join", joined_at: null }).where(eq(messaging_identities.id, IDENTITY.courier_a));
    const handle = await handleOf(IDENTITY.courier_a);
    const result = await inbound(message("JOIN", { sender_handle: handle }));
    expect(result).toMatchObject({ command: "join", outcome: "processed" });
    expect((await bindCore(w.deps()).getIdentity(IDENTITY.courier_a))?.status).toBe("joined");
    expect((await w.db.select().from(outbound_messages)).length).toBe(1);
  });

  it("an unknown sender is ignored and nothing is sent", async () => {
    const { inbound } = await setup();
    const result = await inbound(message("YES", { sender_handle: "stranger@example.invalid" }));
    expect(result).toMatchObject({ outcome: "ignored" });
    expect((await w.db.select().from(outbound_messages)).length).toBe(0);
  });
});

describe("bindCore: delivery over the real core", () => {
  it("a failed delivery event closes the open offer and a duplicate changes nothing more", async () => {
    const { ticker, delivery } = await setup();
    await joinIdentityNow(w, IDENTITY.courier_a, w.deps());
    const donation_id = await makeEligibleDonation(w);
    await ticker.dispatchDonation(donation_id);
    const [open] = await w.db.select().from(offers).where(eq(offers.donation_id, donation_id));
    const event = {
      provider: "fake" as const,
      provider_event_id: "evt_fail_1",
      provider_message_id: open?.provider_message_id as string,
      status: "failed" as const,
      failure_code: "recipient_unreachable",
      at: at(1).toISOString(),
    };
    await delivery(event);
    await delivery(event);
    const [after] = await w.db.select().from(offers).where(eq(offers.id, open?.id as string));
    expect(after?.status).toBe("send_failed");
  });
});
