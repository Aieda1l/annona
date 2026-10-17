import { and, eq, inArray, sql } from "drizzle-orm";
import {
  SHORT_CODE_REGEX,
  VerifiedFacts,
  type Assignment,
  type ClaimCommand,
  type ClaimResult,
  type DeclineCommand,
  type DeclineResult,
  type Deps,
  type DonationStatus,
} from "@/contracts";
import { couriers, donations, donors, messaging_identities, offers, recipients } from "@/db/schema";
import { evaluateEligibility } from "../eligibility";
import { findCandidates } from "../matching";
import { writeAudit } from "./audit";
import {
  activePolicy,
  assignedCourierIds,
  checkTransition,
  committedServings,
  LIVE_OFFER_STATUSES,
  releaseIfIdle,
} from "./lifecycle";
import { courierFromRow, donorFromRow, isUuid, recipientFromRow, type DonationRow, type OfferRow } from "./map";
import { activeProvider, providerMode, retryOnConflict, runtime, type Q } from "./runtime";

// claimOffer and declineOffer: CONTRACTS section 8.1, steps 1-9 in this order. First valid claim wins. Every
// outcome is a result, never an error (200). The two answers for an unknown and a foreign offer carry no details about
// the offer (the contract keeps them distinct; a route must rate-limit short-code guessing).

/** A caller-supplied id that goes into the audit trail must be a plain token, never text or a handle. */
const plainToken = (v: unknown): string | null => (typeof v === "string" && /^[A-Za-z0-9_.:-]{1,64}$/.test(v) ? v : null);

const CLAIM_TEXT: Record<ClaimResult["code"], string> = {
  claimed: "Claimed. Thank you for taking this pickup.",
  already_claimed_by_you: "You already claimed this pickup.",
  already_claimed: "Another courier already claimed this pickup. No assignment was made.",
  offer_expired: "This offer has expired. No assignment was made.",
  offer_closed: "This offer is closed. No assignment was made.",
  donation_unavailable: "This donation is no longer available. No assignment was made.",
  not_authorized: "You can't answer this offer.",
  offer_not_found: "We couldn't find that offer.",
  ineligible: "This pickup can no longer be completed. No assignment was made.",
};

const DECLINE_TEXT: Record<DeclineResult["code"], string> = {
  declined: "Thanks for letting us know. We will offer it to someone else.",
  already_declined: "You already declined this offer.",
  offer_expired: "This offer has already expired.",
  offer_closed: "This offer is closed.",
  not_authorized: "You can't answer this offer.",
  offer_not_found: "We couldn't find that offer.",
};


type Shape = { offer_id: string | null; donation_id: string | null; donation_status: DonationStatus | null };
const NO_SHAPE: Shape = { offer_id: null, donation_id: null, donation_status: null };
const shapeOf = (offer: OfferRow, donation: DonationRow): Shape => ({ offer_id: offer.id, donation_id: donation.id, donation_status: donation.status as DonationStatus });

const claimResult = (code: ClaimResult["code"], shape: Shape, assignment: Assignment | null = null): ClaimResult => ({ code, ...shape, assignment, message_for_actor: CLAIM_TEXT[code] });
const declineResult = (code: DeclineResult["code"], shape: Shape): DeclineResult => ({ code, ...shape, assignment: null, message_for_actor: DECLINE_TEXT[code] });

/** The result shape after this transaction's own changes (a lazy expiry may have released the donation). */
async function freshShape(q: Q, offer: OfferRow, donation: DonationRow): Promise<Shape> {
  const [after] = await q.select().from(donations).where(eq(donations.id, donation.id));
  return shapeOf(offer, after ?? donation);
}

/** Step 1: a short_code resolves to exactly one offer of ANY status, because codes are never reused before resetDemo. */
async function resolveOffer(q: Q, ref: ClaimCommand["offer_ref"]): Promise<OfferRow | undefined> {
  if (ref && typeof ref === "object" && "offer_id" in ref && isUuid(ref.offer_id)) {
    return (await q.select().from(offers).where(eq(offers.id, ref.offer_id)))[0];
  }
  if (ref && typeof ref === "object" && "short_code" in ref && typeof ref.short_code === "string" && SHORT_CODE_REGEX.test(ref.short_code)) {
    return (await q.select().from(offers).where(eq(offers.short_code, ref.short_code)))[0];
  }
  return undefined;
}

const isActiveAssignment = (donation: DonationRow, offer: OfferRow) =>
  offer.status === "accepted" && offer.close_reason === null && donation.claimed_offer_id === offer.id && ["claimed", "collected"].includes(donation.status);

const isTheCourier = (actor: ClaimCommand["actor"], offer: OfferRow) => actor?.role === "courier" && typeof actor.id === "string" && actor.id === offer.courier_id;

async function buildAssignment(q: Q, donation: DonationRow, offer: OfferRow): Promise<Assignment | null> {
  const facts = VerifiedFacts.safeParse(donation.verified_facts);
  const [donor] = await q.select().from(donors).where(eq(donors.id, donation.donor_id));
  const [recipient] = await q.select().from(recipients).where(eq(recipients.id, offer.recipient_id));
  if (!facts.success || !donor || !recipient) return null;
  return {
    donation_id: donation.id,
    recipient: { display_name: recipient.display_name, address_line: recipient.location.address_line },
    pickup: { display_name: donor.display_name, address_line: donor.location.address_line, pickup_instructions: facts.data.pickup_instructions, donor_pickup_by: facts.data.donor_pickup_by },
  };
}

/** True when this offer's response deadline or the donation's cutoff has been reached (step 6). */
const timeIsUp = (donation: DonationRow, offer: OfferRow, now: Date) => {
  if (offer.expires_at !== null && now.getTime() >= offer.expires_at.getTime()) return true;
  return checkTransition(donation, "expired", "expireDue", now).ok; // cutoff reached (or unresolvable: counts as reached)
};

/** Marks a still-live offer expired and lets the donation go back to eligible when nothing else is live (S-06). */
async function expireOfferLazily(q: Q, donation: DonationRow, offer: OfferRow, now: Date, reason: string): Promise<void> {
  if (offer.status !== "open" && offer.status !== "pending_send") return;
  const [gone] = await q
    .update(offers)
    .set({ status: "expired", close_reason: reason, responded_at: now })
    .where(and(eq(offers.id, offer.id), inArray(offers.status, [...LIVE_OFFER_STATUSES])))
    .returning({ id: offers.id });
  if (!gone) return;
  await writeAudit(q, { at: now, type: "offer.expired", actor: { role: "system", id: null }, donation_id: donation.id, offer_id: offer.id, mode: { messaging: offer.provider_mode as "real" | "fake" }, data: { reason } });
  await releaseIfIdle(q, donation, now);
}

export async function claimOffer(command: ClaimCommand, deps?: Deps): Promise<ClaimResult> {
  const { db, clock } = await runtime(deps);
  const provider = activeProvider(deps);

  const attempt = () =>
    db.transaction(async (tx): Promise<ClaimResult> => {
      // 1. resolve, then authorize. Neither answer leaks anything about the offer.
      const peek = await resolveOffer(tx, command?.offer_ref);
      if (!peek) return claimResult("offer_not_found", NO_SHAPE);
      if (!isTheCourier(command.actor, peek)) return claimResult("not_authorized", NO_SHAPE);

      // 2. the donation lock serializes every claim, decline and expiry for it (then the recipient lock, always in this order).
      const [donation] = await tx.select().from(donations).where(eq(donations.id, peek.donation_id)).for("no key update");
      const [offer] = await tx.select().from(offers).where(eq(offers.id, peek.id));
      if (!donation || !offer) return claimResult("offer_not_found", NO_SHAPE);
      const shape = shapeOf(offer, donation);
      const now = clock.now();

      // 3. replay by the winner: idempotent, no writes.
      // Only an ACTIVE assignment is replayed: accepted, not closed (close_reason null) and the donation still claimed or collected.
      // An ended one (no-show expiry, cancel, delivered) falls through to donation_unavailable and discloses no address.
      if (isActiveAssignment(donation, offer)) {
        return claimResult("already_claimed_by_you", shape, await buildAssignment(tx, donation, offer));
      }
      // 4. somebody else holds the assignment.
      if (["claimed", "collected", "delivered"].includes(donation.status) && donation.claimed_offer_id !== offer.id) {
        return claimResult("already_claimed", shape);
      }
      // 5. only an offered donation can be claimed.
      if (donation.status !== "offered") return claimResult("donation_unavailable", shape);
      // 6. lazy expiry: a late claim loses even if no sweeper ever ran.
      if (timeIsUp(donation, offer, now)) {
        const cutoff = offer.expires_at === null || now.getTime() < offer.expires_at.getTime();
        await expireOfferLazily(tx, donation, offer, now, cutoff ? "cutoff_reached" : "offer_expired");
        return claimResult("offer_expired", await freshShape(tx, offer, donation));
      }
      // 7.
      if (offer.status !== "open") return claimResult("offer_closed", shape);

      // 8. lock the recipient, then re-check everything with current rows.
      const [recipient] = await tx.select().from(recipients).where(eq(recipients.id, offer.recipient_id)).for("no key update");
      const failed = await recheck(tx, donation, offer, recipient, provider, now);
      if (failed) {
        await tx.update(offers).set({ status: "canceled", close_reason: "recheck_failed", responded_at: now }).where(and(eq(offers.id, offer.id), eq(offers.status, "open")));
        await writeAudit(tx, { at: now, type: "claim.rejected", actor: command.actor, donation_id: donation.id, offer_id: offer.id, mode: { messaging: providerMode(provider) }, data: { code: "ineligible", reasons: failed } });
        await releaseIfIdle(tx, donation, now);
        const [after] = await tx.select().from(donations).where(eq(donations.id, donation.id));
        return claimResult("ineligible", shapeOf(offer, after ?? donation));
      }

      // 9. conditional updates that must each affect exactly one row.
      const accepted = await tx.update(offers).set({ status: "accepted", responded_at: now }).where(and(eq(offers.id, offer.id), eq(offers.status, "open"))).returning();
      const claimed = await tx
        .update(donations)
        .set({ status: "claimed", claimed_offer_id: offer.id, version: donation.version + 1, updated_at: now })
        .where(and(eq(donations.id, donation.id), eq(donations.status, "offered")))
        .returning();
      if (accepted.length !== 1 || claimed.length !== 1) throw new ClaimRaceError();

      const siblings = await tx
        .update(offers)
        .set({ status: "superseded", close_reason: "superseded_by_claim", responded_at: now })
        .where(and(eq(offers.donation_id, donation.id), inArray(offers.status, [...LIVE_OFFER_STATUSES]), sql`${offers.id} <> ${offer.id}`))
        .returning({ id: offers.id, provider_mode: offers.provider_mode });
      for (const s of siblings) {
        await writeAudit(tx, { at: now, type: "offer.superseded", actor: command.actor, donation_id: donation.id, offer_id: s.id, mode: { messaging: s.provider_mode as "real" | "fake" }, data: { by_offer_id: offer.id } });
      }
      await writeAudit(tx, { at: now, type: "claim.accepted", actor: command.actor, donation_id: donation.id, offer_id: offer.id, mode: { messaging: providerMode(provider) }, data: { source: command.source === "simulated_messaging" ? "simulated_messaging" : "messaging", source_event_id: plainToken(command.source_event_id) } });
      return claimResult("claimed", shapeOf(accepted[0]!, claimed[0]!), await buildAssignment(tx, claimed[0]!, accepted[0]!));
    });

  try {
    return await retryOnConflict(attempt);
  } catch (e) {
    // The partial unique index (one active assignment per donation) is the backstop: a violation means someone else won.
    if (isUniqueViolation(e) || e instanceof ClaimRaceError) return resolveAfterRace(command, deps);
    throw e;
  }
}

class ClaimRaceError extends Error {}
const isUniqueViolation = (e: unknown) => {
  const c = e as { code?: string; cause?: { code?: string } };
  return (c?.code ?? c?.cause?.code) === "23505";
};

/** After losing a race the transaction is gone; read the truth again and answer from it (already_claimed or by_you). */
async function resolveAfterRace(command: ClaimCommand, deps?: Deps): Promise<ClaimResult> {
  const { db } = await runtime(deps);
  const offer = await resolveOffer(db, command.offer_ref);
  if (!offer || !isTheCourier(command.actor, offer)) return claimResult("offer_not_found", NO_SHAPE);
  const [donation] = await db.select().from(donations).where(eq(donations.id, offer.donation_id));
  if (!donation) return claimResult("offer_not_found", NO_SHAPE);
  if (isActiveAssignment(donation, offer)) return claimResult("already_claimed_by_you", shapeOf(offer, donation), await buildAssignment(db, donation, offer));
  return claimResult(["claimed", "collected", "delivered"].includes(donation.status) ? "already_claimed" : "donation_unavailable", shapeOf(offer, donation));
}

/**
 * Step 8 re-check. Returns reason codes when the pickup can no longer be completed, else null. G-01..G-13 run again
 * with the current time; the recipient and courier approvals, M-04 capacity (committed servings read under the recipient
 * lock) and pair-level M-10 feasibility run with est_pickup = now + eta (the response window is already spent).
 */
async function recheck(tx: Q, donation: DonationRow, offer: OfferRow, recipient: typeof recipients.$inferSelect | undefined, provider: "photon" | "fake", now: Date): Promise<string[] | null> {
  const facts = VerifiedFacts.safeParse(donation.verified_facts);
  const [donorRow] = await tx.select().from(donors).where(eq(donors.id, donation.donor_id));
  const [courierRow] = await tx.select().from(couriers).where(eq(couriers.id, offer.courier_id));
  const policy = await activePolicy(tx);
  if (!facts.success || !donorRow || !recipient || !courierRow || !policy) return ["data_missing"];

  const donor = donorFromRow(donorRow);
  let decision;
  try {
    decision = evaluateEligibility({ facts: facts.data, donor, policy, now });
  } catch {
    return ["gate_error"];
  }
  if (decision.outcome !== "eligible") return decision.reasons.map((r) => r.code);

  // Only this courier's identities matter for the pair check; no need to read every table while holding the recipient lock.
  const identityRows = await tx.select().from(messaging_identities).where(and(eq(messaging_identities.actor_role, "courier"), eq(messaging_identities.actor_id, offer.courier_id)));
  const identities = identityRows.map((i) => ({ actor_role: i.actor_role as "courier", actor_id: i.actor_id, status: i.status as "awaiting_join" | "joined" | "opted_out", provider: i.provider as "photon" | "fake" }));
  const pair = findCandidates({
    donation: { id: donation.id, donor_location: { lat: donor.location.lat, lng: donor.location.lng } },
    facts: facts.data,
    recipients: [recipientFromRow(recipient)],
    couriers: [courierFromRow(courierRow)],
    identities,
    policy: { ...policy, response_window_seconds: 0 },
    now,
    excluded_courier_ids: [],
    busy_courier_ids: await assignedCourierIds(tx, donation.id),
    committed_servings: await committedServings(tx),
    active_provider: provider,
  }).filter((c) => c.recipient_id === offer.recipient_id && c.courier_id === offer.courier_id);
  return pair.length === 1 ? null : ["pair_not_feasible"];
}

export async function declineOffer(command: DeclineCommand, deps?: Deps): Promise<DeclineResult> {
  const { db, clock } = await runtime(deps);
  return retryOnConflict(() => db.transaction(async (tx): Promise<DeclineResult> => {
    const peek = await resolveOffer(tx, command?.offer_ref);
    if (!peek) return declineResult("offer_not_found", NO_SHAPE);
    if (!isTheCourier(command.actor, peek)) return declineResult("not_authorized", NO_SHAPE);

    const [donation] = await tx.select().from(donations).where(eq(donations.id, peek.donation_id)).for("no key update");
    const [offer] = await tx.select().from(offers).where(eq(offers.id, peek.id));
    if (!donation || !offer) return declineResult("offer_not_found", NO_SHAPE);
    const shape = shapeOf(offer, donation);
    const now = clock.now();

    if (offer.status === "declined") return declineResult("already_declined", shape);
    if (offer.status === "expired") return declineResult("offer_expired", shape);
    if (offer.status !== "open") return declineResult("offer_closed", shape);
    if (timeIsUp(donation, offer, now)) {
      const deadlineHit = offer.expires_at !== null && now.getTime() >= offer.expires_at.getTime();
      await expireOfferLazily(tx, donation, offer, now, deadlineHit ? "offer_expired" : "cutoff_reached");
      return declineResult("offer_expired", await freshShape(tx, offer, donation));
    }

    const [declined] = await tx.update(offers).set({ status: "declined", responded_at: now }).where(and(eq(offers.id, offer.id), eq(offers.status, "open"))).returning();
    if (!declined) return declineResult("offer_closed", shape);
    await writeAudit(tx, { at: now, type: "offer.declined", actor: command.actor, donation_id: donation.id, offer_id: offer.id, mode: { messaging: offer.provider_mode as "real" | "fake" }, data: { source: command.source } });
    await releaseIfIdle(tx, donation, now); // S-06 when this was the last open offer
    const [after] = await tx.select().from(donations).where(eq(donations.id, donation.id));
    return declineResult("declined", shapeOf(declined, after ?? donation));
  }));
}

