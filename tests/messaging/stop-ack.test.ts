import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { InboundMessage } from "@/contracts";
import { inbound_messages, messaging_identities, outbound_messages, provider_status_events } from "@/db/schema";
import { createCoreRouteLookup, createMessagingGateway } from "@/integrations/photon/gateway";
import { bindCore } from "@/workflows/core-binding";
import { createInboundHandler } from "@/workflows/inbound";
import { IDENTITY, at, makeWorld, resetWorld, type World } from "../core/helpers/world";

// Found in the first live STOP (REAL Photon, deployed stack): the confirmation never arrived. The sender allows a
// stop_ack to an identity that has just opted out, but the real gateway only looked up a reply route for a JOINED
// identity, so it found none and dropped the confirmation. The fake gateway has no route lookup, so nothing caught it.

const SPACE = "pho_spc_stopack1";
const SENDER = "pho_usr_stopline1";

let w: World;
beforeAll(async () => {
  w = await makeWorld();
});
afterAll(async () => w.close());
beforeEach(async () => {
  await resetWorld(w);
  for (const table of [outbound_messages, inbound_messages, provider_status_events]) await w.db.delete(table);
  await w.db.update(messaging_identities).set({ provider_space_id: SPACE, provider_sender_id: SENDER }).where(eq(messaging_identities.id, IDENTITY.courier_a));
});

const setStatus = (status: "joined" | "opted_out" | "awaiting_join") =>
  w.db.update(messaging_identities).set({ status }).where(eq(messaging_identities.id, IDENTITY.courier_a));

describe("createCoreRouteLookup: who may be replied to", () => {
  it("a joined identity gets its Photon space and the line's sender, for any purpose", async () => {
    const lookup = createCoreRouteLookup(w.deps());
    expect(await lookup(IDENTITY.courier_a, "offer")).toEqual({ space_id: SPACE, sender_id: SENDER });
  });

  it("an identity that has just opted out is reachable for its stop_ack, and only for that", async () => {
    await setStatus("opted_out");
    const lookup = createCoreRouteLookup(w.deps());
    expect(await lookup(IDENTITY.courier_a, "stop_ack")).toEqual({ space_id: SPACE, sender_id: SENDER });
    for (const purpose of ["offer", "claim_result", "help", "join_ack", "draft_ready"] as const) {
      expect(await lookup(IDENTITY.courier_a, purpose), purpose).toBeNull();
    }
  });

  it("an identity that never joined has no route, even for a stop_ack", async () => {
    await setStatus("awaiting_join");
    expect(await createCoreRouteLookup(w.deps())("" + IDENTITY.courier_a, "stop_ack")).toBeNull();
  });

  it("no route without a stored space and sender, and none for an unknown identity", async () => {
    await w.db.update(messaging_identities).set({ provider_space_id: null }).where(eq(messaging_identities.id, IDENTITY.courier_a));
    const lookup = createCoreRouteLookup(w.deps());
    expect(await lookup(IDENTITY.courier_a, "offer")).toBeNull();
    expect(await lookup("00000000-0000-4000-8000-0000000000ff", "stop_ack")).toBeNull();
  });
});

describe("STOP through the real Photon gateway", () => {
  const stop = (handle: string): InboundMessage => ({
    provider: "photon",
    provider_message_id: "pho_msg_stopack1",
    provider_event_id: null,
    received_at: at(0).toISOString(),
    sender_handle: handle,
    provider_space_id: SPACE,
    provider_line_sender_id: SENDER,
    text: "STOP",
    attachments: [],
  });

  it("sends the confirmation to the person who just opted out, in their own space, and records it", async () => {
    const deps = w.deps();
    await w.db.update(messaging_identities).set({ provider: "photon" }).where(eq(messaging_identities.id, IDENTITY.courier_a));
    const handle = (await bindCore(deps).getIdentity(IDENTITY.courier_a))?.handle as string;
    const fetchStub = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({ id: "pho_msg_ack_sent1" }), { status: 202, headers: { "content-type": "application/json" } }),
    );
    const gateway = createMessagingGateway(
      { mode: "photon", project_id: "pho_prj_test", api_key: "pho_sk_TEST_not_a_real_key" },
      { fetch: fetchStub as unknown as typeof fetch, lookupRoute: createCoreRouteLookup(deps) },
    );
    const result = await createInboundHandler({ core: bindCore(deps), gateway })(stop(handle));

    expect(result).toMatchObject({ command: "stop", outcome: "processed", reply: { purpose: "stop_ack" } });
    expect((await bindCore(deps).getIdentity(IDENTITY.courier_a))?.status).toBe("opted_out");
    expect(fetchStub).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchStub.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ spaceId: SPACE, senderId: SENDER });
    expect(body.content.text).toMatch(/opted out/i);
    const [row] = await w.db.select().from(outbound_messages);
    expect(row).toMatchObject({ purpose: "stop_ack", provider_message_id: "pho_msg_ack_sent1" });
  });
});
