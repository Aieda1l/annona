import { and, eq } from "drizzle-orm";
import { err, ok, type Actor, type Deps, type DonationCard, type HandoffStep, type Result } from "@/contracts";
import { donations, donors, offers } from "@/db/schema";
import { writeAudit } from "./audit";
import { buildCard } from "./cards";
import { checkTransition } from "./lifecycle";
import { isUuid } from "./map";
import { runtime, type Q } from "./runtime";

// Slice 2(c): simulated handoff (CONTRACTS section 4.1 S-09, S-10; section 11). There is no real pickup or delivery in
// the prototype: every handoff is `simulated: true` and labeled so in the UI.

const NO = "You can't record this handoff.";

/**
 * A courier or recipient is told the new status and the handoff times, nothing else: the contract has no courier or
 * recipient projection of DonationCard, so the strict schema is filled with neutral values. No photo, AI guess,
 * verified facts, eligibility decision, offers or timeline (they are not part of that person's job).
 */
function partyCard(card: DonationCard): DonationCard {
  return {
    ...card,
    image_url: null,
    ai_suggestion: null,
    verified_facts: null,
    edited_from_ai: [],
    decision: null,
    active_offers: [],
    offer_history: [],
    timeline: [],
  };
}

/**
 * collected: the claiming courier or an operator, S-09 (now < effective cutoff, donor still approved).
 * delivered: the assigned recipient or an operator, S-10 (now < discard_by when set).
 * A repeated step by someone who may record it succeeds without writing again (a lost response is not a failure).
 * A non-operator gets the reduced card (partyCard) and cannot tell a missing donation from one that is not theirs.
 */
export async function recordHandoff(
  input: { actor: Actor; donation_id: string; step: HandoffStep; simulated: true },
  deps?: Deps,
): Promise<Result<DonationCard>> {
  const { actor, donation_id, step } = input ?? ({} as typeof input);
  if (!actor || !["courier", "recipient", "operator"].includes(actor.role)) return err("NOT_AUTHORIZED", NO);
  if (step !== "collected" && step !== "delivered") return err("VALIDATION_FAILED", "step must be collected or delivered.");
  if (input.simulated !== true) return err("VALIDATION_FAILED", "Handoffs are simulated in this prototype.");
  if (!isUuid(donation_id)) return err("NOT_FOUND", "Donation not found.");

  const { db, clock } = await runtime(deps);
  return db.transaction(async (tx): Promise<Result<DonationCard>> => {
    const [row] = await tx.select().from(donations).where(eq(donations.id, donation_id)).for("no key update");
    // A stranger gets the same answer for a missing donation and for one that is not theirs (no id probing).
    if (!row) return actor.role === "operator" ? err("NOT_FOUND", "Donation not found.") : err("NOT_AUTHORIZED", NO);
    const [assignment] = row.claimed_offer_id ? await tx.select().from(offers).where(eq(offers.id, row.claimed_offer_id)) : [];

    // Who may record which step (section 11). Checked before the state, so a stranger learns nothing about the donation.
    const to = step === "collected" ? "collected" : "delivered";
    const assignmentLive = assignment !== undefined && assignment.status === "accepted" && assignment.close_reason === null;
    // The same party may repeat the step once it is recorded; the assignment stays the live accepted offer.
    const allowed =
      actor.role === "operator" ||
      (assignmentLive &&
        actor.id !== null &&
        ((step === "collected" && actor.role === "courier" && actor.id === assignment.courier_id) ||
          (step === "delivered" && actor.role === "recipient" && actor.id === assignment.recipient_id)));
    if (!allowed) return err("NOT_AUTHORIZED", NO);

    // Idempotent: the donation is already in the state this step produces. Nothing is written or audited again.
    if (row.status === to) return ok(await cardFor(tx, row, actor));

    const now = clock.now();
    if (!row.verified_facts) return err("INTERNAL", "The donation has no verified facts.");
    const [donor] = await tx.select({ status: donors.approval_status }).from(donors).where(eq(donors.id, row.donor_id));
    const check = checkTransition(row, to, "recordHandoff", now, {
      simulated: true,
      donor_status: donor?.status as "approved" | "pending" | "suspended" | undefined,
    });
    if (!check.ok) return err("INVALID_TRANSITION", check.message);

    const from = step === "collected" ? "claimed" : "collected";
    const [updated] = await tx
      .update(donations)
      .set({ status: to, version: row.version + 1, updated_at: now, ...(step === "collected" ? { collected_at: now } : {}) })
      .where(and(eq(donations.id, row.id), eq(donations.status, from), eq(donations.version, row.version)))
      .returning();
    if (!updated) return err("CONFLICT", "The donation changed; please reload.", { retryable: true });

    await writeAudit(tx, {
      at: now,
      type: "handoff.recorded",
      actor,
      donation_id: row.id,
      offer_id: assignment?.id ?? null,
      mode: assignment ? { messaging: assignment.provider_mode as "real" | "fake" } : {},
      data: { step, simulated: true, transition: check.transition },
    });
    return ok(await cardFor(tx, updated, actor));
  });
}

async function cardFor(tx: Q, row: typeof donations.$inferSelect, actor: Actor): Promise<DonationCard> {
  return actor.role === "operator" ? buildCard(tx, row, "operator") : partyCard(await buildCard(tx, row, "donor"));
}
