import type { Actor, AuditEvent, ProviderMode } from "@/contracts";
import { audit_events } from "@/db/schema";
import type { Q } from "./runtime";

// Append-only audit trail (CONTRACTS section 3.11). `data` never contains a full handle, message text, address_line,
// pickup_instructions or a verification token. The guard below is a tripwire, not a general leak guard: it refuses suspicious
// key names (any spelling or case, at any depth) and string values that look like a handle, a phone number or free text.
// It cannot know what a value means, so callers still choose what goes in `data`.

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
/**
 * A provider id such as `pho_msg_01m5512345678e7f6g5h4j3km2` (prefix_kind_ then 16-40 lowercase base32/hex characters).
 * Real Photon ids are random, so about 1 in 250 contains a 7-digit run that the phone-number rule below would refuse,
 * and a refused inbound id fails the same message forever (docs/requests/messaging-audit-provider-ids.md). A phone
 * number never has this shape: it has no letters and no underscores, and the body must hold at least one letter so
 * that a prefixed all-digit string (`pho_msg_14155551234567890`) is still refused.
 */
const PROVIDER_ID = /^[a-z]{2,6}_[a-z]{2,8}_(?=[0-9]*[a-z])[0-9a-z]{16,40}$/;

/** Long strings, anything with an @, and long digit runs (phone numbers) are not audit material; ids and timestamps are. */
const valueSuspicious = (value: string) => {
  if (value.length > 128 || value.includes("@")) return true;
  if (PROVIDER_ID.test(value)) return false;
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
