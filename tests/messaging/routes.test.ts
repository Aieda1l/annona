import { describe, expect, it, vi } from "vitest";
import type { Actor, DeliveryStatusEvent, InboundMessage, InboundResult } from "@/contracts";
import { createInboundRouteHandler } from "@/integrations/photon/http/inbound";
import { createSimulatedHandlers } from "@/integrations/photon/http/simulated";
import { createDispatchHandler } from "@/workflows/http/dispatch";
import { createTickHandler } from "@/workflows/http/tick";
import type { TickReport } from "@/workflows/tick";
import { createClock } from "./doubles/dispatch";

// T-MS-14 (route part) and T-MS-17: each route authenticates first and rejects with 403 and no side effects.
// Webhook signing is UNVERIFIED (docs/handoffs/dev-3.md), so the inbound route accepts only the relay's internal secret.

const SECRET = "internal-secret-for-tests";
const OPERATOR: Actor = { role: "operator", id: "00000000-0000-4000-8000-0000000000a1" };
const COURIER: Actor = { role: "courier", id: "00000000-0000-4000-8000-0000000000a2" };
const report: TickReport = {
  at: "2026-10-17T22:00:00.000Z",
  expired_offers: 0,
  expired_donations: 0,
  offers_created: 1,
  offers_sent: 1,
  send_failures: 0,
};
const post = (url: string, init: { headers?: Record<string, string>; body?: unknown } = {}) =>
  new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...init.headers },
    body: init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body),
  });
const actorOf = (actor: Actor | null) => async () => actor;
const json = async (res: Response) => (await res.json()) as Record<string, unknown>;

describe("T-MS-17 POST /api/internal/tick", () => {
  // `null` means "no secret configured"; a default parameter would turn `undefined` back into SECRET.
  const make = (actor: Actor | null, secret: string | null = SECRET) => {
    const tick = vi.fn(async () => report);
    return { tick, POST: createTickHandler({ tick, getActor: actorOf(actor), internalSecret: () => secret ?? undefined }) };
  };

  it("rejects a request with no secret and no operator session, and does not tick", async () => {
    const { tick, POST } = make(null);
    const res = await POST(post("/api/internal/tick"));
    expect(res.status).toBe(403);
    expect(tick).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret", async () => {
    const { tick, POST } = make(null);
    expect((await POST(post("/api/internal/tick", { headers: { "x-annona-internal-secret": "nope" } }))).status).toBe(403);
    expect(tick).not.toHaveBeenCalled();
  });

  it("rejects every secret when none is configured, even an empty one", async () => {
    const { tick, POST } = make(null, null);
    for (const value of ["", "undefined", SECRET]) {
      const res = await POST(post("/api/internal/tick", { headers: { "x-annona-internal-secret": value } }));
      expect(res.status).toBe(403);
    }
    expect(tick).not.toHaveBeenCalled();
  });

  it("rejects a non-operator session", async () => {
    const { tick, POST } = make(COURIER);
    expect((await POST(post("/api/internal/tick"))).status).toBe(403);
    expect(tick).not.toHaveBeenCalled();
  });

  it("ticks for the correct internal secret and returns the report", async () => {
    const { tick, POST } = make(null);
    const res = await POST(post("/api/internal/tick", { headers: { "x-annona-internal-secret": SECRET } }));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true, data: report });
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it("ticks for an operator session ('Run tick now')", async () => {
    const { tick, POST } = make(OPERATOR);
    expect((await POST(post("/api/internal/tick"))).status).toBe(200);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it("answers 500 without leaking the error when the tick fails", async () => {
    const POST = createTickHandler({
      tick: async () => {
        throw new Error(`db password ${SECRET}`);
      },
      getActor: actorOf(OPERATOR),
      internalSecret: () => SECRET,
    });
    const res = await POST(post("/api/internal/tick"));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await json(res))).not.toContain(SECRET);
  });

  it("answers 501 while the tick is still not implemented", async () => {
    const POST = createTickHandler({
      tick: async () => {
        throw new Error("NOT_IMPLEMENTED (owner Dev 3): tick");
      },
      getActor: actorOf(OPERATOR),
      internalSecret: () => SECRET,
    });
    expect((await POST(post("/api/internal/tick"))).status).toBe(501);
  });
});

describe("T-MS-17 POST /api/donations/:id/dispatch", () => {
  const ID = "d0000000-0000-4000-8000-000000000001";
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  const make = (actor: Actor | null) => {
    const dispatchDonation = vi.fn(async (_id: string) => report);
    return { dispatchDonation, POST: createDispatchHandler({ dispatchDonation, getActor: actorOf(actor) }) };
  };

  it.each([
    ["no session", null],
    ["a courier", COURIER],
  ])("rejects %s and does not dispatch", async (_name, actor) => {
    const { dispatchDonation, POST } = make(actor);
    expect((await POST(post(`/api/donations/${ID}/dispatch`), ctx(ID))).status).toBe(403);
    expect(dispatchDonation).not.toHaveBeenCalled();
  });

  it("does not accept the internal secret: dispatch is operator-only", async () => {
    const { dispatchDonation, POST } = make(null);
    const res = await POST(post(`/api/donations/${ID}/dispatch`, { headers: { "x-annona-internal-secret": SECRET } }), ctx(ID));
    expect(res.status).toBe(403);
    expect(dispatchDonation).not.toHaveBeenCalled();
  });

  it("rejects a malformed donation id with 400", async () => {
    const { dispatchDonation, POST } = make(OPERATOR);
    expect((await POST(post("/api/donations/x/dispatch"), ctx("../etc/passwd"))).status).toBe(400);
    expect(dispatchDonation).not.toHaveBeenCalled();
  });

  it("dispatches the named donation for an operator", async () => {
    const { dispatchDonation, POST } = make(OPERATOR);
    const res = await POST(post(`/api/donations/${ID}/dispatch`), ctx(ID));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true, data: report });
    expect(dispatchDonation).toHaveBeenCalledWith(ID);
  });
});

describe("T-MS-14 POST /api/messaging/photon/inbound", () => {
  const clock = createClock(new Date("2026-10-17T22:00:00.000Z"));
  const inboundResult: InboundResult = { outcome: "processed", command: "help", reply: null };
  // `null` means "no secret configured"; a default parameter would turn `undefined` back into SECRET.
  const make = (secret: string | null = SECRET) => {
    const handleInbound = vi.fn(async (_m: InboundMessage) => inboundResult);
    const handleDeliveryStatus = vi.fn(async (_e: DeliveryStatusEvent) => undefined);
    return {
      handleInbound,
      handleDeliveryStatus,
      POST: createInboundRouteHandler({ internalSecret: () => secret ?? undefined, clock, handleInbound, handleDeliveryStatus }),
    };
  };
  const auth = { "x-annona-internal-secret": SECRET };
  const received = {
    id: "evt_1",
    type: "message.received",
    apiVersion: "2026-07-01",
    source: "imessage.photon",
    timestamp: "2026-10-17T21:59:59.000Z",
    data: {
      projectId: "pho_prj_test",
      object: {
        id: "pho_msg_1",
        platform: "imessage",
        status: "received",
        content: { type: "text", format: "plain", text: "HELP" },
        sentBy: { id: "pho_usr_h", handle: "courier@example.invalid", kind: "human" },
        receivedBy: { id: "pho_usr_line", kind: "agent" },
        space: { id: "pho_spc_1" },
      },
    },
  };
  const delivered = {
    ...received,
    id: "evt_2",
    type: "message.delivered",
    data: { ...received.data, object: { ...received.data.object, status: "delivered" } },
  };

  it("rejects a request without the internal secret: no webhook signature is accepted until its scheme is verified", async () => {
    const { handleInbound, POST } = make();
    expect((await POST(post("/api/messaging/photon/inbound", { body: received }))).status).toBe(403);
    expect(handleInbound).not.toHaveBeenCalled();
  });

  it("rejects every secret when none is configured", async () => {
    const { handleInbound, POST } = make(null);
    expect((await POST(post("/api/messaging/photon/inbound", { headers: auth, body: received }))).status).toBe(403);
    expect(handleInbound).not.toHaveBeenCalled();
  });

  it("normalizes a message.received event and hands it to handleInbound once", async () => {
    const { handleInbound, handleDeliveryStatus, POST } = make();
    const res = await POST(post("/api/messaging/photon/inbound", { headers: auth, body: received }));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ received: true });
    expect(handleInbound).toHaveBeenCalledTimes(1);
    expect(handleInbound.mock.calls[0]?.[0]).toMatchObject({
      provider: "photon",
      provider_message_id: "pho_msg_1",
      text: "HELP",
      sender_handle: "courier@example.invalid",
      received_at: "2026-10-17T22:00:00.000Z",
    });
    expect(handleDeliveryStatus).not.toHaveBeenCalled();
  });

  it("hands a delivery event to handleDeliveryStatus", async () => {
    const { handleInbound, handleDeliveryStatus, POST } = make();
    const res = await POST(post("/api/messaging/photon/inbound", { headers: auth, body: delivered }));
    expect(res.status).toBe(200);
    expect(handleDeliveryStatus).toHaveBeenCalledTimes(1);
    expect(handleDeliveryStatus.mock.calls[0]?.[0]).toMatchObject({ status: "delivered", provider_message_id: "pho_msg_1" });
    expect(handleInbound).not.toHaveBeenCalled();
  });

  it("acknowledges ignored event types without doing anything", async () => {
    const { handleInbound, handleDeliveryStatus, POST } = make();
    const res = await POST(
      post("/api/messaging/photon/inbound", { headers: auth, body: { ...received, type: "message.dispatched" } }),
    );
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ received: true });
    expect(handleInbound).not.toHaveBeenCalled();
    expect(handleDeliveryStatus).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid JSON", "{not json"],
    ["an envelope without an id", { ...received, id: undefined }],
    [
      "a message without a sender",
      { ...received, data: { ...received.data, object: { ...received.data.object, sentBy: undefined } } },
    ],
  ])("answers 400 for %s", async (_name, body) => {
    const { handleInbound, POST } = make();
    expect((await POST(post("/api/messaging/photon/inbound", { headers: auth, body }))).status).toBe(400);
    expect(handleInbound).not.toHaveBeenCalled();
  });

  it("answers 500 when handling fails, so Photon redelivers", async () => {
    const handleInbound = vi.fn(async (_m: InboundMessage): Promise<InboundResult> => {
      throw new Error("core down");
    });
    const POST = createInboundRouteHandler({
      internalSecret: () => SECRET,
      clock,
      handleInbound,
      handleDeliveryStatus: vi.fn(async () => undefined),
    });
    expect((await POST(post("/api/messaging/photon/inbound", { headers: auth, body: received }))).status).toBe(500);
  });
});

describe("T-MS-17 simulated phone", () => {
  const clock = createClock(new Date("2026-10-17T22:00:00.000Z"));
  const IDENTITY = "b0000000-0000-4000-8000-000000000001";
  const identity = (provider: "fake" | "photon" = "fake") => ({
    id: IDENTITY,
    handle: "sim-courier@example.invalid",
    provider,
    actor_role: "courier" as const,
    actor_id: "a0000000-0000-4000-8000-000000000001",
    status: "joined" as const,
    provider_space_id: null,
    provider_sender_id: null,
  });
  const inboundResult: InboundResult = { outcome: "processed", command: "help", reply: null };
  const make = (
    opts: { actor?: Actor | null; demo?: boolean; provider?: "fake" | "photon"; found?: ReturnType<typeof identity> | null } = {},
  ) => {
    const handleInbound = vi.fn(async (_m: InboundMessage) => inboundResult);
    const listMessages = vi.fn(async (_i: { identity_id?: string }) => [{ text: "hi" }] as unknown[]);
    const getIdentity = vi.fn(async (_id: string) => (opts.found === undefined ? identity() : opts.found));
    const handlers = createSimulatedHandlers({
      getActor: actorOf(opts.actor === undefined ? OPERATOR : opts.actor),
      config: () => ({ demo_mode: opts.demo ?? true, messaging_provider: opts.provider ?? "fake" }),
      clock,
      core: { getIdentity, listMessages },
      handleInbound,
      newId: () => "11111111-1111-4111-8111-111111111111",
    });
    return { ...handlers, handleInbound, listMessages, getIdentity };
  };
  const body = { identity_id: IDENTITY, text: "YES K7M3" };
  const sim = (b: unknown) => post("/api/messaging/simulated/inbound", { body: b });
  const thread = () => new Request(`http://localhost/api/messaging/simulated/thread?identity_id=${IDENTITY}`);

  it.each([
    ["no session", { actor: null }],
    ["a courier session", { actor: COURIER }],
    ["demo mode off", { demo: false }],
    ["the real provider selected", { provider: "photon" as const }],
  ])("returns 403 with %s and does nothing", async (_name, opts) => {
    const { POST, GET, handleInbound, listMessages, getIdentity } = make(opts);
    expect((await POST(sim(body))).status).toBe(403);
    expect((await GET(thread())).status).toBe(403);
    expect(handleInbound).not.toHaveBeenCalled();
    expect(listMessages).not.toHaveBeenCalled();
    expect(getIdentity).not.toHaveBeenCalled();
  });

  it("builds a fake-provider message from the identity and runs the same handleInbound", async () => {
    const { POST, handleInbound } = make();
    const res = await POST(sim(body));
    expect(res.status).toBe(200);
    expect((await json(res)).data).toEqual(inboundResult);
    expect(handleInbound.mock.calls[0]?.[0]).toEqual({
      provider: "fake",
      provider_message_id: "fake_11111111-1111-4111-8111-111111111111",
      provider_event_id: null,
      received_at: "2026-10-17T22:00:00.000Z",
      sender_handle: "sim-courier@example.invalid",
      provider_space_id: null,
      provider_line_sender_id: null,
      text: "YES K7M3",
      attachments: [],
    });
  });

  it("turns a known fixture id into a simulated photo attachment", async () => {
    const { POST, handleInbound } = make();
    await POST(sim({ ...body, text: "", fixture_id: "sandwich_platter" }));
    expect(handleInbound.mock.calls[0]?.[0].attachments).toEqual([{ kind: "image", fixture_id: "sandwich_platter" }]);
  });

  it.each([
    ["an unknown fixture id", { ...body, fixture_id: "../../etc/passwd" }],
    ["an extra field", { ...body, handle: "someone-else@example.invalid" }],
    ["a malformed identity id", { ...body, identity_id: "nope" }],
    ["invalid JSON", "{nope"],
  ])("answers 400 for %s", async (_name, b) => {
    const { POST, handleInbound } = make();
    expect((await POST(sim(b))).status).toBe(400);
    expect(handleInbound).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown identity", async () => {
    const { POST, handleInbound } = make({ found: null });
    expect((await POST(sim(body))).status).toBe(404);
    expect(handleInbound).not.toHaveBeenCalled();
  });

  it("refuses to speak as a real Photon identity", async () => {
    const { POST, handleInbound } = make({ found: identity("photon") });
    expect((await POST(sim(body))).status).toBe(403);
    expect(handleInbound).not.toHaveBeenCalled();
  });

  it("returns the identity's thread to an operator", async () => {
    const { GET, listMessages } = make();
    const res = await GET(thread());
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true, data: { messages: [{ text: "hi" }] } });
    expect(listMessages).toHaveBeenCalledWith({ identity_id: IDENTITY });
  });

  it("refuses to list the thread of a real Photon identity (LOW)", async () => {
    const { GET, listMessages } = make({ found: identity("photon") });
    expect((await GET(thread())).status).toBe(403);
    expect(listMessages).not.toHaveBeenCalled();
  });

  it("answers 404 for the thread of an unknown identity (LOW)", async () => {
    const { GET, listMessages } = make({ found: null });
    expect((await GET(thread())).status).toBe(404);
    expect(listMessages).not.toHaveBeenCalled();
  });

  it("answers 400 for a thread request with no identity id", async () => {
    const { GET } = make();
    expect((await GET(new Request("http://localhost/api/messaging/simulated/thread"))).status).toBe(400);
  });
});
