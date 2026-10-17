import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_ACTORS, eligibleCard, err, ok, scene1_eligible_facts, type ErrorCode } from "@/contracts";
import { createVerificationHandler } from "@/features/intake/http/verification";
import { createIntakeService } from "@/features/intake/service";
import { createFakeVisionProvider } from "@/lib/ai/fake";
import { createCoreDouble } from "./doubles/core";
import { cookieFor, jsonRequest, useSessionEnv } from "./doubles/http";

// POST /api/donations/:id/verification (CONTRACTS §10): owning donor, raw VerifiedFacts.
const SAVED = { ...process.env };
const ID = "00000000-0000-4000-8000-0000000000aa";
const URL_ = `http://localhost/api/donations/${ID}/verification`;
const donor = DEMO_ACTORS.find((a) => a.key === "donor_rainier")!;
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });

function setup() {
  const submitDonorVerification = vi.fn(async () => ok(eligibleCard));
  return { submitDonorVerification, POST: createVerificationHandler({ submitDonorVerification }) };
}

beforeEach(useSessionEnv);
afterEach(() => {
  process.env = { ...SAVED };
});

async function body(res: Response) {
  return (await res.json()) as { ok: boolean; data?: unknown; error?: { code: string } };
}

describe("authorization", () => {
  it("rejects a request with no session", async () => {
    const { POST, submitDonorVerification } = setup();
    const res = await POST(jsonRequest(URL_, scene1_eligible_facts), ctx());
    expect(res.status).toBe(403);
    expect(submitDonorVerification).not.toHaveBeenCalled();
  });

  it.each(["operator", "courier_a", "recipient_eastlake"])("rejects the %s role", async (key) => {
    const { POST, submitDonorVerification } = setup();
    const res = await POST(jsonRequest(URL_, scene1_eligible_facts, await cookieFor(key)), ctx());
    expect(res.status).toBe(403);
    expect(submitDonorVerification).not.toHaveBeenCalled();
  });
});

describe("request handling", () => {
  it.each([
    ["not JSON", "{nope"],
    ["empty body", ""],
    ["an oversized body", JSON.stringify({ ingredients_text: "x".repeat(70_000) })],
  ])("rejects %s with VALIDATION_FAILED", async (_label, payload) => {
    const { POST, submitDonorVerification } = setup();
    const res = await POST(jsonRequest(URL_, payload, await cookieFor("donor_rainier")), ctx());
    expect(res.status).toBe(400);
    expect((await body(res)).error?.code).toBe("VALIDATION_FAILED");
    expect(submitDonorVerification).not.toHaveBeenCalled();
  });

  it.each(["not-a-uuid", "../x", "1"])("rejects a malformed donation id %j", async (id) => {
    const { POST, submitDonorVerification } = setup();
    const res = await POST(jsonRequest(URL_, scene1_eligible_facts, await cookieFor("donor_rainier")), ctx(id));
    expect(res.status).toBe(400);
    expect(submitDonorVerification).not.toHaveBeenCalled();
  });

  it("passes the session actor, the path id and the raw body to the service, unmodified", async () => {
    const { POST, submitDonorVerification } = setup();
    const raw = { ...scene1_eligible_facts, unexpected_key: true }; // the service, not the handler, rejects it
    const res = await POST(jsonRequest(URL_, raw, await cookieFor("donor_rainier")), ctx());
    expect(res.status).toBe(200);
    expect(await body(res)).toMatchObject({ ok: true, data: { id: eligibleCard.id } });
    expect(submitDonorVerification).toHaveBeenCalledWith({
      actor: { role: "donor", id: donor.actor_id },
      donation_id: ID,
      raw,
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
  ])("service %s -> HTTP %i", async (code, status) => {
    const POST = createVerificationHandler({ submitDonorVerification: async () => err(code, "from service") });
    const res = await POST(jsonRequest(URL_, scene1_eligible_facts, await cookieFor("donor_rainier")), ctx());
    expect(res.status).toBe(status);
    expect((await body(res)).error?.code).toBe(code);
  });
});

describe("with the real intake service and the core double", () => {
  it("schema-invalid facts -> 400 and core is never called", async () => {
    const { core } = createCoreDouble();
    const service = createIntakeService({ core, vision: createFakeVisionProvider() });
    const POST = createVerificationHandler({ submitDonorVerification: service.submitDonorVerification });
    const bad: Record<string, unknown> = { ...scene1_eligible_facts };
    delete bad.allergens;
    const res = await POST(jsonRequest(URL_, bad, await cookieFor("donor_rainier")), ctx());
    expect(res.status).toBe(400);
    expect((await body(res)).error?.code).toBe("VALIDATION_FAILED");
    expect(core.submitVerification).not.toHaveBeenCalled();
  });
});
