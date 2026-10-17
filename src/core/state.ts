import { parseUtc } from "./time";
import type { ActorRole, DonationStatus, EligibilityOutcome, OfferStatus, ReasonCode } from "@/contracts";

// CONTRACTS §4.1 (S-01..S-18) and §4.2 as data plus pure guards. Dev 2 is the only writer of donations.status;
// persistence calls canTransition inside its transaction. Guards use the server Clock value `now` only.

export const TERMINAL_DONATION_STATUSES: readonly DonationStatus[] = ["delivered", "rejected", "canceled", "expired"];

export type TransitionTrigger =
  | "createDraft"
  | "attachAiResult"
  | "submitVerification"
  | "createNextOffers"
  | "expireDue"
  | "declineOffer"
  | "markOfferSendFailed"
  | "claimOffer"
  | "recordHandoff"
  | "operatorCancel"
  | "donorCancel"
  | "operatorReject"
  | "returnToDonor"
  | "retryMatching"
  | "optOutIdentity";

/** Everything a guard may read. `now` comes from the injected Clock; there is no client timestamp. */
export type TransitionContext = {
  now: Date;
  /** donations.effective_cutoff_at = min(donor_pickup_by, discard_by). Null or unparseable: see cutoffMs. */
  effective_cutoff_at: string | null;
  /** Used only to resolve a missing cutoff (CONTRACTS section 7, D-038); a null or unparseable discard_by is ignored there. */
  donor_pickup_by?: string | null;
  discard_by?: string | null;
  collected_at: string | null;
  simulated?: boolean;
  note?: string;
  /** Latest gate re-run on the stored facts with the current now. */
  gate_outcome?: EligibilityOutcome;
  candidate_count?: number;
  live_offer_count?: number;
  /** Donor approval right now (G-01 re-check at collection; S-01 actor check). */
  donor_status?: "approved" | "pending" | "suspended";
  actor_role?: ActorRole;
  /** Caller already verified session ownership or a consumed verification link. */
  authorized_owner?: boolean;
};

export type DonationTransition = {
  id: string;
  from: readonly (DonationStatus | null)[];
  to: readonly DonationStatus[];
  triggers: readonly TransitionTrigger[];
  /** Returns a failure message, or null when every guard holds. Unknown inputs fail closed. */
  guard: (c: TransitionContext, to: DonationStatus) => string | null;
  reason_codes?: readonly ReasonCode[];
};

const hasNote = (c: TransitionContext) => (c.note ?? "").trim().length > 0;
const collected = (c: TransitionContext) => c.collected_at !== null;
const nowMs = (c: TransitionContext) => c.now.getTime();
/**
 * The cutoff in ms, or NaN when none can be resolved (CONTRACTS section 7, D-038): the stored effective_cutoff_at,
 * else min(donor_pickup_by, discard_by) from the facts (a null or unparseable discard_by is ignored), else unknown.
 */
const cutoffMs = (c: TransitionContext): number => {
  const stored = c.effective_cutoff_at == null ? NaN : parseUtc(c.effective_cutoff_at);
  if (Number.isFinite(stored)) return stored;
  const pickup = c.donor_pickup_by == null ? NaN : parseUtc(c.donor_pickup_by);
  if (!Number.isFinite(pickup)) return NaN;
  const discard = c.discard_by == null ? NaN : parseUtc(c.discard_by);
  return Number.isFinite(discard) ? Math.min(pickup, discard) : pickup;
};
const nowValid = (c: TransitionContext) => Number.isFinite(nowMs(c));
/** An unknown cutoff counts as reached, so a missing cutoff can never keep a donation alive. An invalid clock is neither. */
const atOrAfterCutoff = (c: TransitionContext) => nowValid(c) && (!Number.isFinite(cutoffMs(c)) || nowMs(c) >= cutoffMs(c));
/** Strictly before a known cutoff. Unknown cutoff or invalid clock: false, so S-06, S-09, S-14 and S-15 refuse. */
const beforeCutoff = (c: TransitionContext) => nowValid(c) && Number.isFinite(cutoffMs(c)) && nowMs(c) < cutoffMs(c);
const ok = null;

export const DONATION_TRANSITIONS: readonly DonationTransition[] = [
  {
    id: "S-01",
    from: [null],
    to: ["draft"],
    triggers: ["createDraft"],
    guard: (c) =>
      c.actor_role === "donor" && (c.donor_status === "approved" || c.donor_status === "pending")
        ? ok
        : "Only an approved or pending donor can create a draft.",
  },
  { id: "S-02", from: ["draft"], to: ["draft"], triggers: ["attachAiResult"], guard: () => ok },
  {
    id: "S-03",
    from: ["draft", "needs_review"],
    to: ["eligible", "needs_review", "rejected"],
    triggers: ["submitVerification"],
    guard: (c, to) =>
      !c.authorized_owner
        ? "Verification must come from the owning donor or a valid link."
        : collected(c)
          ? "Food already collected; verification is closed."
          : c.gate_outcome !== to
            ? "The stored status must equal the gate outcome."
            : ok,
  },
  {
    id: "S-04",
    from: ["eligible"],
    to: ["offered"],
    triggers: ["createNextOffers"],
    guard: (c) =>
      c.gate_outcome !== "eligible" ? "The gate must re-run as eligible before offering." : (c.candidate_count ?? 0) < 1 ? "No feasible candidate." : ok,
  },
  {
    id: "S-05",
    from: ["eligible"],
    to: ["unmatched"],
    triggers: ["createNextOffers"],
    guard: (c) =>
      c.gate_outcome !== "eligible" ? "unmatched requires a current eligible gate outcome." : c.candidate_count !== 0 ? "A feasible candidate exists." : ok,
    reason_codes: ["NO_ELIGIBLE_MATCH", "CANDIDATES_EXHAUSTED"],
  },
  {
    id: "S-06",
    from: ["offered"],
    to: ["eligible"],
    triggers: ["expireDue", "declineOffer", "markOfferSendFailed"],
    guard: (c) => (c.live_offer_count !== 0 ? "Open or pending offers remain." : !beforeCutoff(c) ? "The cutoff has been reached." : ok),
  },
  { id: "S-07", from: ["offered"], to: ["claimed"], triggers: ["claimOffer"], guard: () => ok },
  {
    id: "S-08",
    from: ["eligible", "unmatched", "offered", "needs_review"],
    to: ["expired"],
    triggers: ["expireDue"],
    guard: (c) =>
      collected(c)
        ? "Food already collected; the operator must cancel or reject it."
        : atOrAfterCutoff(c)
          ? ok
          : "The cutoff has not been reached.",
    reason_codes: ["CUTOFF_REACHED"],
  },
  {
    id: "S-09",
    from: ["claimed"],
    to: ["collected"],
    triggers: ["recordHandoff"],
    guard: (c) =>
      c.simulated !== true
        ? "Handoff must be simulated."
        : !beforeCutoff(c)
          ? "The effective cutoff has been reached."
          : c.donor_status !== "approved"
            ? "The donor is no longer approved."
            : ok,
  },
  {
    id: "S-10",
    from: ["collected"],
    to: ["delivered"],
    triggers: ["recordHandoff"],
    guard: (c) => {
      if (c.simulated !== true) return "Handoff must be simulated.";
      // Only an explicit null means "no discard-by"; a missing or unparseable value refuses.
      if (c.discard_by === null) return Number.isFinite(nowMs(c)) ? ok : "Invalid server time.";
      if (c.discard_by === undefined || !(nowMs(c) < parseUtc(c.discard_by))) {
        return "The discard-by time has passed or is unknown; the operator must cancel.";
      }
      return ok;
    },
  },
  {
    id: "S-11",
    from: ["draft", "needs_review", "eligible", "unmatched", "offered", "claimed", "collected"],
    to: ["canceled"],
    triggers: ["operatorCancel", "donorCancel"],
    // Per-trigger rules live in canTransition (note requirement, donor cancel before claim only).
    guard: () => ok,
  },
  {
    id: "S-12",
    from: ["needs_review"],
    to: ["rejected"],
    triggers: ["operatorReject"],
    guard: (c) => (hasNote(c) ? ok : "A note is required."),
  },
  {
    id: "S-13",
    from: ["needs_review"],
    to: ["draft"],
    triggers: ["returnToDonor"],
    guard: (c) => (collected(c) ? "Food already collected; it can't go back to the donor." : ok),
  },
  {
    id: "S-14",
    from: ["unmatched"],
    to: ["eligible"],
    triggers: ["retryMatching"],
    guard: (c) => (!beforeCutoff(c) ? "The cutoff has been reached." : c.gate_outcome !== "eligible" ? "The gate must re-run as eligible." : ok),
  },
  {
    id: "S-15",
    from: ["claimed"],
    to: ["eligible"],
    triggers: ["optOutIdentity"],
    guard: (c) => (collected(c) ? "Already collected." : !beforeCutoff(c) ? "At or after the cutoff the donation expires instead." : ok),
    reason_codes: ["COURIER_OPTED_OUT"],
  },
  {
    id: "S-16",
    from: ["claimed"],
    to: ["expired"],
    triggers: ["expireDue", "optOutIdentity"],
    guard: (c) => (collected(c) ? "Already collected." : !atOrAfterCutoff(c) ? "The cutoff has not been reached." : ok),
    reason_codes: ["PICKUP_NOT_COLLECTED"],
  },
  {
    id: "S-17",
    from: ["collected"],
    to: ["needs_review"],
    triggers: ["optOutIdentity"],
    guard: (c) => (collected(c) ? ok : "No collection is recorded."),
    reason_codes: ["COURIER_OPTED_OUT_AFTER_PICKUP"],
  },
  {
    id: "S-18",
    from: ["eligible"],
    to: ["needs_review", "rejected"],
    triggers: ["createNextOffers"],
    guard: (c, to) => (c.gate_outcome === to ? ok : "The stored status must equal the non-eligible gate outcome."),
  },
  {
    id: "S-18",
    from: ["unmatched"],
    to: ["needs_review", "rejected"],
    triggers: ["retryMatching"],
    // retry_matching at or after the cutoff is INVALID_TRANSITION whatever the gate says (S-14).
    guard: (c, to) =>
      !beforeCutoff(c) ? "The cutoff has been reached." : c.gate_outcome === to ? ok : "The stored status must equal the non-eligible gate outcome.",
  },
];

export type TransitionCheck =
  | { ok: true; transition: string }
  | { ok: false; code: "INVALID_TRANSITION"; message: string };

const invalid = (message: string): TransitionCheck => ({ ok: false, code: "INVALID_TRANSITION", message });

/**
 * Checks one requested donation transition against the S-table and its guards.
 * Pure and total: returns INVALID_TRANSITION instead of throwing. Terminal states never transition.
 */
/** Triggers only an operator may fire (CLAUDE.md safety rule 5); everything else is checked by its own guard. */
const OPERATOR_TRIGGERS: readonly TransitionTrigger[] = ["operatorCancel", "operatorReject", "returnToDonor", "retryMatching"];

export function canTransition(req: {
  from: DonationStatus | null;
  to: DonationStatus;
  trigger: TransitionTrigger;
  ctx: TransitionContext;
}): TransitionCheck {
  const { from, to, trigger, ctx } = req;
  if (from !== null && TERMINAL_DONATION_STATUSES.includes(from)) return invalid(`${from} is terminal.`);

  if (OPERATOR_TRIGGERS.includes(trigger) && ctx.actor_role !== "operator") return invalid(`${trigger} requires an operator.`);

  const candidates = DONATION_TRANSITIONS.filter((t) => t.from.includes(from) && t.to.includes(to) && t.triggers.includes(trigger));
  if (candidates.length === 0) return invalid(`No transition ${from ?? "none"} -> ${to} via ${trigger}.`);

  let lastMessage = "Guard failed.";
  for (const t of candidates) {
    // S-11 specifics: note for claimed/collected (and needs_review once collected); donor cancel only before a claim.
    if (t.id === "S-11") {
      if (trigger === "donorCancel") {
        if (!ctx.authorized_owner) { lastMessage = "Only the owning donor can cancel."; continue; }
        // collected_at also covers needs_review after a post-pickup STOP (S-17): only the operator closes that one.
        if (from === "claimed" || from === "collected" || ctx.collected_at !== null) { lastMessage = "A donor can't cancel after a claim."; continue; }
      } else {
        const needsNote = from === "claimed" || from === "collected" || (from === "needs_review" && ctx.collected_at !== null);
        if (needsNote && !hasNote(ctx)) { lastMessage = "A note is required."; continue; }
      }
    }
    const failure = t.guard(ctx, to);
    if (failure === null) return { ok: true, transition: t.id };
    lastMessage = failure;
  }
  return invalid(lastMessage);
}

// ---------- §4.2 offers ----------

export type OfferTrigger = TransitionTrigger | "openOfferForSend";

export type OfferTransition = {
  from: OfferStatus | null;
  to: OfferStatus;
  trigger: OfferTrigger;
  note?: string;
};

export const OFFER_TRANSITIONS: readonly OfferTransition[] = [
  { from: null, to: "pending_send", trigger: "createNextOffers" },
  { from: "pending_send", to: "open", trigger: "openOfferForSend" },
  { from: "pending_send", to: "send_failed", trigger: "openOfferForSend", note: "courier_not_joined" },
  { from: "open", to: "send_failed", trigger: "markOfferSendFailed" },
  { from: "open", to: "accepted", trigger: "claimOffer" },
  { from: "open", to: "declined", trigger: "declineOffer" },
  { from: "open", to: "expired", trigger: "expireDue" },
  { from: "open", to: "expired", trigger: "claimOffer", note: "lazy expiry" },
  { from: "open", to: "expired", trigger: "declineOffer", note: "lazy expiry" },
  { from: "open", to: "expired", trigger: "optOutIdentity" },
  { from: "pending_send", to: "expired", trigger: "expireDue" },
  { from: "open", to: "superseded", trigger: "claimOffer" },
  { from: "pending_send", to: "superseded", trigger: "claimOffer" },
  { from: "open", to: "canceled", trigger: "claimOffer", note: "recheck_failed" },
  { from: "open", to: "canceled", trigger: "operatorCancel" },
  { from: "pending_send", to: "canceled", trigger: "operatorCancel" },
  { from: "open", to: "canceled", trigger: "donorCancel" },
  { from: "pending_send", to: "canceled", trigger: "donorCancel" },
  { from: "open", to: "canceled", trigger: "optOutIdentity" },
  { from: "pending_send", to: "canceled", trigger: "optOutIdentity" },
  // accepted stays accepted; close_reason records why the assignment ended (S-15/S-16/S-17/S-11).
  { from: "accepted", to: "accepted", trigger: "optOutIdentity" },
  { from: "accepted", to: "accepted", trigger: "expireDue" },
  { from: "accepted", to: "accepted", trigger: "operatorCancel" },
];

export function canOfferTransition(req: { from: OfferStatus | null; to: OfferStatus; trigger: OfferTrigger }): TransitionCheck {
  const hit = OFFER_TRANSITIONS.find((t) => t.from === req.from && t.to === req.to && t.trigger === req.trigger);
  return hit ? { ok: true, transition: `offer:${req.from ?? "none"}->${req.to}` } : invalid(`No offer transition ${req.from ?? "none"} -> ${req.to} via ${req.trigger}.`);
}
