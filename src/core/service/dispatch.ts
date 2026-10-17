import { randomInt } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import {
  ALLERGENS,
  SHORT_CODE_ALPHABET,
  VerifiedFacts,
  err,
  ok,
  type Deps,
  type EligibilityDecision,
  type Offer,
  type OfferMessageView,
  type Result,
  type MessagingIdentity,
} from "@/contracts";
import { donations, messaging_identities, offers, recipients } from "@/db/schema";
import { evaluateEligibility } from "../eligibility";
import { classifyUnmatched, findCandidates } from "../matching";
import { parseUtc } from "../time";
import { writeAudit, SYSTEM_ACTOR } from "./audit";
import {
  activePolicy,
  busyCourierIds,
  lockedPolicy,
  checkTransition,
  committedServings,
  decisionWithReason,
  loadDonor,
  loadMatchWorld,
  releaseIfIdle,
  revokeLiveLinks,
  LIVE_OFFER_STATUSES,
} from "./lifecycle";
import { identityFromRow, isUuid, offerFromRow } from "./map";
import { activeProvider, providerMode, retryOnConflict, runtime } from "./runtime";

// Slice 2(b), part 2: dispatch. createNextOffers (S-04, S-05, S-18), openOfferForSend, markOfferSendFailed,
// recordOfferProviderMessage, expireDue (S-06, S-08, S-16) and the lists tick() drives. Every step is a conditional
// update under the donation row lock, so tick is idempotent and safe to run concurrently (CONTRACTS section 7).

// Short codes are random, 4 characters from SHORT_CODE_ALPHABET, unique across all offers until resetDemo.
let codeRandom: (n: number) => number = (n) => randomInt(n);
/** Test hook: a deterministic source for short codes (pass null to restore the CSPRNG). */
export const __setShortCodeRandom = (fn: ((n: number) => number) | null) => {
  codeRandom = fn ?? ((n) => randomInt(n));
};
const makeShortCode = () => Array.from({ length: 4 }, () => SHORT_CODE_ALPHABET[codeRandom(SHORT_CODE_ALPHABET.length)]!).join("");

const SAFE_TOKEN = /^[A-Za-z0-9_.:-]{1,64}$/;
const MAX_CODE_ATTEMPTS = 12;

export async function listDispatchableDonations(deps?: Deps): Promise<{ donation_id: string }[]> {
  const { db } = await runtime(deps);
  const rows = await db.select({ id: donations.id }).from(donations).where(eq(donations.status, "eligible")).orderBy(asc(donations.created_at), asc(donations.id));
  return rows.map((r) => ({ donation_id: r.id }));
}

export async function listPendingSendOffers(deps?: Deps): Promise<Offer[]> {
  const { db } = await runtime(deps);
  const rows = await db.select().from(offers).where(eq(offers.status, "pending_send")).orderBy(asc(offers.created_at), sql`(${offers.candidate}->>'rank')::int`, asc(offers.id));
  return rows.map(offerFromRow);
}

export async function createNextOffers(input: { donation_id: string }, deps?: Deps): Promise<Result<Offer[]>> {
  if (!isUuid(input?.donation_id)) return err("NOT_FOUND", "Donation not found.");
  const { db, clock } = await runtime(deps);
  const provider = activeProvider(deps);
  return retryOnConflict(() => db.transaction(async (tx): Promise<Result<Offer[]>> => {
    const [row] = await tx.select().from(donations).where(eq(donations.id, input.donation_id)).for("no key update");
    if (!row) return err("NOT_FOUND", "Donation not found.");
    // S-04 is conditional on `eligible`: a donation that is already offered or has moved on is left alone.
    if (row.status !== "eligible") return err("INVALID_TRANSITION", `A ${row.status} donation cannot be offered.`);

    const now = clock.now();
    const facts = VerifiedFacts.safeParse(row.verified_facts);
    const donor = await loadDonor(tx, row.donor_id);
    // Dispatch rounds run one at a time (see lockedPolicy), so the busy and committed sets below are the committed truth.
    const policy = await lockedPolicy(tx);
    if (!facts.success || !donor || !policy) return err("INTERNAL", "The stored facts, donor or policy are missing.");

    // The gate re-runs with the current time. A result other than eligible applies S-18 and creates no offer.
    let decision: EligibilityDecision;
    try {
      decision = evaluateEligibility({ facts: facts.data, donor, policy, now });
    } catch {
      return err("INTERNAL", "The eligibility check could not run.");
    }
    if (decision.outcome !== "eligible") {
      const t = checkTransition(row, decision.outcome, "createNextOffers", now, { gate_outcome: decision.outcome });
      if (!t.ok) return err("INVALID_TRANSITION", t.message);
      await tx
        .update(donations)
        .set({ status: decision.outcome, version: row.version + 1, latest_decision: decision, updated_at: now })
        .where(and(eq(donations.id, row.id), eq(donations.status, "eligible"), eq(donations.version, row.version)));
      await writeAudit(tx, {
        at: now,
        type: "eligibility.evaluated",
        actor: SYSTEM_ACTOR,
        donation_id: row.id,
        data: { outcome: decision.outcome, reason_codes: decision.reasons.map((r) => r.code), policy_version: decision.policy_version, trigger: "createNextOffers" },
      });
      return ok([]);
    }

    const world = await loadMatchWorld(tx);
    const alreadyOffered = await tx.select({ courier_id: offers.courier_id }).from(offers).where(eq(offers.donation_id, row.id));
    const matchInput = {
      donation: { id: row.id, donor_location: { lat: donor.location.lat, lng: donor.location.lng } },
      facts: facts.data,
      recipients: world.recipients,
      couriers: world.couriers,
      identities: world.identities,
      policy,
      now,
      excluded_courier_ids: [...new Set(alreadyOffered.map((o) => o.courier_id))],
      busy_courier_ids: await busyCourierIds(tx),
      committed_servings: await committedServings(tx),
      active_provider: provider,
    };
    const candidates = findCandidates(matchInput);

    if (candidates.length === 0) {
      // S-05: nothing feasible. The reason says whether that is for want of anyone, or because everyone feasible was tried.
      const reason = classifyUnmatched(matchInput);
      const t = checkTransition(row, "unmatched", "createNextOffers", now, { gate_outcome: "eligible", candidate_count: 0 });
      if (!t.ok) return err("INVALID_TRANSITION", t.message);
      const message = reason === "CANDIDATES_EXHAUSTED" ? "Every courier who could do this pickup was already offered it." : "No approved recipient and courier can complete this pickup in time.";
      await tx
        .update(donations)
        .set({ status: "unmatched", version: row.version + 1, latest_decision: decisionWithReason(decision, reason, message, now, policy), updated_at: now })
        .where(and(eq(donations.id, row.id), eq(donations.status, "eligible"), eq(donations.version, row.version)));
      await writeAudit(tx, { at: now, type: "matching.unmatched", actor: SYSTEM_ACTOR, donation_id: row.id, data: { reason } });
      return ok([]);
    }

    const [{ wave } = { wave: 0 }] = await tx
      .select({ wave: offers.wave_no })
      .from(offers)
      .where(eq(offers.donation_id, row.id))
      .orderBy(desc(offers.wave_no))
      .limit(1);
    const wave_no = wave + 1;

    const created: Offer[] = [];
    const usedCouriers = new Set<string>();
    for (const cand of candidates) {
      if (created.length >= policy.offer_wave_size) break;
      if (usedCouriers.has(cand.courier_id)) continue;
      // ON CONFLICT DO NOTHING: another donation may have grabbed this courier (the live-offer index). Move to the next one.
      // A collision on the short code is retried with a fresh code for the same candidate.
      for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
        const short_code = makeShortCode();
        const [inserted] = await tx
          .insert(offers)
          .values({
            donation_id: row.id,
            recipient_id: cand.recipient_id,
            courier_id: cand.courier_id,
            short_code,
            status: "pending_send",
            wave_no,
            created_at: now,
            provider_mode: providerMode(provider),
            candidate: cand,
          })
          .onConflictDoNothing()
          .returning();
        if (inserted) {
          created.push(offerFromRow(inserted));
          usedCouriers.add(cand.courier_id);
          break;
        }
        const taken = await tx.select({ id: offers.id }).from(offers).where(eq(offers.short_code, short_code));
        if (taken.length === 0) break; // not the code: the courier is busy, try the next candidate
      }
    }

    // Nobody could be reserved this round (every courier was taken by a competing donation): stay eligible, try next tick.
    if (created.length === 0) return ok([]);

    const t = checkTransition(row, "offered", "createNextOffers", now, { gate_outcome: "eligible", candidate_count: created.length });
    if (!t.ok) return err("INVALID_TRANSITION", t.message);
    await tx
      .update(donations)
      .set({ status: "offered", version: row.version + 1, latest_decision: decision, updated_at: now })
      .where(and(eq(donations.id, row.id), eq(donations.status, "eligible"), eq(donations.version, row.version)));
    await writeAudit(tx, { at: now, type: "matching.completed", actor: SYSTEM_ACTOR, donation_id: row.id, data: { candidate_count: candidates.length, offers_created: created.length, wave_no } });
    for (const o of created) {
      await writeAudit(tx, { at: now, type: "offer.created", actor: SYSTEM_ACTOR, donation_id: row.id, offer_id: o.id, mode: { messaging: providerMode(provider) }, data: { wave_no, rank: o.candidate.rank } });
    }
    return ok(created);
  }));
}

export async function openOfferForSend(
  input: { offer_id: string },
  deps?: Deps,
): Promise<Result<{ offer: Offer; identity: MessagingIdentity; message_view: OfferMessageView }>> {
  if (!isUuid(input?.offer_id)) return err("NOT_FOUND", "Offer not found.");
  const { db, clock } = await runtime(deps);
  const provider = activeProvider(deps);
  return retryOnConflict(() => db.transaction(async (tx) => {
    const [peek] = await tx.select({ donation_id: offers.donation_id }).from(offers).where(eq(offers.id, input.offer_id));
    if (!peek) return err("NOT_FOUND", "Offer not found.");
    // Lock order: the donation first, then re-read the offer under the lock.
    const [row] = await tx.select().from(donations).where(eq(donations.id, peek.donation_id)).for("no key update");
    const [offer] = await tx.select().from(offers).where(eq(offers.id, input.offer_id));
    if (!row || !offer) return err("NOT_FOUND", "Offer not found.");
    // Conditional on pending_send: a second call (a retried tick) can never open or send an offer twice.
    if (offer.status !== "pending_send") return err("CONFLICT", "This offer is not waiting to be sent.", { details: { status: offer.status } });

    const now = clock.now();
    const facts = VerifiedFacts.safeParse(row.verified_facts);
    const policy = await activePolicy(tx);
    const donor = await loadDonor(tx, row.donor_id);
    const [recipient] = await tx.select().from(recipients).where(eq(recipients.id, offer.recipient_id));
    if (!facts.success || !policy || !donor || !recipient) return err("INTERNAL", "The stored facts, donor, recipient or policy are missing.");

    const closeOffer = async (status: "send_failed" | "canceled" | "expired", close_reason: string, auditType: "offer.send_failed" | "offer.expired") => {
      await tx.update(offers).set({ status, close_reason, responded_at: now }).where(and(eq(offers.id, offer.id), eq(offers.status, "pending_send")));
      await writeAudit(tx, { at: now, type: auditType, actor: SYSTEM_ACTOR, donation_id: row.id, offer_id: offer.id, mode: { messaging: offer.provider_mode as "real" | "fake" }, data: { reason: close_reason } });
    };

    if (row.status !== "offered") {
      await closeOffer("canceled", "donation_unavailable", "offer.expired");
      return err("INVALID_TRANSITION", "The donation is no longer offered.", { details: { reason: "donation_unavailable" } });
    }

    const [identityRow] = await tx
      .select()
      .from(messaging_identities)
      .where(and(eq(messaging_identities.actor_role, "courier"), eq(messaging_identities.actor_id, offer.courier_id), eq(messaging_identities.provider, provider)));
    if (!identityRow || identityRow.status !== "joined") {
      // A courier who has not joined (or has left) is never messaged: the offer fails and the next candidate is tried.
      await closeOffer("send_failed", "courier_not_joined", "offer.send_failed");
      await releaseIfIdle(tx, row, now);
      return err("CONFLICT", "The courier has not joined messaging.", { details: { reason: "courier_not_joined", offer_id: offer.id } });
    }

    // The effective cutoff is min(pickup, discard-by): if it has been reached (the sweeper has not run yet), nothing goes out.
    if (checkTransition(row, "expired", "expireDue", now).ok) {
      await closeOffer("expired", "cutoff_reached", "offer.expired");
      return err("CONFLICT", "The pickup cutoff has been reached.", { details: { reason: "cutoff_reached", offer_id: offer.id } });
    }

    // CONTRACTS section 3.8: min(sent_at + response window, donor_pickup_by - eta_to_pickup).
    const pickup = parseUtc(facts.data.donor_pickup_by);
    const deadlineMs = Math.min(now.getTime() + policy.response_window_seconds * 1000, pickup - offer.candidate.eta_to_pickup_minutes * 60_000);
    if (!Number.isFinite(deadlineMs) || deadlineMs <= now.getTime()) {
      await closeOffer("expired", "cutoff_reached", "offer.expired");
      await releaseIfIdle(tx, row, now);
      return err("CONFLICT", "There is no time left to send this offer.", { details: { reason: "no_time_left", offer_id: offer.id } });
    }

    const [opened] = await tx
      .update(offers)
      .set({ status: "open", sent_at: now, expires_at: new Date(deadlineMs) })
      .where(and(eq(offers.id, offer.id), eq(offers.status, "pending_send")))
      .returning();
    if (!opened) return err("CONFLICT", "This offer is not waiting to be sent.");
    await writeAudit(tx, { at: now, type: "offer.opened", actor: SYSTEM_ACTOR, donation_id: row.id, offer_id: offer.id, mode: { messaging: offer.provider_mode as "real" | "fake" }, data: { wave_no: offer.wave_no } });

    // The view carries no address, pickup instructions or handle: it is the only input to the offer text.
    const message_view: OfferMessageView = {
      short_code: offer.short_code,
      dish_name: facts.data.dish_name,
      servings: facts.data.servings,
      allergens_present: ALLERGENS.filter((a) => facts.data.allergens[a] === "present"),
      cross_contact_status: facts.data.cross_contact_status,
      cross_contact_allergens: facts.data.cross_contact_allergens,
      handling_mode: facts.data.handling_mode,
      recipient_display_name: recipient.display_name,
      pickup_area_label: donor.location.area_label,
      expires_at: opened.expires_at!.toISOString(),
      demo_mode: policy.demo_accelerated,
    };
    return ok({ offer: offerFromRow(opened), identity: identityFromRow(identityRow), message_view });
  }));
}

export async function markOfferSendFailed(input: { offer_id: string; reason: string }, deps?: Deps): Promise<Result<Offer>> {
  if (!isUuid(input?.offer_id)) return err("NOT_FOUND", "Offer not found.");
  const { db, clock } = await runtime(deps);
  return retryOnConflict(() => db.transaction(async (tx): Promise<Result<Offer>> => {
    const [peek] = await tx.select({ donation_id: offers.donation_id }).from(offers).where(eq(offers.id, input.offer_id));
    if (!peek) return err("NOT_FOUND", "Offer not found.");
    const [row] = await tx.select().from(donations).where(eq(donations.id, peek.donation_id)).for("no key update");
    const [offer] = await tx.select().from(offers).where(eq(offers.id, input.offer_id));
    if (!row || !offer) return err("NOT_FOUND", "Offer not found.");
    if (offer.status === "send_failed") return ok(offerFromRow(offer)); // idempotent
    // A late failure report for an offer the courier already answered changes nothing.
    if (offer.status !== "open") return err("INVALID_TRANSITION", `A ${offer.status} offer cannot be marked failed.`, { details: { status: offer.status } });

    const now = clock.now();
    const reason = typeof input.reason === "string" && SAFE_TOKEN.test(input.reason) ? input.reason : "provider_send_failed";
    const [failed] = await tx
      .update(offers)
      .set({ status: "send_failed", close_reason: "provider_send_failed", responded_at: now })
      .where(and(eq(offers.id, offer.id), eq(offers.status, "open")))
      .returning();
    if (!failed) return err("CONFLICT", "The offer changed while it was being marked failed.", { retryable: true });
    await writeAudit(tx, { at: now, type: "offer.send_failed", actor: SYSTEM_ACTOR, donation_id: row.id, offer_id: offer.id, mode: { messaging: offer.provider_mode as "real" | "fake" }, data: { reason } });
    await releaseIfIdle(tx, row, now); // S-06
    return ok(offerFromRow(failed));
  }));
}

export async function recordOfferProviderMessage(input: { offer_id: string; provider_message_id: string }, deps?: Deps): Promise<Result<Offer>> {
  if (!isUuid(input?.offer_id)) return err("NOT_FOUND", "Offer not found.");
  if (typeof input.provider_message_id !== "string" || !/^[\x21-\x7e]{1,128}$/.test(input.provider_message_id)) {
    return err("VALIDATION_FAILED", "A provider message id is 1 to 128 printable characters.");
  }
  const { db } = await runtime(deps);
  return db.transaction(async (tx): Promise<Result<Offer>> => {
    const [offer] = await tx.select().from(offers).where(eq(offers.id, input.offer_id)).for("update");
    if (!offer) return err("NOT_FOUND", "Offer not found.");
    if (offer.provider_message_id === input.provider_message_id) return ok(offerFromRow(offer));
    // The id is Photon's evidence for this offer; once set it is never replaced by a different one.
    if (offer.provider_message_id !== null) return err("CONFLICT", "This offer already has a different provider message id.");
    // One id, one offer: delivery events find their offer by this id.
    const taken = await tx.select({ id: offers.id }).from(offers).where(and(eq(offers.provider_message_id, input.provider_message_id), ne(offers.id, offer.id)));
    if (taken.length > 0) return err("CONFLICT", "That provider message id belongs to another offer.");
    const [updated] = await tx.update(offers).set({ provider_message_id: input.provider_message_id }).where(and(eq(offers.id, offer.id), isNull(offers.provider_message_id))).returning();
    return updated ? ok(offerFromRow(updated)) : err("CONFLICT", "The offer changed; please retry.", { retryable: true });
  });
}

/**
 * Sweeps everything that is due. Correctness never depends on this running (claim and decline check deadlines
 * themselves); it keeps things moving. Idempotent: a second call finds nothing to do.
 */
export async function expireDue(deps?: Deps): Promise<{ expired_offer_ids: string[]; expired_donation_ids: string[]; dispatchable_donation_ids: string[] }> {
  const { db, clock } = await runtime(deps);
  const expired_offer_ids: string[] = [];
  const expired_donation_ids: string[] = [];
  const dispatchable = new Set<string>();

  // A. Donations past their cutoff: S-08 (not yet claimed) and S-16 (claimed, never collected).
  const candidates = await db
    .select({ id: donations.id })
    .from(donations)
    .where(inArray(donations.status, ["eligible", "unmatched", "offered", "needs_review", "claimed"]));
  for (const { id } of candidates) {
    await db.transaction(async (tx) => {
      const [row] = await tx.select().from(donations).where(eq(donations.id, id)).for("no key update", { skipLocked: true });
      if (!row) return; // locked by a concurrent claim, decline or tick: leave it for the next sweep
      const now = clock.now();
      const to = "expired";
      const t = checkTransition(row, to, "expireDue", now);
      if (!t.ok) return;
      const policy = await activePolicy(tx);

      const live = await tx
        .select()
        .from(offers)
        .where(and(eq(offers.donation_id, row.id), inArray(offers.status, [...LIVE_OFFER_STATUSES])));
      for (const o of live) {
        const [gone] = await tx
          .update(offers)
          .set({ status: "expired", close_reason: "cutoff_reached", responded_at: now })
          .where(and(eq(offers.id, o.id), inArray(offers.status, [...LIVE_OFFER_STATUSES])))
          .returning({ id: offers.id });
        if (gone) {
          expired_offer_ids.push(o.id);
          await writeAudit(tx, { at: now, type: "offer.expired", actor: SYSTEM_ACTOR, donation_id: row.id, offer_id: o.id, mode: { messaging: o.provider_mode as "real" | "fake" }, data: { reason: "cutoff_reached" } });
        }
      }

      const wasClaimed = row.status === "claimed";
      if (wasClaimed) {
        // S-16: the courier never collected. The accepted offer stays as history with the reason.
        await tx
          .update(offers)
          .set({ close_reason: "pickup_not_collected" })
          .where(and(eq(offers.donation_id, row.id), eq(offers.status, "accepted"), isNull(offers.close_reason)));
      }
      const code = wasClaimed ? "PICKUP_NOT_COLLECTED" : "CUTOFF_REACHED";
      const message = wasClaimed ? "The courier did not collect the food before the cutoff." : "The pickup cutoff was reached.";
      const decision = policy ? decisionWithReason(row.latest_decision as EligibilityDecision | null, code, message, now, policy, row.latest_decision ? undefined : "rejected") : (row.latest_decision as EligibilityDecision | null);
      const updated = await tx
        .update(donations)
        .set({ status: "expired", version: row.version + 1, latest_decision: decision, updated_at: now })
        .where(and(eq(donations.id, row.id), eq(donations.status, row.status), eq(donations.version, row.version)))
        .returning({ id: donations.id });
      if (updated.length !== 1) return;
      await revokeLiveLinks(tx, { donation_id: row.id }, now);
      await writeAudit(tx, { at: now, type: "donation.expired", actor: SYSTEM_ACTOR, donation_id: row.id, data: { reason: code } });
      expired_donation_ids.push(row.id);
    });
  }

  // B. Offers whose response deadline passed: expire them, and release the donation if that was its last live offer (S-06).
  const due = await db
    .select({ id: offers.id, donation_id: offers.donation_id })
    .from(offers)
    .where(and(eq(offers.status, "open"), lte(offers.expires_at, clock.now())));
  for (const { id, donation_id } of due) {
    await db.transaction(async (tx) => {
      const [row] = await tx.select().from(donations).where(eq(donations.id, donation_id)).for("no key update", { skipLocked: true });
      if (!row) return;
      const now = clock.now();
      const [gone] = await tx
        .update(offers)
        .set({ status: "expired", close_reason: "offer_expired", responded_at: now })
        .where(and(eq(offers.id, id), eq(offers.status, "open"), lte(offers.expires_at, now)))
        .returning();
      if (!gone) return;
      expired_offer_ids.push(id);
      await writeAudit(tx, { at: now, type: "offer.expired", actor: SYSTEM_ACTOR, donation_id: row.id, offer_id: id, mode: { messaging: gone.provider_mode as "real" | "fake" }, data: { reason: "offer_expired" } });
      if (await releaseIfIdle(tx, row, now)) dispatchable.add(row.id);
    });
  }

  // C. Offered donations with no live offer left (a lazy expiry inside claim/decline, a STOP): back to eligible (S-06).
  const idle = await db.select({ id: donations.id }).from(donations).where(eq(donations.status, "offered"));
  for (const { id } of idle) {
    await db.transaction(async (tx) => {
      const [row] = await tx.select().from(donations).where(eq(donations.id, id)).for("no key update", { skipLocked: true });
      if (row && (await releaseIfIdle(tx, row, clock.now()))) dispatchable.add(row.id);
    });
  }

  return { expired_offer_ids, expired_donation_ids, dispatchable_donation_ids: [...dispatchable] };
}

