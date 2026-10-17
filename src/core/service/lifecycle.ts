import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  REASON_CODE_SEVERITY,
  type EligibilityDecision,
  type PolicyConfig,
  type ReasonCode,
  type VerifiedFacts,
} from "@/contracts";
import { couriers, donations, donors, messaging_identities, offers, policy_config, recipients, verification_links } from "@/db/schema";
import { canTransition, type TransitionContext, type TransitionTrigger } from "../state";
import { courierFromRow, donorFromRow, isoOrNull, policyFromRow, recipientFromRow, type DonationRow } from "./map";
import type { Q } from "./runtime";

// Shared pieces of the donation/offer lifecycle (CONTRACTS section 4). Every caller holds the donation row lock
// (SELECT ... FOR UPDATE) before using these, which keeps the lock order fixed: donation, then recipient.

export const LIVE_OFFER_STATUSES = ["pending_send", "open"] as const;

/** The context the pure state guards read, built from a donation row and the injected clock's time. */
export function transitionCtx(row: DonationRow, now: Date, extra: Partial<TransitionContext> = {}): TransitionContext {
  const facts = row.verified_facts as VerifiedFacts | null;
  return {
    now,
    effective_cutoff_at: isoOrNull(row.effective_cutoff_at),
    donor_pickup_by: facts?.donor_pickup_by ?? null,
    discard_by: facts?.discard_by ?? null,
    collected_at: isoOrNull(row.collected_at),
    ...extra,
  };
}

export const checkTransition = (row: DonationRow, to: DonationRow["status"], trigger: TransitionTrigger, now: Date, extra: Partial<TransitionContext> = {}) =>
  canTransition({ from: row.status as never, to: to as never, trigger, ctx: transitionCtx(row, now, extra) });

/** A decision with one more reason (for example a dispatch reason such as NO_ELIGIBLE_MATCH), keeping what it already had. */
export function decisionWithReason(
  base: EligibilityDecision | null,
  code: ReasonCode,
  message: string,
  now: Date,
  policy: Pick<PolicyConfig, "policy_id" | "policy_version">,
  outcome?: EligibilityDecision["outcome"],
): EligibilityDecision {
  return {
    outcome: outcome ?? base?.outcome ?? "eligible",
    reasons: [...(base?.reasons ?? []).filter((r) => r.code !== code), { code, severity: REASON_CODE_SEVERITY[code], message }],
    field_states: base?.field_states ?? {},
    policy_id: base?.policy_id ?? policy.policy_id,
    policy_version: base?.policy_version ?? policy.policy_version,
    evaluated_at: now.toISOString(),
  };
}

export async function activePolicy(q: Q): Promise<PolicyConfig | null> {
  const [row] = await q.select().from(policy_config).where(eq(policy_config.active, true));
  return row ? policyFromRow(row) : null;
}

export async function liveOfferCount(q: Q, donation_id: string): Promise<number> {
  const rows = await q
    .select({ id: offers.id })
    .from(offers)
    .where(and(eq(offers.donation_id, donation_id), inArray(offers.status, [...LIVE_OFFER_STATUSES])));
  return rows.length;
}

/**
 * S-06: an offered donation whose offers have all ended returns to eligible, so the next tick dispatches the next
 * wave. Returns true when it did. At or after the cutoff nothing happens here: S-08 expires the donation instead.
 */
export async function releaseIfIdle(q: Q, row: DonationRow, now: Date): Promise<boolean> {
  if (row.status !== "offered") return false;
  const live = await liveOfferCount(q, row.id);
  const check = checkTransition(row, "eligible", "expireDue", now, { live_offer_count: live });
  if (!check.ok) return false;
  const updated = await q
    .update(donations)
    .set({ status: "eligible", version: row.version + 1, updated_at: now })
    .where(and(eq(donations.id, row.id), eq(donations.status, "offered"), eq(donations.version, row.version)))
    .returning({ id: donations.id });
  return updated.length === 1;
}

/** Revokes every live verification link of a donation (S-08, S-11, a donor's STOP). */
export async function revokeLiveLinks(q: Q, where: { donation_id?: string; donor_id?: string }, now: Date): Promise<void> {
  const target = where.donation_id ? eq(verification_links.donation_id, where.donation_id) : where.donor_id ? eq(verification_links.donor_id, where.donor_id) : sql`false`;
  await q.update(verification_links).set({ revoked_at: now }).where(and(target, isNull(verification_links.consumed_at), isNull(verification_links.revoked_at)));
}

/** Everything the pure matcher needs about people and places, read inside the caller's transaction. */
export async function loadMatchWorld(q: Q) {
  const [recipientRows, courierRows, identityRows] = await Promise.all([
    q.select().from(recipients),
    q.select().from(couriers),
    q.select().from(messaging_identities),
  ]);
  return {
    recipients: recipientRows.map(recipientFromRow),
    couriers: courierRows.map(courierFromRow),
    identities: identityRows.map((i) => ({
      actor_role: i.actor_role as "donor" | "courier",
      actor_id: i.actor_id,
      status: i.status as "awaiting_join" | "joined" | "opted_out",
      provider: i.provider as "photon" | "fake",
    })),
  };
}

export async function loadDonor(q: Q, donor_id: string) {
  const [row] = await q.select().from(donors).where(eq(donors.id, donor_id));
  return row ? donorFromRow(row) : null;
}

/**
 * M-09: couriers with a live offer on any donation, or an active assignment (accepted offer without a close_reason) on a
 * claimed or collected donation. The unique index covers only the first half.
 */
export async function busyCourierIds(q: Q): Promise<string[]> {
  const live = await q.select({ id: offers.courier_id }).from(offers).where(inArray(offers.status, [...LIVE_OFFER_STATUSES]));
  const assigned = await q
    .select({ id: offers.courier_id })
    .from(offers)
    .innerJoin(donations, eq(offers.donation_id, donations.id))
    .where(and(eq(offers.status, "accepted"), isNull(offers.close_reason), inArray(donations.status, ["claimed", "collected"])));
  return [...new Set([...live, ...assigned].map((r) => r.id))];
}

/**
 * M-04: servings already promised per recipient = the sum over donations that are claimed, collected or delivered,
 * counted through their active accepted offer. Derived every time, never decremented.
 */
export async function committedServings(q: Q): Promise<Record<string, number>> {
  const rows = await q
    .select({ recipient_id: offers.recipient_id, servings: sql<number>`coalesce((${donations.verified_facts}->>'servings')::int, 0)` })
    .from(offers)
    .innerJoin(donations, eq(offers.donation_id, donations.id))
    .where(and(eq(offers.status, "accepted"), isNull(offers.close_reason), inArray(donations.status, ["claimed", "collected", "delivered"])));
  const out: Record<string, number> = {};
  for (const r of rows) out[r.recipient_id] = (out[r.recipient_id] ?? 0) + Number(r.servings);
  return out;
}

