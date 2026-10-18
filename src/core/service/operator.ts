import { and, eq, inArray, isNull } from "drizzle-orm";
import { OPERATOR_ACTIONS, VerifiedFacts, err, ok, type Actor, type Deps, type DonationCard, type EligibilityDecision, type OperatorAction, type Result } from "@/contracts";
import { donations, offers } from "@/db/schema";
import { evaluateEligibility } from "../eligibility";
import { writeAudit } from "./audit";
import { buildCard } from "./cards";
import { LIVE_OFFER_STATUSES, activePolicy, checkTransition, loadDonor, revokeLiveLinks } from "./lifecycle";
import { isUuid, type DonationRow } from "./map";
import { runtime } from "./runtime";

// Slice 2(c): operator actions (CONTRACTS section 4.1 S-11 cancel, S-12 reject, S-13 return_to_donor, S-14 / S-18
// retry_matching). Operator only. There is no "approve" or "dispatch anyway": an operator can never turn a review or
// reject reason into eligible; only retry_matching from unmatched can, and only when the gate re-run now says eligible.

export const MAX_NOTE_CHARS = 500;

type Plan = { to: DonationRow["status"]; trigger: "operatorCancel" | "operatorReject" | "returnToDonor" | "retryMatching"; decision?: EligibilityDecision };

export async function operatorAction(
  input: { actor: Actor; donation_id: string; action: OperatorAction; note: string },
  deps?: Deps,
): Promise<Result<DonationCard>> {
  const { actor, donation_id, action, note } = input ?? ({} as typeof input);
  if (actor?.role !== "operator") return err("NOT_AUTHORIZED", "Only an operator can do this.");
  if (!OPERATOR_ACTIONS.includes(action)) return err("VALIDATION_FAILED", `action must be one of ${OPERATOR_ACTIONS.join(", ")}.`);
  if (typeof note !== "string" || note.length > MAX_NOTE_CHARS) return err("VALIDATION_FAILED", `note must be text of at most ${MAX_NOTE_CHARS} characters.`);
  if (!isUuid(donation_id)) return err("NOT_FOUND", "Donation not found.");

  const { db, clock } = await runtime(deps);
  return db.transaction(async (tx): Promise<Result<DonationCard>> => {
    const [row] = await tx.select().from(donations).where(eq(donations.id, donation_id)).for("no key update");
    if (!row) return err("NOT_FOUND", "Donation not found.");
    const now = clock.now();

    let plan: Plan;
    if (action === "reject") plan = { to: "rejected", trigger: "operatorReject" };
    else if (action === "return_to_donor") plan = { to: "draft", trigger: "returnToDonor" };
    else if (action === "cancel") plan = { to: "canceled", trigger: "operatorCancel" };
    else {
      // retry_matching re-runs the gate now on the stored facts: eligible is S-14, anything else is S-18.
      if (row.status !== "unmatched") return err("INVALID_TRANSITION", "Retry matching is only for an unmatched donation.");
      const facts = VerifiedFacts.safeParse(row.verified_facts);
      const [donor, policy] = await Promise.all([loadDonor(tx, row.donor_id), activePolicy(tx)]);
      if (!facts.success || !donor || !policy) return err("INTERNAL", "The stored facts, donor or policy could not be read.");
      let decision;
      try {
        decision = evaluateEligibility({ facts: facts.data, donor, policy, now });
      } catch {
        return err("INTERNAL", "The eligibility check could not run.");
      }
      plan = { to: decision.outcome, trigger: "retryMatching", decision };
    }

    const check = checkTransition(row, plan.to, plan.trigger, now, {
      actor_role: "operator",
      note,
      ...(plan.decision ? { gate_outcome: plan.decision.outcome } : {}),
    });
    if (!check.ok) return err("INVALID_TRANSITION", check.message);

    const [updated] = await tx
      .update(donations)
      .set({ status: plan.to, version: row.version + 1, updated_at: now, ...(plan.decision ? { latest_decision: plan.decision } : {}) })
      .where(and(eq(donations.id, row.id), eq(donations.status, row.status), eq(donations.version, row.version)))
      .returning();
    if (!updated) return err("CONFLICT", "The donation changed; please reload.", { retryable: true });

    if (action === "cancel") {
      // S-11: live offers end, an active assignment ends (history kept), live links are revoked.
      await tx
        .update(offers)
        .set({ status: "canceled", close_reason: "donation_canceled", responded_at: now })
        .where(and(eq(offers.donation_id, row.id), inArray(offers.status, [...LIVE_OFFER_STATUSES])));
      await tx
        .update(offers)
        .set({ close_reason: "donation_canceled" })
        .where(and(eq(offers.donation_id, row.id), eq(offers.status, "accepted"), isNull(offers.close_reason)));
    }
    if (action === "cancel" || action === "reject") await revokeLiveLinks(tx, { donation_id: row.id }, now);

    // The note is free text, so it never goes into the audit trail (CONTRACTS section 3.11); only its length does.
    const data = { action, from: row.status, to: plan.to, transition: check.transition, note_length: note.trim().length };
    await writeAudit(tx, { at: now, type: "operator.action", actor, donation_id: row.id, data });
    if (action === "cancel") await writeAudit(tx, { at: now, type: "donation.canceled", actor, donation_id: row.id, data: { from: row.status } });
    if (plan.decision) {
      const d = plan.decision;
      await writeAudit(tx, {
        at: now,
        type: "eligibility.evaluated",
        actor: { role: "system", id: null },
        donation_id: row.id,
        data: { outcome: d.outcome, reason_codes: d.reasons.map((r) => r.code), policy_version: d.policy_version },
      });
    }
    return ok(await buildCard(tx, updated, "operator"));
  });
}
