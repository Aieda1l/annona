import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_ACTORS, eligibleCard, err, ok, type ErrorCode } from "@/contracts";
import { createDraftsHandler } from "@/features/intake/http/drafts";
import { cookieFor, jsonRequest, useSessionEnv } from "./doubles/http";

// POST /api/intake/drafts (CONTRACTS §10): donor only, strict body, actor only from the session.
const SAVED = { ...process.env };
const URL_ = "http://localhost/api/intake/drafts";
const donor = DEMO_ACTORS.find((a) => a.key === "donor_rainier")!;
const image = { mime: "image/jpeg", bytes_base64: Buffer.from("tiny image bytes").toString("base64") };

function setup() {
  const createDraftFromImage = vi.fn(async () => ok(eligibleCard));
  return { createDraftFromImage, POST: createDraftsHandler({ createDraftFromImage }) };
}

beforeEach(useSessionEnv);
afterEach(() => {
  process.env = { ...SAVED };
});

async function body(res: Response) {
  return (await res.json()) as { ok: boolean; data?: unknown; error?: { code: string } };
}

describe("authorization", () => {
  it("rejects a request with no session cookie", async () => {
    const { POST, createDraftFromImage } = setup();
    const res = await POST(jsonRequest(URL_, { image }));
    expect(res.status).toBe(403);
    expect((await body(res)).error?.code).toBe("NOT_AUTHORIZED");
    expect(createDraftFromImage).not.toHaveBeenCalled();
  });

  it("rejects a tampered cookie", async () => {
    const { POST, createDraftFromImage } = setup();
    const cookie = (await cookieFor("donor_rainier")) + "x";
    expect((await POST(jsonRequest(URL_, { image }, cookie))).status).toBe(403);
    expect(createDraftFromImage).not.toHaveBeenCalled();
  });

  it.each(["operator", "courier_a", "recipient_eastlake"])("rejects the %s role", async (key) => {
    const { POST, createDraftFromImage } = setup();
    const res = await POST(jsonRequest(URL_, { image }, await cookieFor(key)));
    expect(res.status).toBe(403);
    expect(createDraftFromImage).not.toHaveBeenCalled();
  });
});

describe("body validation", () => {
  it.each([
    ["not JSON", "{nope"],
    ["empty body", ""],
    ["empty object", {}],
    ["image and fixture_id together", { image, fixture_id: "pasta_tray" }],
    ["an unknown top-level key", { image, extra: 1 }],
    ["an actor in the body (never trusted)", { image, actor: { role: "donor", id: donor.actor_id } }],
    ["a source in the body", { image, source: "messaging" }],
    ["an unknown image key", { image: { ...image, note: "x" } }],
    ["a non-string mime", { image: { mime: 5, bytes_base64: "AAAA" } }],
    ["an unknown fixture id", { fixture_id: "steak" }],
    ["a path in fixture_id", { fixture_id: "../../.env" }],
    ["a fixture id with extension", { fixture_id: "pasta_tray.jpg" }],
    ["an oversized body", { image: { mime: "image/jpeg", bytes_base64: "A".repeat(3_100_000) } }],
  ])("rejects %s with VALIDATION_FAILED and never calls the service", async (_label, payload) => {
    const { POST, createDraftFromImage } = setup();
    const res = await POST(jsonRequest(URL_, payload, await cookieFor("donor_rainier")));
    expect(res.status).toBe(400);
    expect((await body(res)).error?.code).toBe("VALIDATION_FAILED");
    expect(createDraftFromImage).not.toHaveBeenCalled();
  });
});

describe("content-length is checked before the body is read", () => {
  it("rejects a declared oversize body without reading it", async () => {
    const { POST, createDraftFromImage } = setup();
    const req = jsonRequest(URL_, { image }, await cookieFor("donor_rainier"));
    const text = vi.spyOn(req, "text");
    req.headers.set("content-length", "3100000");
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await body(res)).error?.code).toBe("VALIDATION_FAILED");
    expect(text).not.toHaveBeenCalled();
    expect(createDraftFromImage).not.toHaveBeenCalled();
  });
});

describe("success paths", () => {
  it("web upload: calls the service with the session actor and source web_upload", async () => {
    const { POST, createDraftFromImage } = setup();
    const res = await POST(jsonRequest(URL_, { image }, await cookieFor("donor_rainier")));
    expect(res.status).toBe(200);
    expect(await body(res)).toMatchObject({ ok: true, data: { id: eligibleCard.id } });
    expect(createDraftFromImage).toHaveBeenCalledWith({
      actor: { role: "donor", id: donor.actor_id },
      image,
      source: "web_upload",
    });
  });

  it("fixture: loads the checked-in file and uses source fixture", async () => {
    const { POST, createDraftFromImage } = setup();
    const res = await POST(jsonRequest(URL_, { fixture_id: "sandwich_platter" }, await cookieFor("donor_rainier")));
    expect(res.status).toBe(200);
    const expected = readFileSync(join(process.cwd(), "fixtures/intake/images/sandwich_platter.jpg")).toString("base64");
    expect(createDraftFromImage).toHaveBeenCalledWith({
      actor: { role: "donor", id: donor.actor_id },
      image: { mime: "image/jpeg", bytes_base64: expected },
      source: "fixture",
    });
  });
});

describe("error mapping (CONTRACTS §3.15)", () => {
  it.each<[ErrorCode, number]>([
    ["VALIDATION_FAILED", 400],
    ["NOT_AUTHORIZED", 403],
    ["NOT_FOUND", 404],
    ["INVALID_TRANSITION", 409],
    ["NOT_IMPLEMENTED", 501],
    ["INTERNAL", 500],
  ])("service %s -> HTTP %i", async (code, status) => {
    const POST = createDraftsHandler({ createDraftFromImage: async () => err(code, "from service") });
    const res = await POST(jsonRequest(URL_, { image }, await cookieFor("donor_rainier")));
    expect(res.status).toBe(status);
    expect((await body(res)).error?.code).toBe(code);
  });
});

describe("fixture_id is a demo feature (review: it triggers paid calls with a real key)", () => {
  const fixture = { fixture_id: "sandwich_platter" };
  const post = async (env: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    const { POST, createDraftFromImage } = setup();
    const res = await POST(jsonRequest(URL_, fixture, await cookieFor("donor_rainier")));
    return { res, createDraftFromImage };
  };

  it("is refused with a real provider and demo mode off, and never reaches the service", async () => {
    const { res, createDraftFromImage } = await post({ VISION_PROVIDER: "gemini", ANNONA_DEMO_MODE: undefined });
    expect(res.status).toBe(404);
    expect((await body(res)).error?.code).toBe("NOT_FOUND");
    expect(createDraftFromImage).not.toHaveBeenCalled();
  });

  it("is allowed with a real provider when demo mode is explicitly on", async () => {
    const { res, createDraftFromImage } = await post({ VISION_PROVIDER: "gemini", ANNONA_DEMO_MODE: "1" });
    expect(res.status).toBe(200);
    expect(createDraftFromImage).toHaveBeenCalledTimes(1);
  });

  it("is allowed with the fake provider even when demo mode is off (no paid call possible)", async () => {
    const { res } = await post({ VISION_PROVIDER: "fake", ANNONA_DEMO_MODE: undefined });
    expect(res.status).toBe(200);
  });

  it("does not affect a normal web upload with a real provider and demo mode off", async () => {
    process.env.VISION_PROVIDER = "gemini";
    delete process.env.ANNONA_DEMO_MODE;
    const { POST, createDraftFromImage } = setup();
    const res = await POST(jsonRequest(URL_, { image }, await cookieFor("donor_rainier")));
    expect(res.status).toBe(200);
    expect(createDraftFromImage).toHaveBeenCalledTimes(1);
  });
});

describe("a non-donor never triggers a vision call (real service wiring)", () => {
  it.each(["operator", "courier_a", "recipient_eastlake"])("%s", async (key) => {
    const { createIntakeService } = await import("@/features/intake/service");
    const { createCoreDouble } = await import("./doubles/core");
    const analyzeFoodImage = vi.fn(async () => err("PROVIDER_UNAVAILABLE", "unused"));
    const d = createCoreDouble();
    const service = createIntakeService({ core: d.core, vision: { mode: "real", model: "m", status: "ok", analyzeFoodImage } });
    const POST = createDraftsHandler({ createDraftFromImage: (input, deps) => service.createDraftFromImage(input, deps) });
    const res = await POST(jsonRequest(URL_, { image }, await cookieFor(key)));
    expect(res.status).toBe(403);
    expect(analyzeFoodImage).not.toHaveBeenCalled();
    expect(d.core.storeDonationImage).not.toHaveBeenCalled();
  });
});
