import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Deps, InboundMessage } from "@/contracts";
import { inbound_messages, messaging_identities, offers, outbound_messages, provider_status_events } from "@/db/schema";
import { createFakeGateway } from "@/integrations/photon/gateway-fake";
import { dispatchDonation, handleDeliveryStatus, handleInbound, tick } from "@/workflows";
import { IDENTITY, at, joinIdentityNow, makeEligibleDonation, makeWorld, resetWorld, type World } from "../core/helpers/world";

// The barrel entry points (CONTRACTS §9.4) over the real core: what the routes and the relay worker actually call.

let w: World;
beforeAll(async () => {
  w = await makeWorld();
});
afterAll(async () => w.close());
beforeEach(async () => {
  await resetWorld(w);
  for (const table of [outbound_messages, inbound_messages, provider_status_events]) await w.db.delete(table);
});

const deps = (): Deps => ({ ...w.deps(), messaging: createFakeGateway() });

const message = (text: string, sender_handle: string): InboundMessage => ({
  provider: "fake",
  provider_message_id: `in_${Math.random().toString(36).slice(2)}`,
  provider_event_id: null,
  received_at: at(0).toISOString(),
  sender_handle,
  provider_space_id: null,
  provider_line_sender_id: null,
  text,
  attachments: [],
});

describe("handleInbound", () => {
  it("runs the whole inbound path: a seeded courier texts JOIN and is joined", async () => {
    await w.db.update(messaging_identities).set({ status: "awaiting_join", joined_at: null }).where(eq(messaging_identities.id, IDENTITY.courier_a));
    const [row] = await w.db.select().from(messaging_identities).where(eq(messaging_identities.id, IDENTITY.courier_a));
    const result = await handleInbound(message("JOIN", row?.handle as string), deps());
    expect(result).toMatchObject({ command: "join", outcome: "processed" });
    const [after] = await w.db.select().from(messaging_identities).where(eq(messaging_identities.id, IDENTITY.courier_a));
    expect(after?.status).toBe("joined");
  });
});

describe("tick and dispatchDonation", () => {
  it("dispatchDonation offers one eligible donation and returns a contract TickReport", async () => {
    await joinIdentityNow(w, IDENTITY.courier_a, w.deps());
    const donation_id = await makeEligibleDonation(w);
    const report = await dispatchDonation(donation_id, deps());
    expect(report).toMatchObject({ offers_created: expect.any(Number), offers_sent: expect.any(Number) });
    expect(report.offers_sent).toBeGreaterThan(0);
    expect((await w.db.select().from(offers).where(eq(offers.donation_id, donation_id))).some((o) => o.status === "open")).toBe(true);
  });

  it("tick on an empty world returns zeroes and does not throw", async () => {
    const report = await tick(deps());
    expect(report).toMatchObject({ expired_offers: 0, expired_donations: 0, offers_created: 0, offers_sent: 0, send_failures: 0 });
  });
});

describe("handleDeliveryStatus", () => {
  it("applies a delivered event to the offer it names", async () => {
    await joinIdentityNow(w, IDENTITY.courier_a, w.deps());
    const donation_id = await makeEligibleDonation(w);
    const d = deps();
    await dispatchDonation(donation_id, d);
    const [open] = await w.db.select().from(offers).where(eq(offers.donation_id, donation_id));
    await handleDeliveryStatus(
      { provider: "fake", provider_event_id: "evt_1", provider_message_id: open?.provider_message_id as string, status: "delivered", failure_code: null, at: at(1).toISOString() },
      d,
    );
    const [after] = await w.db.select().from(offers).where(eq(offers.id, open?.id as string));
    expect(after?.delivery_status).toBe("delivered");
  });
});
