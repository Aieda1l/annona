import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { ActorRole, SessionRequestBody, err, ok, DEMO_ACTORS, findDemoActor, type Actor } from "@/contracts";
import { getEnv } from "./env";
import { toResponse } from "./http";

// D-013: HMAC-signed httpOnly cookie { role, actor_id }. CONTRACTS §9.0, §10, §11.
// A session cookie only identifies a synthetic demo persona; it never carries a handle.

const COOKIE_NAME = "annona_session";
const MAX_AGE_SECONDS = 12 * 60 * 60;
const NOT_AUTHORIZED = "Not authorized.";

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx > 0 && part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}

function isSecure(request: Request): boolean {
  return new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}

function cookieHeader(value: string, maxAge: number, secure: boolean): string {
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

/** Verifies the signed cookie. Null on a missing, malformed or tampered cookie, or an unknown actor. */
export async function getActor(request: Request): Promise<Actor | null> {
  const secret = getEnv().session_secret;
  if (!secret) return null;
  const raw = readCookie(request, COOKIE_NAME);
  if (!raw) return null;
  const dot = raw.indexOf(".");
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  if (!safeEqual(raw.slice(dot + 1), sign(payload, secret))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { role?: unknown; actor_id?: unknown };
    const role = ActorRole.safeParse(parsed.role);
    if (!role.success || typeof parsed.actor_id !== "string") return null;
    const demo = findDemoActor(parsed.actor_id);
    if (!demo || demo.role !== role.data) return null;
    return { role: demo.role, id: demo.actor_id };
  } catch {
    return null;
  }
}

/** POST /api/session: strict body, timing-safe passcode compare, fails closed when secrets are unset. */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return toResponse(err("VALIDATION_FAILED", "Request body must be JSON."));
  }
  const parsed = SessionRequestBody.safeParse(body);
  if (!parsed.success) return toResponse(err("VALIDATION_FAILED", "Body must be { actor_id, passcode }."));

  const { session_secret, demo_passcode } = getEnv();
  if (!session_secret || !demo_passcode) return toResponse(err("NOT_AUTHORIZED", NOT_AUTHORIZED));

  const demo = findDemoActor(parsed.data.actor_id);
  const passcodeOk = safeEqual(parsed.data.passcode, demo_passcode);
  if (!demo || !passcodeOk) return toResponse(err("NOT_AUTHORIZED", NOT_AUTHORIZED));

  const payload = Buffer.from(JSON.stringify({ role: demo.role, actor_id: demo.actor_id })).toString("base64url");
  const value = `${payload}.${sign(payload, session_secret)}`;
  return toResponse(ok({ actor: { role: demo.role, id: demo.actor_id } }), {
    headers: { "set-cookie": cookieHeader(value, MAX_AGE_SECONDS, isSecure(request)) },
  });
}

/** DELETE /api/session: clears the cookie. */
export async function DELETE(request: Request): Promise<Response> {
  return toResponse(ok({ cleared: true }), { headers: { "set-cookie": cookieHeader("", 0, isSecure(request)) } });
}

/** GET /api/session/actors: demo mode only. Lists DEMO_ACTORS (no handles). */
export async function GET_ACTORS(_request: Request): Promise<Response> {
  if (!getEnv().demo_mode) return toResponse(err("NOT_AUTHORIZED", NOT_AUTHORIZED));
  return toResponse(
    ok({ actors: DEMO_ACTORS.map((a) => ({ role: a.role, actor_id: a.actor_id, display_name: a.display_name })) }),
  );
}
