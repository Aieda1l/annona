import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { err, ok, type Deps, type Result, type VerificationLinkView, type VerifiedFacts, type VisionSuggestion, type EligibilityDecision } from "@/contracts";
import { donation_images, donations, donors, messaging_identities, verification_links } from "@/db/schema";
import { SYSTEM_ACTOR, writeAudit } from "./audit";
import { isUuid, isoOrNull } from "./map";
import { runtime, type Q } from "./runtime";

// Slice 2(d): verification links (CONTRACTS section 3.16, 8.4; D-031). The raw token exists only in the return value
// of issueVerificationLink and so in the donor's text message. The links table, the audit trail and logs see only its
// SHA-256. The stored copy of the message keeps just the token's last 4 characters unless the provider is the fake one
// (see recordOutboundMessage); in fake mode the simulated phone needs the whole text. Opening a link never consumes it;
// only a successful submitVerification does (see ./intake).

export const LINK_TTL_MS = 30 * 60_000;
/**
 * At most this many links (live, used or revoked, resubmit links included) exist for one donation when
 * issueVerificationLink is called. Each call revokes the previous live link, so without a cap a repeated caller could
 * keep invalidating a donor's link.
 */
export const LINK_ISSUE_CAP = 10;
/** Every refusal looks the same to the caller (section 8.4 rule 6); the reason goes only to the audit event. */
export const LINK_REFUSED = "This link has expired or was already used. Text the photo again for a new link.";

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;
export const OPEN_STATUSES = new Set(["draft", "needs_review"]);

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const isTokenShaped = (token: unknown): token is string => typeof token === "string" && TOKEN_SHAPE.test(token);

export type LinkRefusal = "malformed" | "unknown" | "consumed" | "revoked" | "expired" | "donation_closed" | "donation_mismatch";

/**
 * Logs why a link was refused (section 8.4 rule 6). Only ids and the reason: never the token or its hash.
 * Only a refusal that matches a real link is recorded: the routes are unauthenticated, so a malformed or unknown token
 * (nothing to correlate it with) must not be able to grow the audit trail.
 */
export async function auditLinkRefusal(q: Q, now: Date, reason: LinkRefusal, link?: { id: string; donation_id: string }): Promise<void> {
  if (!link) return;
  await writeAudit(q, { at: now, type: "link.rejected", actor: SYSTEM_ACTOR, donation_id: link.donation_id, data: { reason, link_id: link.id } });
}

/**
 * Issues a fresh link inside the caller's transaction (the caller holds the donation row lock). The previous live link
 * is revoked first, so the one-live-link index always holds. expires_at = min(now + 30 min, stored cutoff).
 */
export async function issueLinkTx(q: Q, donation: { id: string; donor_id: string; effective_cutoff_at: Date | null }, now: Date) {
  const cutoff = donation.effective_cutoff_at?.getTime() ?? Number.POSITIVE_INFINITY;
  const expires = new Date(Math.min(now.getTime() + LINK_TTL_MS, cutoff));
  await q
    .update(verification_links)
    .set({ revoked_at: now })
    .where(and(eq(verification_links.donation_id, donation.id), isNull(verification_links.consumed_at), isNull(verification_links.revoked_at)));
  const token = randomBytes(32).toString("base64url");
  const [row] = await q
    .insert(verification_links)
    .values({ donation_id: donation.id, donor_id: donation.donor_id, token_hash: hashToken(token), issued_at: now, expires_at: expires })
    .returning({ id: verification_links.id });
  await writeAudit(q, { at: now, type: "link.issued", actor: SYSTEM_ACTOR, donation_id: donation.id, data: { link_id: row!.id } });
  return { link_id: row!.id, token, expires_at: expires.toISOString() };
}

/**
 * Called by Dev 3 after a donor's photo became a draft. The donation must be open for verification (draft or
 * needs_review, not collected, before its cutoff) and the donor must have a joined messaging identity.
 */
export async function issueVerificationLink(input: { donation_id: string }, deps?: Deps): Promise<Result<{ link_id: string; token: string; expires_at: string }>> {
  if (!isUuid(input?.donation_id)) return err("NOT_FOUND", "Donation not found.");
  const { db, clock } = await runtime(deps);
  return db.transaction(async (tx): Promise<Result<{ link_id: string; token: string; expires_at: string }>> => {
    const [row] = await tx.select().from(donations).where(eq(donations.id, input.donation_id)).for("no key update");
    if (!row) return err("NOT_FOUND", "Donation not found.");
    const now = clock.now();
    if (!OPEN_STATUSES.has(row.status) || row.collected_at !== null) return err("INVALID_TRANSITION", "This donation is not open for verification.");
    if (row.effective_cutoff_at !== null && row.effective_cutoff_at.getTime() <= now.getTime()) return err("INVALID_TRANSITION", "The pickup cutoff has passed.");
    const [identity] = await tx
      .select({ id: messaging_identities.id })
      .from(messaging_identities)
      .where(and(eq(messaging_identities.actor_role, "donor"), eq(messaging_identities.actor_id, row.donor_id), eq(messaging_identities.status, "joined")));
    if (!identity) return err("CONFLICT", "The donor has not joined messaging.", { details: { reason: "donor_not_joined" } });
    // Only a donor who may still create drafts (S-01: approved or pending) gets a new link.
    const [donor] = await tx.select({ status: donors.approval_status }).from(donors).where(eq(donors.id, row.donor_id));
    if (!donor || (donor.status !== "approved" && donor.status !== "pending")) return err("CONFLICT", "This donor cannot receive a verification link.", { details: { reason: "donor_not_allowed" } });
    const [{ n } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(verification_links).where(eq(verification_links.donation_id, row.id));
    if (Number(n) >= LINK_ISSUE_CAP) return err("CONFLICT", "Too many links have been issued for this donation.", { details: { reason: "link_cap_reached" } });
    return ok(await issueLinkTx(tx, row, now));
  });
}

type Resolved = { link: typeof verification_links.$inferSelect; donation: typeof donations.$inferSelect };

/** Read-only lookup shared by view and image: every check of section 8.4 rule 3, refusals audited. */
async function resolveLink(token: unknown, deps?: Deps): Promise<{ ok: true; value: Resolved; db: Q } | { ok: false }> {
  const { db, clock } = await runtime(deps);
  const now = clock.now();
  if (!isTokenShaped(token)) {
    await auditLinkRefusal(db, now, "malformed");
    return { ok: false };
  }
  const [link] = await db.select().from(verification_links).where(eq(verification_links.token_hash, hashToken(token)));
  const reason: LinkRefusal | null = !link
    ? "unknown"
    : link.consumed_at
      ? "consumed"
      : link.revoked_at
        ? "revoked"
        : link.expires_at.getTime() <= now.getTime()
          ? "expired"
          : null;
  if (reason) {
    await auditLinkRefusal(db, now, reason, link);
    return { ok: false };
  }
  const [donation] = await db.select().from(donations).where(eq(donations.id, link!.donation_id));
  if (!donation || !OPEN_STATUSES.has(donation.status) || donation.collected_at !== null) {
    await auditLinkRefusal(db, now, "donation_closed", link);
    return { ok: false };
  }
  return { ok: true, value: { link: link!, donation }, db };
}

/** The checklist page's data. Never a handle, address, offer, courier, recipient or timeline (section 3.16). */
export async function buildLinkView(q: Q, donation: typeof donations.$inferSelect, link_expires_at: Date, resubmit_token: string | null): Promise<VerificationLinkView> {
  const [donor] = await q.select({ name: donors.display_name }).from(donors).where(eq(donors.id, donation.donor_id));
  return {
    donation_id: donation.id,
    donor_display_name: donor?.name ?? "",
    status: donation.status as VerificationLinkView["status"],
    ai_status: donation.ai_status as VerificationLinkView["ai_status"],
    ai_suggestion: (donation.ai_suggestion as VisionSuggestion | null) ?? null,
    verified_facts: (donation.verified_facts as VerifiedFacts | null) ?? null,
    decision: (donation.latest_decision as EligibilityDecision | null) ?? null,
    link_expires_at: isoOrNull(link_expires_at)!,
    resubmit_token,
    is_synthetic: true,
  };
}

export async function getVerificationLinkView(input: { token: string }, deps?: Deps): Promise<Result<VerificationLinkView>> {
  const r = await resolveLink(input?.token, deps);
  if (!r.ok) return err("NOT_AUTHORIZED", LINK_REFUSED);
  return ok(await buildLinkView(r.db, r.value.donation, r.value.link.expires_at, null));
}

export async function getVerificationLinkImage(input: { token: string }, deps?: Deps): Promise<Result<{ mime: string; bytes: Uint8Array }>> {
  const r = await resolveLink(input?.token, deps);
  if (!r.ok) return err("NOT_AUTHORIZED", LINK_REFUSED);
  if (!r.value.donation.image_id) return err("NOT_FOUND", "This donation has no photo.");
  const [image] = await r.db.select().from(donation_images).where(eq(donation_images.id, r.value.donation.image_id));
  if (!image) return err("NOT_FOUND", "This donation has no photo.");
  return ok({ mime: image.mime, bytes: image.bytes });
}

/**
 * Consumes a link for one donation inside the caller's transaction (section 8.4 rule 4): exactly one row, or null.
 * The caller must roll the transaction back if anything after this fails, so a failed submit leaves the link live.
 */
export async function consumeLinkTx(q: Q, token: string, donation_id: string, now: Date): Promise<typeof verification_links.$inferSelect | null> {
  const [row] = await q
    .update(verification_links)
    .set({ consumed_at: now })
    .where(
      and(
        eq(verification_links.token_hash, hashToken(token)),
        eq(verification_links.donation_id, donation_id),
        isNull(verification_links.consumed_at),
        isNull(verification_links.revoked_at),
        gt(verification_links.expires_at, now),
      ),
    )
    .returning();
  return row ?? null;
}

/** Why consumeLinkTx found nothing, for the audit event only. */
export async function consumeRefusal(q: Q, token: string, donation_id: string, now: Date): Promise<{ reason: LinkRefusal; link?: { id: string; donation_id: string } }> {
  const [link] = await q.select().from(verification_links).where(eq(verification_links.token_hash, hashToken(token)));
  if (!link) return { reason: "unknown" };
  const reason: LinkRefusal =
    link.donation_id !== donation_id ? "donation_mismatch" : link.consumed_at ? "consumed" : link.revoked_at ? "revoked" : link.expires_at.getTime() <= now.getTime() ? "expired" : "unknown";
  return { reason, link };
}
