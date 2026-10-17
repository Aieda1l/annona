import type { Actor, AuditEvent, ProviderMode } from "@/contracts";
import { audit_events } from "@/db/schema";
import type { Q } from "./runtime";

// Append-only audit trail (CONTRACTS section 3.11). `data` never contains a full handle, message text, address_line,
// pickup_instructions or a verification token. The guard below turns a mistake into a thrown error instead of a leak:
// it refuses suspicious key names (any spelling or case, at any depth) and suspicious string values.

const BANNED_KEY_PARTS = ["handle", "address", "instruction", "token", "phone", "email", "sender", "body", "payload", "password", "secret"];
const BANNED_KEYS = new Set(["text", "message", "url", "content"]);
/** The one key the contract allows to mention a handle: the masked form (last 4 characters). */
const ALLOWED_KEYS = new Set(["handlemasked"]);

const normalize = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");
const keyForbidden = (key: string) => {
  const n = normalize(key);
  if (ALLOWED_KEYS.has(n)) return false;
  return BANNED_KEYS.has(n) || BANNED_KEY_PARTS.some((part) => n.includes(part));
};

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const TIMESTAMP = /\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?(?:\.\d+)?/g;
/** Long strings, anything with an @, and long digit runs (phone numbers) are not audit material; ids and timestamps are. */
const valueSuspicious = (value: string) => {
  if (value.length > 128 || value.includes("@")) return true;
  const rest = value.replace(UUID, "").replace(TIMESTAMP, "").replace(/[\s().+-]/g, "");
  return /\d{7,}/.test(rest);
};

export type AuditInput = {
  at: Date;
  type: AuditEvent["type"];
  actor: Actor;
  donation_id?: string | null;
  offer_id?: string | null;
  mode?: { vision?: ProviderMode; messaging?: ProviderMode };
  data?: Record<string, unknown>;
};

function assertClean(value: unknown, path: string): void {
  if (typeof value === "string") {
    if (valueSuspicious(value)) throw new Error(`audit data must not hold a handle, free text or a long number (CONTRACTS section 3.11) at ${path}`);
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertClean(v, `${path}[${i}]`));
    return;
  }
  for (const [k, v] of Object.entries(value)) {
    if (keyForbidden(k)) throw new Error(`audit data must not contain '${k}' (CONTRACTS section 3.11) at ${path}`);
    assertClean(v, `${path}.${k}`);
  }
}

export async function writeAudit(q: Q, e: AuditInput): Promise<void> {
  const data = e.data ?? {};
  assertClean(data, "data");
  await q.insert(audit_events).values({
    at: e.at,
    donation_id: e.donation_id ?? null,
    offer_id: e.offer_id ?? null,
    type: e.type,
    actor_role: e.actor.role,
    actor_id: e.actor.id,
    mode: e.mode ?? {},
    data,
  });
}

/** System actor for effects no person triggered (tick, expiry, provider events). */
export const SYSTEM_ACTOR: Actor = { role: "system", id: null };
