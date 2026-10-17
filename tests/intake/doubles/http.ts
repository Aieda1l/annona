import { DEMO_ACTORS } from "@/contracts";
import { POST as login } from "@/server/session";

// Real session path: sign in as a DEMO_ACTORS persona and reuse the signed cookie (CONTRACTS §9.0, §11).
export const PASSCODE = "test-passcode-not-a-secret";

export function useSessionEnv() {
  process.env.SESSION_SECRET = "test-session-secret-0123456789abcdef";
  process.env.DEMO_PASSCODE = PASSCODE;
  process.env.ANNONA_DEMO_MODE = "1";
}

export async function cookieFor(key: string): Promise<string> {
  const actor = DEMO_ACTORS.find((a) => a.key === key);
  if (!actor) throw new Error(`no demo actor ${key}`);
  const res = await login(
    new Request("http://localhost/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actor_id: actor.actor_id, passcode: PASSCODE }),
    }),
  );
  return res.headers.get("set-cookie")!.split(";")[0]!;
}

export function jsonRequest(url: string, body: unknown, cookie?: string): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
