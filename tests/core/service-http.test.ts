import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor, MessagingGateway, VisionProvider } from "@/contracts";
import { createDashboardHandler } from "@/core/http/dashboard";
import { createDemoResetHandler } from "@/core/http/demo";
import { createDonationHandler } from "@/core/http/donation";
import { createHandoffHandler } from "@/core/http/handoff";
import { createImageHandler } from "@/core/http/images";
import { createOperatorActionHandler } from "@/core/http/operator";
import { audit_events, donations } from "@/db/schema";
import {
  DONOR,
  DONOR_PENDING,
  PNG_BYTES,
  T0,
  courierActor,
  donorActor,
  factsAt,
  insertDonation,
  makeEligibleDonation,
  makeWorld,
  operatorActor,
  resetWorld,
  type World,
} from "./helpers/world";

// Slice 2(c) HTTP handlers (CONTRACTS section 10, 3.15) and T-CO-29: no session or the wrong role is NOT_AUTHORIZED
// (403) with no writes. The session is injected (the real one is the captain's signed cookie, tested in their lane).

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

let w: World;
beforeAll(async () => {
  w = await makeWorld();
});
afterAll(async () => w.close());
beforeEach(async () => resetWorld(w));
afterEach(() => vi.unstubAllEnvs());

const vision = { mode: "fake", model: null, status: "ok" } as unknown as VisionProvider;
const messaging = { mode: "fake", channel: "simulated", status: "ok" } as unknown as MessagingGateway;
const as = (actor: Actor | null) => ({ getActor: async () => actor, deps: { ...w.deps(), vision, messaging } });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const get = (path: string) => new Request(`http://test${path}`);
const post = (path: string, body?: string) =>
  new Request(`http://test${path}`, { method: "POST", headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body }) });
const json = async (r: Response) => (await r.json()) as { ok: boolean; data?: Record<string, unknown>; error?: { code: string } };
const auditCount = async () => (await w.db.select().from(audit_events)).length;

describe("T-CO-29: no session is 403 everywhere, before anything is read", () => {
  it("each handler", async () => {
    const id = (await insertDonation(w.db)).id;
    const responses = [
      await createDonationHandler(as(null))(get(`/api/donations/${id}`), params(id)),
      await createDashboardHandler(as(null))(get("/api/dashboard")),
      await createOperatorActionHandler(as(null))(post(`/x`, JSON.stringify({ action: "cancel", note: "" })), params(id)),
      await createHandoffHandler(as(null))(post(`/x`, JSON.stringify({ step: "collected" })), params(id)),
      await createImageHandler(as(null))(get(`/api/images/${id}`), params(id)),
      await createDemoResetHandler(as(null))(post("/api/demo/reset")),
    ];
    for (const r of responses) {
      expect(r.status).toBe(403);
      expect((await json(r)).error?.code).toBe("NOT_AUTHORIZED");
    }
  });
});

describe("T-CO-29: the role is checked before the body is read", () => {
  it("a wrong role or no session gets 403 even with a body that would otherwise be rejected, and nothing is written", async () => {
    const id = (await insertDonation(w.db)).id;
    const before = await auditCount();
    const junk = "{not json";
    for (const actor of [null, donorActor(), courierActor()]) {
      const r = await createOperatorActionHandler(as(actor))(post("/x", junk), params(id));
      expect(r.status, String(actor?.role)).toBe(403);
    }
    const reset = await createDemoResetHandler(as(courierActor()))(post("/api/demo/reset", junk));
    expect(reset.status).toBe(403);
    expect(await auditCount()).toBe(before);
  });
  it("the handoff handler refuses a stranger and a missing donation with the same 403", async () => {
    const id = (await insertDonation(w.db)).id;
    const h = createHandoffHandler(as(courierActor()));
    expect((await h(post("/x", JSON.stringify({ step: "collected" })), params(id))).status).toBe(403);
    expect((await h(post("/x", JSON.stringify({ step: "collected" })), params(randomUUID()))).status).toBe(403);
  });
});

describe("GET /api/donations/:id and GET /api/dashboard", () => {
  it("the owning donor and the operator see the card; another donor and a courier get 403; a bad id is 404", async () => {
    const id = await makeEligibleDonation(w);
    const handler = (a: Actor) => createDonationHandler(as(a))(get(`/api/donations/${id}`), params(id));
    expect((await handler(donorActor())).status).toBe(200);
    const op = await handler(operatorActor);
    expect(op.status).toBe(200);
    expect(op.headers.get("cache-control")).toBe("no-store");
    expect((await handler(donorActor(DONOR_PENDING))).status).toBe(403);
    expect((await handler(courierActor())).status).toBe(403);
    expect((await createDonationHandler(as(operatorActor))(get("/x"), params("not-a-uuid"))).status).toBe(404);
  });
  it("the dashboard is operator only", async () => {
    expect((await createDashboardHandler(as(donorActor()))(get("/api/dashboard"))).status).toBe(403);
    const r = await createDashboardHandler(as(operatorActor))(get("/api/dashboard"));
    expect(r.status).toBe(200);
    expect((await json(r)).data).toHaveProperty("counts_by_status");
  });
});

describe("POST /api/donations/:id/operator-actions", () => {
  it("a non-operator is 403 with no writes, even with a valid body", async () => {
    const row = await insertDonation(w.db, { status: "needs_review", verified_facts: factsAt() });
    const before = await auditCount();
    const r = await createOperatorActionHandler(as(donorActor()))(post("/x", JSON.stringify({ action: "reject", note: "n" })), params(row.id));
    expect(r.status).toBe(403);
    expect((await w.db.select().from(donations).where(eq(donations.id, row.id)))[0]!.status).toBe("needs_review");
    expect(await auditCount()).toBe(before);
  });
  it("the body is strict: unknown keys, a missing note, bad JSON and no body are 400", async () => {
    const row = await insertDonation(w.db, { status: "needs_review", verified_facts: factsAt() });
    const handler = createOperatorActionHandler(as(operatorActor));
    for (const body of [JSON.stringify({ action: "reject", note: "n", force: true }), JSON.stringify({ action: "reject" }), JSON.stringify({ action: "approve", note: "" }), "{not json", undefined]) {
      const r = await handler(post("/x", body), params(row.id));
      expect(r.status, String(body)).toBe(400);
    }
  });
  it("maps outcomes to HTTP: ok 200, INVALID_TRANSITION 409, unknown donation 404", async () => {
    const row = await insertDonation(w.db, { status: "needs_review", verified_facts: factsAt() });
    const handler = createOperatorActionHandler(as(operatorActor));
    expect((await handler(post("/x", JSON.stringify({ action: "reject", note: "" })), params(row.id))).status).toBe(409);
    const ok = await handler(post("/x", JSON.stringify({ action: "reject", note: "no log" })), params(row.id));
    expect(ok.status).toBe(200);
    expect((await json(ok)).data).toMatchObject({ status: "rejected" });
    expect((await handler(post("/x", JSON.stringify({ action: "reject", note: "n" })), params("00000000-0000-4000-8000-000000000001"))).status).toBe(404);
  });
});

describe("POST /api/donations/:id/handoff", () => {
  it("the client cannot choose simulated: the body only has a step", async () => {
    const row = await insertDonation(w.db, { status: "claimed", claimed_offer_id: "00000000-0000-4000-8000-000000000002" });
    const r = await createHandoffHandler(as(operatorActor))(post("/x", JSON.stringify({ step: "collected", simulated: false })), params(row.id));
    expect(r.status).toBe(400);
  });
  it("a stranger is 403", async () => {
    const row = await insertDonation(w.db, { status: "claimed", claimed_offer_id: "00000000-0000-4000-8000-000000000002" });
    expect((await createHandoffHandler(as(courierActor()))(post("/x", JSON.stringify({ step: "collected" })), params(row.id))).status).toBe(403);
  });
});

describe("GET /api/images/:id", () => {
  it("serves the bytes to the owning donor and the operator with safe headers; others get 403; unknown is 404", async () => {
    const id = await makeEligibleDonation(w);
    const [row] = await w.db.select().from(donations).where(eq(donations.id, id));
    const imageId = row!.image_id!;
    const handler = (a: Actor) => createImageHandler(as(a))(get(`/api/images/${imageId}`), params(imageId));

    const mine = await handler(donorActor(DONOR));
    expect(mine.status).toBe(200);
    expect(mine.headers.get("content-type")).toBe("image/png");
    expect(mine.headers.get("x-content-type-options")).toBe("nosniff");
    expect(mine.headers.get("cache-control")).toBe("private, no-store");
    expect(new Uint8Array(await mine.arrayBuffer())).toEqual(PNG_BYTES);
    expect((await handler(operatorActor)).status).toBe(200);
    expect((await handler(donorActor(DONOR_PENDING))).status).toBe(403);
    expect((await handler(courierActor())).status).toBe(403);
    expect((await createImageHandler(as(operatorActor))(get("/x"), params("00000000-0000-4000-8000-000000000003"))).status).toBe(404);
  });
});

describe("POST /api/demo/reset", () => {
  it("accepts an operator request with no body (Dev 4 sends none) or {} in demo mode", async () => {
    vi.stubEnv("ANNONA_DEMO_MODE", "1");
    const handler = createDemoResetHandler(as(operatorActor));
    const r = await handler(post("/api/demo/reset"));
    expect(r.status).toBe(200);
    expect((await json(r)).data).toEqual({ reset_at: T0.toISOString() });
    expect((await handler(post("/api/demo/reset", "{}"))).status).toBe(200);
  });
  it("refuses a body, a non-operator and demo mode off", async () => {
    vi.stubEnv("ANNONA_DEMO_MODE", "1");
    const id = await makeEligibleDonation(w);
    expect((await createDemoResetHandler(as(operatorActor))(post("/api/demo/reset", JSON.stringify({ wipe: "all" })))).status).toBe(400);
    expect((await createDemoResetHandler(as(courierActor()))(post("/api/demo/reset"))).status).toBe(403);
    vi.stubEnv("ANNONA_DEMO_MODE", "");
    expect((await createDemoResetHandler(as(operatorActor))(post("/api/demo/reset"))).status).toBe(403);
    expect(await w.db.select().from(donations).where(eq(donations.id, id))).toHaveLength(1);
  });
});
