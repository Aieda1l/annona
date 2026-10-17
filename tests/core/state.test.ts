import { describe, expect, it } from "vitest";
import { DONATION_STATUSES, OFFER_STATUSES, type DonationStatus, type OfferStatus } from "@/contracts";
import {
  DONATION_TRANSITIONS,
  OFFER_TRANSITIONS,
  TERMINAL_DONATION_STATUSES,
  canOfferTransition,
  canTransition,
  createTestClock,
  type OfferTrigger,
  type TransitionContext,
  type TransitionTrigger,
} from "@/core";

// T-CO-15 (pure part): CONTRACTS §4.1 S-01..S-18 and §4.2 offer transitions as a table with guards.
// The persistence half (owning functions call the table inside transactions) is added with the store.

const clock = createTestClock("2026-10-17T23:10:00.000Z");
const BEFORE = clock.now();
const CUTOFF = "2026-10-18T01:30:00.000Z";
const AFTER = new Date("2026-10-18T01:30:00.000Z"); // now == cutoff counts as "reached"
const DISCARD = "2026-10-18T05:00:00.000Z";

const OPERATOR_TRIGGERS: TransitionTrigger[] = ["operatorCancel", "operatorReject", "returnToDonor", "retryMatching"];
const ctx = (over: Partial<TransitionContext> = {}): TransitionContext => ({
  now: BEFORE,
  effective_cutoff_at: CUTOFF,
  discard_by: DISCARD,
  collected_at: null,
  ...over,
});

const withRole = (trigger: TransitionTrigger, over: Partial<TransitionContext>): Partial<TransitionContext> =>
  OPERATOR_TRIGGERS.includes(trigger) ? { actor_role: "operator", ...over } : over;

type Row = {
  id: string;
  from: DonationStatus;
  to: DonationStatus;
  trigger: TransitionTrigger;
  ok: Partial<TransitionContext>;
  /** Each variant violates exactly one guard and must be INVALID_TRANSITION. */
  bad: Array<[string, Partial<TransitionContext>]>;
  reasons?: string[];
};

const rows: Row[] = [
  { id: "S-01", from: null as never, to: "draft", trigger: "createDraft", ok: { actor_role: "donor", donor_status: "approved" }, bad: [["suspended donor", { actor_role: "donor", donor_status: "suspended" }], ["courier actor", { actor_role: "courier", donor_status: "approved" }]] },
  { id: "S-02", from: "draft", to: "draft", trigger: "attachAiResult", ok: {}, bad: [] },
  { id: "S-03", from: "draft", to: "eligible", trigger: "submitVerification", ok: { authorized_owner: true, gate_outcome: "eligible" }, bad: [["not owner/link", { authorized_owner: false, gate_outcome: "eligible" }], ["collected", { collected_at: "2026-10-18T00:00:00.000Z", authorized_owner: true, gate_outcome: "eligible" }], ["gate rejected", { authorized_owner: true, gate_outcome: "rejected" }], ["gate needs_review", { authorized_owner: true, gate_outcome: "needs_review" }], ["gate missing", { authorized_owner: true }]] },
  { id: "S-03", from: "needs_review", to: "needs_review", trigger: "submitVerification", ok: { authorized_owner: true, gate_outcome: "needs_review" }, bad: [["collected", { collected_at: "2026-10-18T00:00:00.000Z", authorized_owner: true, gate_outcome: "needs_review" }], ["gate eligible", { authorized_owner: true, gate_outcome: "eligible" }]] },
  { id: "S-03", from: "draft", to: "rejected", trigger: "submitVerification", ok: { authorized_owner: true, gate_outcome: "rejected" }, bad: [["gate eligible", { authorized_owner: true, gate_outcome: "eligible" }]] },
  { id: "S-04", from: "eligible", to: "offered", trigger: "createNextOffers", ok: { gate_outcome: "eligible", candidate_count: 1 }, bad: [["no candidates", { gate_outcome: "eligible", candidate_count: 0 }], ["gate not eligible", { gate_outcome: "needs_review", candidate_count: 1 }], ["gate missing", { candidate_count: 1 }]] },
  { id: "S-05", from: "eligible", to: "unmatched", trigger: "createNextOffers", ok: { gate_outcome: "eligible", candidate_count: 0 }, bad: [["candidates exist", { gate_outcome: "eligible", candidate_count: 1 }], ["gate not eligible", { gate_outcome: "rejected", candidate_count: 0 }], ["gate missing", { candidate_count: 0 }]], reasons: ["NO_ELIGIBLE_MATCH", "CANDIDATES_EXHAUSTED"] },
  { id: "S-06", from: "offered", to: "eligible", trigger: "expireDue", ok: { live_offer_count: 0 }, bad: [["live offers remain", { live_offer_count: 1 }], ["at cutoff", { live_offer_count: 0, now: AFTER }]] },
  { id: "S-07", from: "offered", to: "claimed", trigger: "claimOffer", ok: {}, bad: [] },
  { id: "S-08", from: "eligible", to: "expired", trigger: "expireDue", ok: { now: AFTER }, bad: [["before cutoff", {}]], reasons: ["CUTOFF_REACHED"] },
  { id: "S-08", from: "needs_review", to: "expired", trigger: "expireDue", ok: { now: AFTER }, bad: [["collected (S-17 follow-up)", { now: AFTER, collected_at: "2026-10-18T00:00:00.000Z" }]], reasons: ["CUTOFF_REACHED"] },
  { id: "S-09", from: "claimed", to: "collected", trigger: "recordHandoff", ok: { simulated: true, donor_status: "approved" }, bad: [["not simulated", { simulated: false, donor_status: "approved" }], ["simulated missing", { donor_status: "approved" }], ["at cutoff", { simulated: true, donor_status: "approved", now: AFTER }], ["donor suspended", { simulated: true, donor_status: "suspended" }]] },
  { id: "S-10", from: "collected", to: "delivered", trigger: "recordHandoff", ok: { simulated: true, collected_at: "2026-10-18T00:00:00.000Z" }, bad: [["not simulated", { simulated: false }], ["at discard_by", { simulated: true, now: new Date(DISCARD) }]] },
  { id: "S-11", from: "eligible", to: "canceled", trigger: "operatorCancel", ok: {}, bad: [] },
  { id: "S-11", from: "claimed", to: "canceled", trigger: "operatorCancel", ok: { note: "courier unreachable" }, bad: [["no note", {}], ["blank note", { note: "   " }]] },
  { id: "S-11", from: "collected", to: "canceled", trigger: "operatorCancel", ok: { note: "closed off-platform", collected_at: "2026-10-18T00:00:00.000Z" }, bad: [["no note", { collected_at: "2026-10-18T00:00:00.000Z" }]] },
  { id: "S-11", from: "needs_review", to: "canceled", trigger: "operatorCancel", ok: {}, bad: [["collected without note", { collected_at: "2026-10-18T00:00:00.000Z" }]] },
  { id: "S-11", from: "offered", to: "canceled", trigger: "donorCancel", ok: { authorized_owner: true }, bad: [["not owner", { authorized_owner: false }]] },
  { id: "S-12", from: "needs_review", to: "rejected", trigger: "operatorReject", ok: { note: "unresolved" }, bad: [["no note", {}]] },
  { id: "S-13", from: "needs_review", to: "draft", trigger: "returnToDonor", ok: {}, bad: [["collected", { collected_at: "2026-10-18T00:00:00.000Z" }]] },
  { id: "S-14", from: "unmatched", to: "eligible", trigger: "retryMatching", ok: { gate_outcome: "eligible" }, bad: [["at cutoff", { gate_outcome: "eligible", now: AFTER }], ["gate not eligible", { gate_outcome: "needs_review" }], ["gate missing", {}]] },
  { id: "S-15", from: "claimed", to: "eligible", trigger: "optOutIdentity", ok: {}, bad: [["at cutoff", { now: AFTER }], ["collected", { collected_at: "2026-10-18T00:00:00.000Z" }]], reasons: ["COURIER_OPTED_OUT"] },
  { id: "S-16", from: "claimed", to: "expired", trigger: "expireDue", ok: { now: AFTER }, bad: [["before cutoff", {}], ["collected", { now: AFTER, collected_at: "2026-10-18T00:00:00.000Z" }]], reasons: ["PICKUP_NOT_COLLECTED"] },
  { id: "S-16", from: "claimed", to: "expired", trigger: "optOutIdentity", ok: { now: AFTER }, bad: [] },
  { id: "S-17", from: "collected", to: "needs_review", trigger: "optOutIdentity", ok: { collected_at: "2026-10-18T00:00:00.000Z" }, bad: [["not collected", {}]], reasons: ["COURIER_OPTED_OUT_AFTER_PICKUP"] },
  { id: "S-18", from: "eligible", to: "needs_review", trigger: "createNextOffers", ok: { gate_outcome: "needs_review" }, bad: [["gate eligible", { gate_outcome: "eligible" }], ["gate rejected", { gate_outcome: "rejected" }]] },
  { id: "S-18", from: "eligible", to: "rejected", trigger: "createNextOffers", ok: { gate_outcome: "rejected" }, bad: [["gate eligible", { gate_outcome: "eligible" }], ["gate needs_review", { gate_outcome: "needs_review" }]] },
  { id: "S-18", from: "unmatched", to: "rejected", trigger: "retryMatching", ok: { gate_outcome: "rejected" }, bad: [["gate eligible", { gate_outcome: "eligible" }]] },
  { id: "S-18", from: "unmatched", to: "needs_review", trigger: "retryMatching", ok: { gate_outcome: "needs_review" }, bad: [["gate eligible", { gate_outcome: "eligible" }]] },
];

describe("T-CO-15 every S-01..S-18 row exists in the table", () => {
  it("table covers S-01..S-18, each id at least once", () => {
    const ids = new Set(DONATION_TRANSITIONS.map((t) => t.id));
    for (let i = 1; i <= 18; i++) expect(ids.has(`S-${String(i).padStart(2, "0")}`)).toBe(true);
  });
  it("reason codes recorded by the table match CONTRACTS", () => {
    for (const r of rows.filter((x) => x.reasons)) {
      const t = DONATION_TRANSITIONS.find((x) => x.id === r.id && x.to.includes(r.to));
      expect(t?.reason_codes ?? []).toEqual(r.reasons);
    }
  });
});

describe("T-CO-15 allowed transitions and their guards", () => {
  it.each(rows)("T-CO-15 $id $from -> $to via $trigger passes with its guards met", (r) => {
    const res = canTransition({ from: r.from, to: r.to, trigger: r.trigger, ctx: ctx(withRole(r.trigger, r.ok)) });
    expect(res).toMatchObject({ ok: true, transition: r.id });
  });
  for (const r of rows) {
    for (const [name, over] of r.bad) {
      it(`T-CO-15 ${r.id} ${r.from}->${r.to} via ${r.trigger} refuses: ${name}`, () => {
        const res = canTransition({ from: r.from, to: r.to, trigger: r.trigger, ctx: ctx(withRole(r.trigger, over)) });
        expect(res).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
      });
    }
  }
});

describe("T-CO-15 nothing outside the table is allowed", () => {
  const triggers = [...new Set(rows.map((r) => r.trigger))];
  // Permissive context variants that together satisfy every guard in the table.
  const variants: TransitionContext[] = [
    ctx({ authorized_owner: true, actor_role: "donor", donor_status: "approved", gate_outcome: "eligible", candidate_count: 1, live_offer_count: 0, simulated: true, note: "n" }),
    ctx({ gate_outcome: "eligible", candidate_count: 0, now: AFTER, simulated: true, note: "n", donor_status: "approved" }),
    ctx({ gate_outcome: "needs_review", collected_at: "2026-10-18T00:00:00.000Z", note: "n", simulated: true, actor_role: "operator" }),
    ctx({ gate_outcome: "rejected", now: AFTER, collected_at: "2026-10-18T00:00:00.000Z", note: "n", actor_role: "operator" }),
  ];
  variants[1] = { ...variants[1]!, actor_role: "operator" };
  // Before the cutoff, uncollected, one gate outcome per variant (S-03, S-18).
  for (const gate_outcome of ["eligible", "needs_review", "rejected"] as const) {
    variants.push(ctx({ gate_outcome, note: "n", actor_role: "operator", authorized_owner: true, live_offer_count: 0 }));
  }
  // Spec combinations that several rows stand for (S-03, S-06, S-08, S-11).
  const extra: string[] = [];
  for (const from of ["draft", "needs_review"] as const) {
    for (const to of ["eligible", "needs_review", "rejected"] as const) extra.push(`${from}|${to}|submitVerification`);
  }
  for (const from of ["eligible", "unmatched", "offered", "needs_review"] as const) extra.push(`${from}|expired|expireDue`);
  for (const trigger of ["declineOffer", "markOfferSendFailed"] as const) extra.push(`offered|eligible|${trigger}`);
  for (const from of ["draft", "needs_review", "eligible", "unmatched", "offered", "claimed", "collected"] as const) extra.push(`${from}|canceled|operatorCancel`);
  for (const from of ["draft", "needs_review", "eligible", "unmatched", "offered"] as const) extra.push(`${from}|canceled|donorCancel`);
  const allowedPairs = new Set([...rows.filter((r) => r.from).map((r) => `${r.from}|${r.to}|${r.trigger}`), ...extra]);

  it("T-CO-15 exhaustive (from, to, trigger): allowed iff a table row exists", () => {
    for (const from of DONATION_STATUSES) {
      for (const to of DONATION_STATUSES) {
        for (const trigger of triggers) {
          const allowed = variants.some((c) => canTransition({ from, to, trigger, ctx: c }).ok);
          expect(allowed, `${from} -> ${to} via ${trigger}`).toBe(allowedPairs.has(`${from}|${to}|${trigger}`));
        }
      }
    }
  });

  it("T-CO-15 terminal states are immutable", () => {
    expect([...TERMINAL_DONATION_STATUSES].sort()).toEqual(["canceled", "delivered", "expired", "rejected"]);
    for (const from of TERMINAL_DONATION_STATUSES) {
      for (const to of DONATION_STATUSES) {
        for (const trigger of triggers) {
          for (const c of variants) {
            expect(canTransition({ from, to, trigger, ctx: c }).ok, `${from} -> ${to} via ${trigger}`).toBe(false);
          }
        }
      }
    }
  });
});

describe("T-CO-15 forbidden by design", () => {
  it("operator cannot turn a review/reject outcome into eligible: no operator trigger reaches eligible from needs_review", () => {
    for (const trigger of ["operatorCancel", "operatorReject", "returnToDonor", "retryMatching"] as const) {
      const res = canTransition({ from: "needs_review", to: "eligible", trigger, ctx: ctx({ gate_outcome: "eligible", note: "n" }) });
      expect(res.ok).toBe(false);
    }
  });
  it("S-14 only from unmatched; reject and return_to_donor on unmatched are invalid", () => {
    for (const from of DONATION_STATUSES.filter((s) => s !== "unmatched")) {
      expect(canTransition({ from, to: "eligible", trigger: "retryMatching", ctx: ctx({ gate_outcome: "eligible" }) }).ok).toBe(false);
    }
    expect(canTransition({ from: "unmatched", to: "rejected", trigger: "operatorReject", ctx: ctx({ note: "n" }) }).ok).toBe(false);
    expect(canTransition({ from: "unmatched", to: "draft", trigger: "returnToDonor", ctx: ctx() }).ok).toBe(false);
  });
  it("unmatched is never entered or left for eligible without a current eligible gate outcome", () => {
    for (const gate_outcome of [undefined, "needs_review", "rejected"] as const) {
      expect(canTransition({ from: "eligible", to: "unmatched", trigger: "createNextOffers", ctx: ctx({ gate_outcome, candidate_count: 0 }) }).ok).toBe(false);
      expect(canTransition({ from: "unmatched", to: "eligible", trigger: "retryMatching", ctx: ctx({ gate_outcome }) }).ok).toBe(false);
    }
  });
  it("no reassignment after a recorded collection: collected never returns to eligible/claimed/offered", () => {
    const collected = ctx({ collected_at: "2026-10-18T00:00:00.000Z", note: "n", gate_outcome: "eligible", candidate_count: 1, live_offer_count: 0 });
    for (const to of ["eligible", "claimed", "offered", "unmatched", "draft"] as const) {
      for (const trigger of ["optOutIdentity", "retryMatching", "createNextOffers", "claimOffer", "returnToDonor", "expireDue", "submitVerification"] as const) {
        expect(canTransition({ from: "collected", to, trigger, ctx: collected }).ok, `collected -> ${to} via ${trigger}`).toBe(false);
      }
    }
  });
  it("after S-17 (needs_review with collected_at): S-03, S-13, S-14 unavailable; cancel/reject with a note succeed", () => {
    const c = ctx({ collected_at: "2026-10-18T00:00:00.000Z", note: "followed up off-platform", authorized_owner: true, gate_outcome: "eligible", actor_role: "operator" });
    expect(canTransition({ from: "needs_review", to: "eligible", trigger: "submitVerification", ctx: c }).ok).toBe(false);
    expect(canTransition({ from: "needs_review", to: "draft", trigger: "returnToDonor", ctx: c }).ok).toBe(false);
    expect(canTransition({ from: "needs_review", to: "eligible", trigger: "retryMatching", ctx: c }).ok).toBe(false);
    expect(canTransition({ from: "needs_review", to: "canceled", trigger: "operatorCancel", ctx: c }).ok).toBe(true);
    expect(canTransition({ from: "needs_review", to: "rejected", trigger: "operatorReject", ctx: c }).ok).toBe(true);
    const noNote = { ...c, note: undefined };
    expect(canTransition({ from: "needs_review", to: "canceled", trigger: "operatorCancel", ctx: noNote }).ok).toBe(false);
    expect(canTransition({ from: "needs_review", to: "rejected", trigger: "operatorReject", ctx: noNote }).ok).toBe(false);
  });
  it("no client time: the guard clock is the server Clock value passed in, and the context has no client timestamp field", () => {
    // Structural: TransitionContext exposes `now: Date` only; a string-typed client timestamp is a type error.
    // @ts-expect-error client_timestamp is not part of the context
    const bad: TransitionContext = { ...ctx(), client_timestamp: "2020-01-01T00:00:00.000Z" };
    expect(bad.now).toBeInstanceOf(Date);
  });
  it("INVALID_TRANSITION result carries a message and never throws", () => {
    const res = canTransition({ from: "delivered", to: "draft", trigger: "returnToDonor", ctx: ctx() });
    expect(res).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
    if (!res.ok) expect(res.message.length).toBeGreaterThan(0);
  });
});

describe("T-CO-15 review fixes: gate outcome, roles, collected expiry", () => {
  it("S-03 cannot store eligible unless the gate said eligible", () => {
    for (const gate_outcome of [undefined, "needs_review", "rejected"] as const) {
      expect(canTransition({ from: "draft", to: "eligible", trigger: "submitVerification", ctx: ctx({ authorized_owner: true, gate_outcome }) }).ok).toBe(false);
    }
  });
  it("S-18 cannot store a status that differs from the gate outcome", () => {
    expect(canTransition({ from: "eligible", to: "needs_review", trigger: "createNextOffers", ctx: ctx({ gate_outcome: "rejected" }) }).ok).toBe(false);
    expect(canTransition({ from: "unmatched", to: "rejected", trigger: "retryMatching", ctx: ctx({ gate_outcome: "needs_review", actor_role: "operator" }) }).ok).toBe(false);
  });
  it.each([
    ["offered", "canceled", "operatorCancel", {}],
    ["needs_review", "rejected", "operatorReject", { note: "n" }],
    ["needs_review", "draft", "returnToDonor", {}],
    ["unmatched", "eligible", "retryMatching", { gate_outcome: "eligible" }],
  ] as const)("operator trigger %s -> %s via %s refuses missing or non-operator roles", (from, to, trigger, extra) => {
    expect(canTransition({ from, to, trigger, ctx: ctx(extra) }).ok).toBe(false);
    for (const actor_role of ["donor", "recipient", "courier", "system"] as const) {
      expect(canTransition({ from, to, trigger, ctx: ctx({ ...extra, actor_role }) }).ok, actor_role).toBe(false);
    }
    expect(canTransition({ from, to, trigger, ctx: ctx({ ...extra, actor_role: "operator" }) }).ok).toBe(true);
  });
  it("a collected needs_review donation (S-17) does not expire at the cutoff", () => {
    expect(canTransition({ from: "needs_review", to: "expired", trigger: "expireDue", ctx: ctx({ now: AFTER, collected_at: "2026-10-18T00:00:00.000Z" }) }).ok).toBe(false);
  });
});

describe("T-CO-15 offer transitions (CONTRACTS §4.2)", () => {
  const allowed: Array<[OfferStatus | null, OfferStatus, OfferTrigger]> = [
    [null, "pending_send", "createNextOffers"],
    ["pending_send", "open", "openOfferForSend"],
    ["pending_send", "send_failed", "openOfferForSend"],
    ["open", "send_failed", "markOfferSendFailed"],
    ["open", "accepted", "claimOffer"],
    ["open", "declined", "declineOffer"],
    ["open", "expired", "expireDue"],
    ["open", "expired", "claimOffer"], // lazy expiry inside claim
    ["open", "expired", "declineOffer"], // lazy expiry inside decline
    ["open", "canceled", "donorCancel"],
    ["pending_send", "canceled", "donorCancel"],
    ["open", "superseded", "claimOffer"],
    ["pending_send", "superseded", "claimOffer"],
    ["open", "canceled", "claimOffer"], // recheck_failed
    ["open", "canceled", "operatorCancel"],
    ["pending_send", "canceled", "operatorCancel"],
    ["open", "canceled", "optOutIdentity"],
    ["pending_send", "canceled", "optOutIdentity"],
    ["open", "expired", "optOutIdentity"],
    ["pending_send", "expired", "expireDue"],
    ["accepted", "accepted", "optOutIdentity"], // S-15/S-17: row stays as history with close_reason
    ["accepted", "accepted", "expireDue"], // S-16
    ["accepted", "accepted", "operatorCancel"], // S-11
  ];
  it.each(allowed)("T-CO-15 offer %s -> %s via %s is allowed", (from, to, trigger) => {
    expect(canOfferTransition({ from, to, trigger: trigger }).ok).toBe(true);
  });

  it("T-CO-15 terminal offer states are immutable (declined, expired, superseded, send_failed, canceled)", () => {
    const terminal: OfferStatus[] = ["declined", "expired", "superseded", "send_failed", "canceled"];
    const triggers = [...new Set(allowed.map((a) => a[2]))];
    for (const from of terminal) {
      for (const to of OFFER_STATUSES) {
        for (const trigger of triggers) {
          expect(canOfferTransition({ from, to, trigger: trigger }).ok, `${from} -> ${to} via ${trigger}`).toBe(false);
        }
      }
    }
  });
  it("T-CO-15 exhaustive: only table pairs are allowed; accepted never becomes another status", () => {
    const triggers = [...new Set(allowed.map((a) => a[2]))];
    const ok = new Set(allowed.map((a) => `${a[0]}|${a[1]}|${a[2]}`));
    for (const from of [null, ...OFFER_STATUSES]) {
      for (const to of OFFER_STATUSES) {
        for (const trigger of triggers) {
          expect(canOfferTransition({ from, to, trigger: trigger }).ok, `${from} -> ${to} via ${trigger}`).toBe(ok.has(`${from}|${to}|${trigger}`));
        }
      }
    }
  });
  it("OFFER_TRANSITIONS is exported for audit/test use", () => {
    expect(OFFER_TRANSITIONS.length).toBeGreaterThan(0);
  });
});
