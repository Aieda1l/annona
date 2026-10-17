import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { err, ok, type Deps, type EligibilityDecision, type MessagingIdentity, type Result } from "@/contracts";
import { donations, messaging_identities, offers } from "@/db/schema";
import { writeAudit } from "./audit";
import { activePolicy, checkTransition, decisionWithReason, LIVE_OFFER_STATUSES, releaseIfIdle, revokeLiveLinks } from "./lifecycle";
import { identityFromRow } from "./map";
import { runtime } from "./runtime";

// STOP (CONTRACTS section 3.1 optOutIdentity, 4.1 S-15, S-16, S-17, 8.4 step 8): one transaction that opts the
// identity out and unwinds everything it held. A courier's open offers are canceled; an assignment is released (S-15),
// expired (S-16) or, once the food was collected, sent to the operator (S-17, never reassigned). A donor's STOP
// revokes that donor's live verification links.

export async function optOutIdentity(input: { identity_id: string }, deps?: Deps): Promise<Result<MessagingIdentity>> {
  const { db, clock } = await runtime(deps);
  return db.transaction(async (tx): Promise<Result<MessagingIdentity>> => {
    const [identity] = await tx.select().from(messaging_identities).where(eq(messaging_identities.id, input.identity_id)).for("update");
    if (!identity) return err("NOT_FOUND", "Identity not found.");
    const now = clock.now();
    const provider = identity.provider === "photon" ? ("real" as const) : ("fake" as const);
    const actor = { role: identity.actor_role as "courier" | "donor", id: identity.actor_id };

    // STOP is idempotent: a second one finds the identity already out, but still finishes any unwinding a crash left undone.
    let out = identity;
    if (identity.status !== "opted_out") {
      [out] = await tx.update(messaging_identities).set({ status: "opted_out", opted_out_at: now }).where(eq(messaging_identities.id, identity.id)).returning();
      await writeAudit(tx, { at: now, type: "identity.opted_out", actor, mode: { messaging: provider }, data: { identity_id: identity.id, actor_role: identity.actor_role } });
    }

    if (identity.actor_role === "donor") {
      await revokeLiveLinks(tx, { donor_id: identity.actor_id }, now);
      return ok(identityFromRow(out!));
    }
    if (identity.actor_role !== "courier") return ok(identityFromRow(out!));

    // Every donation this courier is tied to, locked in a fixed order so two STOPs and a claim cannot deadlock.
    const mine = await tx
      .select({ donation_id: offers.donation_id })
      .from(offers)
      .where(and(eq(offers.courier_id, identity.actor_id), or(inArray(offers.status, [...LIVE_OFFER_STATUSES]), and(eq(offers.status, "accepted"), isNull(offers.close_reason)))));
    const donationIds = [...new Set(mine.map((m) => m.donation_id))].sort();

    for (const donation_id of donationIds) {
      const [row] = await tx.select().from(donations).where(eq(donations.id, donation_id)).for("update");
      if (!row) continue;
      const policy = await activePolicy(tx);

      // Live offers: a STOP is a refusal. The donation can go to the next courier (S-06).
      const live = await tx
        .update(offers)
        .set({ status: "canceled", close_reason: "courier_opted_out", responded_at: now })
        .where(and(eq(offers.donation_id, donation_id), eq(offers.courier_id, identity.actor_id), inArray(offers.status, [...LIVE_OFFER_STATUSES])))
        .returning({ id: offers.id });
      for (const o of live) {
        await writeAudit(tx, { at: now, type: "offer.expired", actor, donation_id, offer_id: o.id, mode: { messaging: provider }, data: { reason: "courier_opted_out" } });
      }
      if (live.length > 0) await releaseIfIdle(tx, row, now);

      // An active assignment (accepted, no close_reason) on this donation.
      const [assignment] = await tx
        .select()
        .from(offers)
        .where(and(eq(offers.donation_id, donation_id), eq(offers.courier_id, identity.actor_id), eq(offers.status, "accepted"), isNull(offers.close_reason)))
        .orderBy(asc(offers.created_at));
      if (!assignment || row.claimed_offer_id !== assignment.id) continue;

      const base = row.latest_decision as EligibilityDecision | null;
      const fallbackPolicy = policy ?? { policy_id: base?.policy_id ?? "unknown", policy_version: base?.policy_version ?? "unknown" };

      if (row.collected_at !== null) {
        // S-17: the food is already with the courier. No reassignment; the operator follows up.
        const t = checkTransition(row, "needs_review", "optOutIdentity", now);
        if (!t.ok) continue;
        await tx.update(offers).set({ close_reason: "courier_opted_out" }).where(eq(offers.id, assignment.id));
        await tx
          .update(donations)
          .set({
            status: "needs_review",
            claimed_offer_id: null,
            version: row.version + 1,
            latest_decision: decisionWithReason(base, "COURIER_OPTED_OUT_AFTER_PICKUP", "The courier stopped messaging after collecting the food. An operator needs to follow up.", now, fallbackPolicy, "needs_review"),
            updated_at: now,
          })
          .where(and(eq(donations.id, row.id), eq(donations.version, row.version)));
        await writeAudit(tx, { at: now, type: "assignment.released", actor, donation_id, offer_id: assignment.id, mode: { messaging: provider }, data: { reason: "courier_opted_out_after_pickup" } });
        continue;
      }

      const release = checkTransition(row, "eligible", "optOutIdentity", now);
      if (release.ok) {
        // S-15: before the cutoff the assignment is released and the next tick offers the next courier. This courier stays excluded
        // because the closed accepted offer remains in the donation's history.
        await tx.update(offers).set({ close_reason: "courier_opted_out" }).where(eq(offers.id, assignment.id));
        await tx
          .update(donations)
          .set({
            status: "eligible",
            claimed_offer_id: null,
            version: row.version + 1,
            latest_decision: decisionWithReason(base, "COURIER_OPTED_OUT", "The assigned courier opted out; the pickup will be offered to someone else.", now, fallbackPolicy),
            updated_at: now,
          })
          .where(and(eq(donations.id, row.id), eq(donations.version, row.version)));
        await writeAudit(tx, { at: now, type: "assignment.released", actor, donation_id, offer_id: assignment.id, mode: { messaging: provider }, data: { reason: "courier_opted_out" } });
        continue;
      }

      // S-16: at or after the cutoff there is no time to reassign; the donation expires as a no-show.
      const expire = checkTransition(row, "expired", "optOutIdentity", now);
      if (expire.ok) {
        await tx.update(offers).set({ close_reason: "pickup_not_collected" }).where(eq(offers.id, assignment.id));
        await tx
          .update(donations)
          .set({
            status: "expired",
            version: row.version + 1,
            latest_decision: decisionWithReason(base, "PICKUP_NOT_COLLECTED", "The courier did not collect the food before the cutoff.", now, fallbackPolicy),
            updated_at: now,
          })
          .where(and(eq(donations.id, row.id), eq(donations.version, row.version)));
        await revokeLiveLinks(tx, { donation_id }, now);
        await writeAudit(tx, { at: now, type: "donation.expired", actor, donation_id, offer_id: assignment.id, mode: { messaging: provider }, data: { reason: "PICKUP_NOT_COLLECTED" } });
      }
    }
    return ok(identityFromRow(out!));
  });
}
