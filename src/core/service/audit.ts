import type { Actor, AuditEvent, ProviderMode } from "@/contracts";
import { audit_events } from "@/db/schema";
import type { Q } from "./runtime";

// Append-only audit trail (CONTRACTS section 3.11). `data` never contains a full handle, message text, address_line,
// pickup_instructions or a verification token. The guard below turns a mistake into a thrown error instead of a leak.

const FORBIDDEN_DATA_KEYS = new Set([
  "handle",
  "sender_handle",
  "text",
  "payload",
  "address_line",
  "pickup_instructions",
  "token",
  "raw_token",
  "token_hash",
]);

export type AuditInput = {
  at: Date;
  type: AuditEvent["type"];
  actor: Actor;
  donation_id?: string | null;
  offer_id?: string | null;
  mode?: { vision?: ProviderMode; messaging?: ProviderMode };
  data?: Record<string, unknown>;
};

function assertNoForbiddenKeys(value: unknown, path: string): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoForbiddenKeys(v, `${path}[${i}]`));
    return;
  }
  for (const [k, v] of Object.entries(value)) {
    if (FORBIDDEN_DATA_KEYS.has(k)) throw new Error(`audit data must not contain '${k}' (CONTRACTS section 3.11) at ${path}`);
    assertNoForbiddenKeys(v, `${path}.${k}`);
  }
}

export async function writeAudit(q: Q, e: AuditInput): Promise<void> {
  const data = e.data ?? {};
  assertNoForbiddenKeys(data, "data");
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
