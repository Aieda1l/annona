// GET /api/health reports the last tick and the active policy from core's getSystemStatus (CONTRACTS §3.13), and never
// a value it did not read: when the status read fails, the banner gets null / "unavailable", not a made-up time.
import { afterEach, describe, expect, it, vi } from "vitest";
import { SystemModes, type MessagingGateway, type Services, type VisionProvider } from "@/contracts";
import { createHealthHandler } from "@/server/health";

const vision = { mode: "fake", model: null, status: "ok" } as unknown as VisionProvider;
const messaging = { mode: "fake", channel: "simulated", status: "ok" } as unknown as MessagingGateway;
const services = () => ({ vision, messaging, store: { kind: "pglite" } }) as unknown as Services;
const request = () => new Request("http://localhost/api/health");

async function body(res: Response) {
  const json = (await res.json()) as { ok: boolean; data: unknown };
  expect(json.ok).toBe(true);
  return SystemModes.parse(json.data);
}

afterEach(() => vi.restoreAllMocks());

describe("GET /api/health", () => {
  it("reports the last tick and the active policy version that core stored", async () => {
    const GET = createHealthHandler({
      getServices: services,
      getSystemStatus: async () => ({ last_tick_at: "2026-10-17T23:15:00.000Z", store: "pglite", policy_version: "2026-10-17.1" }),
    });
    const modes = await body(await GET(request()));
    expect(modes.last_tick_at).toBe("2026-10-17T23:15:00.000Z");
    expect(modes.policy_version).toBe("2026-10-17.1");
    expect(modes.store).toBe("pglite");
  });

  it("reports no tick yet as null, not a made-up time", async () => {
    const GET = createHealthHandler({
      getServices: services,
      getSystemStatus: async () => ({ last_tick_at: null, store: "pglite", policy_version: "2026-10-17.1" }),
    });
    expect((await body(await GET(request()))).last_tick_at).toBeNull();
  });

  it("when the status read fails, still answers with the provider modes and null / unavailable, and logs no detail", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const GET = createHealthHandler({
      getServices: services,
      getSystemStatus: async () => {
        throw new Error("connect ECONNREFUSED postgres://user:secret@db.example:5432/annona");
      },
    });
    const res = await GET(request());
    expect(res.status).toBe(200);
    const modes = await body(res);
    expect(modes.last_tick_at).toBeNull();
    expect(modes.policy_version).toBe("unavailable");
    expect(modes.vision.mode).toBe("fake");
    expect(modes.messaging.mode).toBe("fake");
    expect(modes.store).toBe("pglite");
    const line = logged.mock.calls.flat().join(" ");
    expect(line).toContain("[health]");
    expect(line).not.toContain("secret");
  });

  it("reads the provider modes from the providers themselves", async () => {
    const real = { mode: "real", model: "gemini-x", status: "ok" } as unknown as VisionProvider;
    const GET = createHealthHandler({
      getServices: () => ({ vision: real, messaging, store: { kind: "postgres" } }) as unknown as Services,
      getSystemStatus: async () => ({ last_tick_at: null, store: "postgres", policy_version: "2026-10-17.1" }),
    });
    const modes = await body(await GET(request()));
    expect(modes.vision).toMatchObject({ mode: "real", provider: "gemini", model: "gemini-x" });
    expect(modes.store).toBe("postgres");
  });
});
