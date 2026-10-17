import { and, asc, eq, sql } from "drizzle-orm";
import { err, ok, type Deps, type MessagingIdentity, type Offer, type Result } from "@/contracts";
import { messaging_identities, offers } from "@/db/schema";
import { writeAudit } from "./audit";
import { identityFromRow, isUuid, offerFromRow } from "./map";
import { runtime } from "./runtime";

// Messaging identities (CONTRACTS section 3.1, 8, 11). These functions return the FULL handle (a MessagingIdentity) to
// server-side callers; a route must never send one to a client. Only the operator's IdentitySummary shows a masked handle. STOP handling (S-15, S-16, S-17) lives in ./opt-out.

const PROVIDERS = new Set(["photon", "fake"]);

/** Case-insensitive for email-style handles; phone numbers are digits, which lower-casing leaves alone. */
const normalizeHandle = (handle: string) => handle.trim().toLowerCase();

export async function resolveIdentityByHandle(provider: "photon" | "fake", handle: string, deps?: Deps): Promise<MessagingIdentity | null> {
  if (!PROVIDERS.has(provider) || typeof handle !== "string" || handle.trim() === "") return null;
  const { db } = await runtime(deps);
  const [row] = await db
    .select()
    .from(messaging_identities)
    .where(and(eq(messaging_identities.provider, provider), sql`lower(${messaging_identities.handle}) = ${normalizeHandle(handle)}`));
  return row ? identityFromRow(row) : null;
}

export async function getIdentity(identity_id: string, deps?: Deps): Promise<MessagingIdentity | null> {
  if (!isUuid(identity_id)) return null;
  const { db } = await runtime(deps);
  const [row] = await db.select().from(messaging_identities).where(eq(messaging_identities.id, identity_id));
  return row ? identityFromRow(row) : null;
}

/** JOIN (and re-JOIN after STOP) opts an identity in. Idempotent: a joined identity keeps its original joined_at. */
export async function joinIdentity(
  input: { identity_id: string; provider_space_id: string | null; provider_sender_id: string | null },
  deps?: Deps,
): Promise<Result<MessagingIdentity>> {
  if (!isUuid(input?.identity_id)) return err("NOT_FOUND", "Identity not found.");
  const { db, clock } = await runtime(deps);
  return db.transaction(async (tx): Promise<Result<MessagingIdentity>> => {
    const [row] = await tx.select().from(messaging_identities).where(eq(messaging_identities.id, input.identity_id)).for("update");
    if (!row) return err("NOT_FOUND", "Identity not found.");
    const now = clock.now();
    const space = input.provider_space_id ?? row.provider_space_id;
    const sender = input.provider_sender_id ?? row.provider_sender_id;

    if (row.status === "joined") {
      // A repeated JOIN may carry fresher provider ids, but it never resets joined_at or writes a second audit event.
      if (space === row.provider_space_id && sender === row.provider_sender_id) return ok(identityFromRow(row));
      const [updated] = await tx
        .update(messaging_identities)
        .set({ provider_space_id: space, provider_sender_id: sender })
        .where(eq(messaging_identities.id, row.id))
        .returning();
      return ok(identityFromRow(updated!));
    }

    const [joined] = await tx
      .update(messaging_identities)
      .set({ status: "joined", joined_at: now, opted_out_at: null, provider_space_id: space, provider_sender_id: sender })
      .where(and(eq(messaging_identities.id, row.id), eq(messaging_identities.status, row.status)))
      .returning();
    if (!joined) return err("CONFLICT", "The identity changed while joining; please retry.", { retryable: true });
    await writeAudit(tx, {
      at: now,
      type: "identity.joined",
      actor: { role: row.actor_role as "donor" | "courier", id: row.actor_id },
      mode: { messaging: row.provider === "photon" ? "real" : "fake" },
      data: { identity_id: row.id, actor_role: row.actor_role, rejoined: row.status === "opted_out" },
    });
    return ok(identityFromRow(joined));
  });
}

/** The courier's offers that can still be answered: open and not past their deadline. */
export async function findOpenOffersForCourier(courier_id: string, deps?: Deps): Promise<Offer[]> {
  if (!isUuid(courier_id)) return [];
  const { db, clock } = await runtime(deps);
  const now = clock.now();
  const rows = await db
    .select()
    .from(offers)
    .where(and(eq(offers.courier_id, courier_id), eq(offers.status, "open")))
    .orderBy(asc(offers.created_at), asc(offers.id));
  return rows.filter((r) => r.expires_at !== null && r.expires_at.getTime() > now.getTime()).map(offerFromRow);
}
