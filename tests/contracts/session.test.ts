import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACTORS } from "@/contracts";
import { DELETE, GET_ACTORS, POST, getActor } from "@/server/session";

// T-CT-02 (baseline gate): the session works at baseline. CONTRACTS §9.0, §10, §11; D-024.

const PASSCODE = "test-passcode-not-a-secret";
const operator = DEMO_ACTORS.find((a) => a.role === "operator")!;
const SAVED = { ...process.env };

function post(body: unknown): Request {
  return new Request("http://localhost/api/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function cookieFrom(res: Response): string {
  const header = res.headers.get("set-cookie");
  expect(header).toBeTruthy();
  return header!.split(";")[0];
}

function withCookie(cookie: string): Request {
  return new Request("http://localhost/api/anything", { headers: { cookie } });
}

beforeEach(() => {
  process.env.SESSION_SECRET = "test-session-secret-0123456789abcdef";
  process.env.DEMO_PASSCODE = PASSCODE;
  process.env.ANNONA_DEMO_MODE = "1";
});

afterEach(() => {
  process.env = { ...SAVED };
});

describe("T-CT-02 session", () => {
  it("sets a signed httpOnly cookie for a DEMO_ACTORS id with the correct passcode", async () => {
    const res = await POST(post({ actor_id: operator.actor_id, passcode: PASSCODE }));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/httponly/i);
    expect(setCookie).toMatch(/samesite=lax/i);
    const actor = await getActor(withCookie(cookieFrom(res)));
    expect(actor).toEqual({ role: "operator", id: operator.actor_id });
  });

  it("returns NOT_AUTHORIZED for a wrong passcode", async () => {
    const res = await POST(post({ actor_id: operator.actor_id, passcode: "wrong" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("NOT_AUTHORIZED");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("returns NOT_AUTHORIZED for an unknown actor_id", async () => {
    const res = await POST(post({ actor_id: "11111111-1111-4111-8111-111111111111", passcode: PASSCODE }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("NOT_AUTHORIZED");
  });

  it("returns VALIDATION_FAILED for a body with extra keys", async () => {
    const res = await POST(post({ actor_id: operator.actor_id, passcode: PASSCODE, role: "operator" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_FAILED");
  });

  it("fails closed with NOT_AUTHORIZED when DEMO_PASSCODE or SESSION_SECRET is unset", async () => {
    delete process.env.DEMO_PASSCODE;
    const res = await POST(post({ actor_id: operator.actor_id, passcode: "" + PASSCODE }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("NOT_AUTHORIZED");
  });

  it("getActor returns null for a tampered cookie and for no cookie", async () => {
    const res = await POST(post({ actor_id: operator.actor_id, passcode: PASSCODE }));
    const cookie = cookieFrom(res);
    const [name, value] = cookie.split("=");
    const [payload, sig] = value.split(".");
    const forged = Buffer.from(JSON.stringify({ role: "operator", actor_id: DEMO_ACTORS[1].actor_id })).toString("base64url");
    expect(await getActor(withCookie(`${name}=${forged}.${sig}`))).toBeNull();
    expect(await getActor(withCookie(`${name}=${payload}.${sig.slice(0, -2)}xx`))).toBeNull();
    expect(await getActor(new Request("http://localhost/api/anything"))).toBeNull();
  });

  it("DELETE clears the cookie", async () => {
    const res = await DELETE(new Request("http://localhost/api/session", { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/max-age=0/i);
  });

  it("GET_ACTORS lists DEMO_ACTORS without handles in demo mode, and is forbidden otherwise", async () => {
    const res = await GET_ACTORS(new Request("http://localhost/api/session/actors"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.actors).toHaveLength(DEMO_ACTORS.length);
    expect(Object.keys(body.data.actors[0]).sort()).toEqual(["actor_id", "display_name", "role"]);
    delete process.env.ANNONA_DEMO_MODE;
    const off = await GET_ACTORS(new Request("http://localhost/api/session/actors"));
    expect(off.status).toBe(403);
  });
});
