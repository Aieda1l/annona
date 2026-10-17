import { describe, expect, it, vi } from "vitest";
import { createRelay } from "@/workflows/relay";
import { createClock } from "./doubles/dispatch";

// T-MS-12 (worker part): the tick loop and the poll relay (ARCHITECTURE §6). fetch is stubbed; nothing here touches the
// network, so every result is FAKE evidence. The poll transport itself was VERIFIED live at the kickoff spike.

const SECRET = "worker-internal-secret";
const API_KEY = "photon-key-for-tests-not-real";
const APP = "http://localhost:3000";
const NOW = new Date("2026-10-17T22:00:00.000Z");

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const message = (id: string, createdAt: string, over: Record<string, unknown> = {}) => ({
  id,
  platform: "imessage",
  status: "received",
  createdAt,
  content: { type: "text", format: "plain", text: "YES K7M3" },
  sentBy: { id: "pho_usr_h", handle: "courier@example.invalid", kind: "human" },
  receivedBy: { id: "pho_usr_line", kind: "agent" },
  space: { id: "pho_spc_1" },
  ...over,
});

function setup(opts: { routes?: (url: string, init?: RequestInit) => Response | Promise<Response>; cursor?: string | null } = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchStub = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    return (await opts.routes?.(u, init)) ?? json(200, {});
  });
  let stored = opts.cursor ?? null;
  const logs: string[] = [];
  const relay = createRelay({
    appBaseUrl: APP,
    internalSecret: SECRET,
    photon: { projectId: "pho_prj_test", apiKey: API_KEY },
    fetch: fetchStub as unknown as typeof fetch,
    clock: createClock(NOW),
    cursor: { load: async () => stored, save: async (iso) => void (stored = iso) },
    log: (line) => void logs.push(line),
  });
  return { relay, calls, logs, cursor: () => stored };
}

const tickUrl = `${APP}/api/internal/tick`;
const inboundUrl = `${APP}/api/messaging/photon/inbound`;
const isPhoton = (u: string) => u.startsWith("https://api.photon.codes/");

describe("T-MS-12 tick loop", () => {
  it("posts to the tick route with the internal secret and returns the report", async () => {
    const report = { at: "2026-10-17T22:00:00.000Z", offers_sent: 1 };
    const { relay, calls } = setup({ routes: () => json(200, { ok: true, data: report }) });
    expect(await relay.tickOnce()).toEqual(report);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(tickUrl);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(new Headers(calls[0]?.init?.headers).get("x-annona-internal-secret")).toBe(SECRET);
  });

  it.each([
    ["a 403", () => json(403, { ok: false })],
    ["a 500", () => json(500, { ok: false })],
    ["a network error", () => Promise.reject(new TypeError("fetch failed"))],
  ])("survives %s and returns null so the loop keeps running", async (_name, routes) => {
    const { relay } = setup({ routes });
    expect(await relay.tickOnce()).toBeNull();
  });

  it("never writes a secret to its logs", async () => {
    const { relay, logs } = setup({ routes: () => json(500, { detail: `leaked ${SECRET} ${API_KEY}` }) });
    await relay.tickOnce();
    await relay.pollOnce();
    expect(logs.join("\n")).not.toContain(SECRET);
    expect(logs.join("\n")).not.toContain(API_KEY);
  });
});

describe("T-MS-12 poll relay", () => {
  const first = message("pho_msg_1", "2026-10-17T21:59:30.000Z");
  const second = message("pho_msg_2", "2026-10-17T21:59:40.000Z", { content: { type: "text", format: "plain", text: "NO K7M3" } });
  const ours = message("pho_msg_out", "2026-10-17T21:59:35.000Z", { status: "delivered", sentBy: { id: "pho_usr_line", handle: "x", kind: "agent" } });

  const routes = (items: unknown[]) => (u: string) => (isPhoton(u) ? json(200, { items }) : json(200, { received: true }));

  it("asks Photon for received iMessage messages since the cursor, oldest first, with the project key", async () => {
    const { relay, calls } = setup({ routes: routes([]), cursor: "2026-10-17T21:50:00.000Z" });
    await relay.pollOnce();
    const url = new URL(calls[0]?.url as string);
    expect(`${url.origin}${url.pathname}`).toBe("https://api.photon.codes/v1/projects/pho_prj_test/messages");
    expect(url.searchParams.get("platform")).toBe("imessage");
    expect(url.searchParams.get("order")).toBe("asc");
    expect(url.searchParams.get("createdSince")).toBe("2026-10-17T21:50:00.000Z");
    expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe(`Bearer ${API_KEY}`);
  });

  it("starts ten minutes back when there is no cursor yet", async () => {
    const { relay, calls } = setup({ routes: routes([]) });
    await relay.pollOnce();
    expect(new URL(calls[0]?.url as string).searchParams.get("createdSince")).toBe("2026-10-17T21:50:00.000Z");
  });

  it("relays each received message to the inbound route as a message.received envelope, with the internal secret", async () => {
    const { relay, calls } = setup({ routes: routes([first, ours, second]) });
    const result = await relay.pollOnce();
    const posts = calls.filter((c) => c.url === inboundUrl);
    expect(posts).toHaveLength(2);
    expect(result.relayed).toBe(2);
    expect(new Headers(posts[0]?.init?.headers).get("x-annona-internal-secret")).toBe(SECRET);
    const envelope = JSON.parse(posts[0]?.init?.body as string);
    expect(envelope).toMatchObject({
      id: "poll_pho_msg_1",
      type: "message.received",
      apiVersion: "2026-07-01",
      source: "imessage.photon",
      data: { projectId: "pho_prj_test", object: { id: "pho_msg_1", status: "received" } },
    });
  });

  it("does not relay our own outbound messages", async () => {
    const { relay, calls } = setup({ routes: routes([ours]) });
    expect((await relay.pollOnce()).relayed).toBe(0);
    expect(calls.filter((c) => c.url === inboundUrl)).toHaveLength(0);
  });

  it("advances the cursor to the last relayed message", async () => {
    const { relay, cursor } = setup({ routes: routes([first, second]) });
    await relay.pollOnce();
    expect(cursor()).toBe("2026-10-17T21:59:40.000Z");
  });

  it("does not relay the same message twice when the next poll overlaps", async () => {
    const { relay, calls } = setup({ routes: routes([first, second]) });
    await relay.pollOnce();
    await relay.pollOnce();
    expect(calls.filter((c) => c.url === inboundUrl)).toHaveLength(2);
  });

  it("stops at a message the app could not take, keeps the cursor before it, and retries it next time", async () => {
    let failSecond = true;
    const { relay, calls, cursor } = setup({
      routes: (u, init) => {
        if (isPhoton(u)) return json(200, { items: [first, second] });
        if (init?.body && String(init.body).includes("pho_msg_2") && failSecond) return json(500, {});
        return json(200, { received: true });
      },
    });
    const a = await relay.pollOnce();
    expect(a.relayed).toBe(1);
    expect(cursor()).toBe("2026-10-17T21:59:30.000Z");
    failSecond = false;
    const b = await relay.pollOnce();
    expect(b.relayed).toBe(1);
    expect(cursor()).toBe("2026-10-17T21:59:40.000Z");
    expect(calls.filter((c) => c.url === inboundUrl && String(c.init?.body).includes("pho_msg_2"))).toHaveLength(2);
  });

  it("waits Retry-After seconds after a 429 and relays nothing", async () => {
    const { relay, calls } = setup({ routes: () => json(429, { code: "RATE_LIMITED" }, { "retry-after": "7" }) });
    expect(await relay.pollOnce()).toEqual({ relayed: 0, waitMs: 7000 });
    expect(calls.filter((c) => c.url === inboundUrl)).toHaveLength(0);
  });

  it("survives a Photon outage and polls again after the normal interval", async () => {
    const { relay } = setup({ routes: () => Promise.reject(new TypeError("fetch failed")) });
    expect(await relay.pollOnce()).toEqual({ relayed: 0, waitMs: 2000 });
  });
});

describe("T-MS-12 review fixes", () => {
  it("does not lose inbound messages that sit behind 50 or more of our own sends (M1)", async () => {
    // 60 outbound records, then one real inbound message. Photon returns at most 50 per page, oldest first.
    const outbound = Array.from({ length: 60 }, (_, i) =>
      message(`pho_msg_out_${i}`, new Date(Date.UTC(2026, 9, 17, 21, 55, i)).toISOString(), { status: "delivered", sentBy: { id: "pho_usr_line", handle: "x", kind: "agent" } }),
    );
    const inbound = message("pho_msg_in", "2026-10-17T21:57:00.000Z");
    const all = [...outbound, inbound];
    const { relay, calls } = setup({
      routes: (u) => {
        if (!isPhoton(u)) return json(200, { received: true });
        const since = new URL(u).searchParams.get("createdSince") as string;
        return json(200, { items: all.filter((m) => m.createdAt >= since).slice(0, 50) });
      },
      cursor: "2026-10-17T21:55:00.000Z",
    });
    await relay.pollOnce();
    await relay.pollOnce();
    const relayed = calls.filter((c) => c.url === inboundUrl).map((c) => JSON.parse(c.init?.body as string).data.object.id);
    expect(relayed).toEqual(["pho_msg_in"]);
  });

  it("keeps working when the cursor cannot be saved (M2)", async () => {
    const logs: string[] = [];
    const relay = createRelay({
      appBaseUrl: APP,
      internalSecret: SECRET,
      photon: { projectId: "pho_prj_test", apiKey: API_KEY },
      fetch: (async (u: string) => (isPhoton(String(u)) ? json(200, { items: [message("pho_msg_1", "2026-10-17T21:59:30.000Z")] }) : json(200, { received: true }))) as unknown as typeof fetch,
      clock: createClock(NOW),
      cursor: { load: async () => null, save: async () => { throw new Error("EROFS: read-only file system"); } },
      log: (line) => void logs.push(line),
    });
    await expect(relay.pollOnce()).resolves.toMatchObject({ relayed: 1 });
    expect(logs.join("\n")).toMatch(/cursor/i);
  });

  it("falls back to the ten-minute window when the cursor cannot be read (M2)", async () => {
    const calls: string[] = [];
    const relay = createRelay({
      appBaseUrl: APP,
      internalSecret: SECRET,
      photon: { projectId: "pho_prj_test", apiKey: API_KEY },
      fetch: (async (u: string) => { calls.push(String(u)); return json(200, { items: [] }); }) as unknown as typeof fetch,
      clock: createClock(NOW),
      cursor: { load: async () => { throw new Error("EACCES"); }, save: async () => undefined },
      log: () => undefined,
    });
    await expect(relay.pollOnce()).resolves.toMatchObject({ relayed: 0 });
    expect(new URL(calls[0] as string).searchParams.get("createdSince")).toBe("2026-10-17T21:50:00.000Z");
  });

  it("the run loop survives an unexpected failure in a tick or a poll (M2)", async () => {
    let n = 0;
    const relay = createRelay({
      appBaseUrl: APP,
      internalSecret: SECRET,
      photon: { projectId: "pho_prj_test", apiKey: API_KEY },
      fetch: (async () => { n += 1; throw new Error("unexpected"); }) as unknown as typeof fetch,
      clock: createClock(NOW),
      cursor: { load: async () => null, save: async () => undefined },
      log: () => undefined,
    });
    const controller = new AbortController();
    let sleeps = 0;
    await expect(
      relay.run({ tickIntervalMs: 1, signal: controller.signal, sleep: async () => { sleeps += 1; if (sleeps >= 4) controller.abort(); } }),
    ).resolves.toBeUndefined();
    expect(n).toBeGreaterThan(1);
  });

  it("gives every outgoing request a timeout so a hung server cannot stall the loop (LOW)", async () => {
    const { relay, calls } = setup({ routes: (u) => (isPhoton(u) ? json(200, { items: [message("pho_msg_1", "2026-10-17T21:59:30.000Z")] }) : json(200, { ok: true, data: {} })) });
    await relay.tickOnce();
    await relay.pollOnce();
    expect(calls.length).toBeGreaterThanOrEqual(3);
    for (const c of calls) expect(c.init?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("T-MS-12 run loop", () => {
  it("ticks and polls repeatedly until aborted, then stops", async () => {
    const { relay, calls } = setup({ routes: (u) => (isPhoton(u) ? json(200, { items: [] }) : json(200, { ok: true, data: {} })) });
    const controller = new AbortController();
    let sleeps = 0;
    await relay.run({
      tickIntervalMs: 5000,
      signal: controller.signal,
      sleep: async () => {
        sleeps += 1;
        if (sleeps >= 6) controller.abort();
      },
    });
    expect(calls.filter((c) => c.url === tickUrl).length).toBeGreaterThan(1);
    expect(calls.filter((c) => isPhoton(c.url)).length).toBeGreaterThan(1);
  });

  it("only ticks when no Photon credentials are given (fake mode)", async () => {
    const calls: string[] = [];
    const relay = createRelay({
      appBaseUrl: APP,
      internalSecret: SECRET,
      photon: null,
      fetch: (async (url: string) => {
        calls.push(String(url));
        return json(200, { ok: true, data: {} });
      }) as unknown as typeof fetch,
      clock: createClock(NOW),
      cursor: { load: async () => null, save: async () => undefined },
      log: () => undefined,
    });
    const controller = new AbortController();
    let sleeps = 0;
    await relay.run({
      tickIntervalMs: 5000,
      signal: controller.signal,
      sleep: async () => {
        sleeps += 1;
        if (sleeps >= 3) controller.abort();
      },
    });
    expect(calls.every((u) => u === tickUrl)).toBe(true);
    expect(calls.length).toBeGreaterThan(0);
  });
});
