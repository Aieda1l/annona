import type { Clock, OfferMessageView, Result } from "@/contracts";
import type { DispatchCore, IdentityView, MessagingCore } from "@/workflows/core-port";
import { createCoreDouble } from "./core";

// In-memory model of the dispatch side of core (offers + donations) for tick() tests, until sub-PR 2(b) is wired.
// Every state change is one synchronous block, like a database conditional update, so concurrent ticks race honestly.

export type TestClock = Clock & { advance(ms: number): void };

export function createClock(start: Date): TestClock {
  let current = start.getTime();
  return {
    now: () => new Date(current),
    advance(ms) {
      current += ms;
    },
  };
}

type OfferStatus = "pending_send" | "open" | "expired" | "declined" | "send_failed";
type DonationStatus = "eligible" | "offered" | "unmatched" | "expired";
type Offer = {
  offer_id: string;
  donation_id: string;
  identity_id: string;
  short_code: string;
  status: OfferStatus;
  expires_at: number | null;
  provider_message_id: string | null;
  failure: string | null;
};
type Donation = {
  id: string;
  status: DonationStatus;
  cutoff: number;
  candidates: string[];
  offered: Set<string>;
  reason: string | null;
};

const fail = (code: "CONFLICT" | "NOT_FOUND" | "INTERNAL", message: string, reason?: string): Result<never> => ({
  ok: false,
  error: { code, message, retryable: code !== "NOT_FOUND", ...(reason ? { details: { reason } } : {}) },
});

const SHORT_CODES = ["K7M3", "H4M9", "C3F7", "D4E9", "J7K3"];

export function createDispatchDouble(clock: TestClock, base = createCoreDouble(), responseWindowMs = 60_000) {
  const donations = new Map<string, Donation>();
  const offers = new Map<string, Offer>();
  const broken = new Set<string>();
  const lastTicks: string[] = [];
  let sequence = 0;

  const active = (donationId: string) =>
    [...offers.values()].some((o) => o.donation_id === donationId && (o.status === "pending_send" || o.status === "open"));

  /** S-06: with no live offers left and time remaining, the donation is eligible again. */
  const reopen = (d: Donation) => {
    if (d.status === "offered" && !active(d.id) && clock.now().getTime() < d.cutoff) d.status = "eligible";
  };

  const view = (o: Offer): OfferMessageView => ({
    short_code: o.short_code,
    dish_name: "Assorted sandwiches and wraps",
    servings: 24,
    allergens_present: ["wheat", "milk", "eggs"],
    cross_contact_status: "declared",
    cross_contact_allergens: [],
    handling_mode: "refrigerated",
    recipient_display_name: "Eastlake Community Pantry",
    pickup_area_label: "Capitol Hill",
    expires_at: new Date(o.expires_at ?? 0).toISOString(),
    demo_mode: true,
  });

  const dispatch: DispatchCore = {
    async expireDue() {
      const now = clock.now().getTime();
      const expired_offer_ids: string[] = [];
      const expired_donation_ids: string[] = [];
      for (const d of donations.values()) {
        const live = [...offers.values()].filter(
          (o) => o.donation_id === d.id && (o.status === "open" || o.status === "pending_send"),
        );
        if (now >= d.cutoff && d.status !== "expired") {
          for (const o of live) {
            o.status = "expired";
            expired_offer_ids.push(o.offer_id);
          }
          d.status = "expired";
          expired_donation_ids.push(d.id);
          continue;
        }
        for (const o of live) {
          if (o.status === "open" && o.expires_at !== null && o.expires_at <= now) {
            o.status = "expired";
            expired_offer_ids.push(o.offer_id);
          }
        }
        reopen(d);
      }
      const dispatchable_donation_ids = [...donations.values()].filter((d) => d.status === "eligible").map((d) => d.id);
      return { expired_offer_ids, expired_donation_ids, dispatchable_donation_ids };
    },
    async listDispatchableDonations() {
      return [...donations.values()].filter((d) => d.status === "eligible").map((d) => ({ donation_id: d.id }));
    },
    async createNextOffers({ donation_id }) {
      const d = donations.get(donation_id);
      if (!d) return fail("NOT_FOUND", "no such donation");
      if (broken.has(donation_id)) return fail("INTERNAL", "store unavailable");
      if (d.status !== "eligible") return fail("CONFLICT", "donation is not eligible (another tick got there first)");
      const next = d.candidates.find((candidate) => !d.offered.has(candidate));
      if (next === undefined) {
        d.status = "unmatched";
        d.reason = "CANDIDATES_EXHAUSTED";
        return { ok: true, data: [] };
      }
      sequence += 1;
      const offer: Offer = {
        offer_id: `e0000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
        donation_id,
        identity_id: next,
        short_code: SHORT_CODES[(sequence - 1) % SHORT_CODES.length] as string,
        status: "pending_send",
        expires_at: null,
        provider_message_id: null,
        failure: null,
      };
      offers.set(offer.offer_id, offer);
      d.offered.add(next);
      d.status = "offered";
      return { ok: true, data: [{ offer_id: offer.offer_id }] };
    },
    async listPendingSendOffers() {
      return [...offers.values()].filter((o) => o.status === "pending_send").map((o) => ({ offer_id: o.offer_id }));
    },
    async openOfferForSend({ offer_id }) {
      const o = offers.get(offer_id);
      if (!o) return fail("NOT_FOUND", "no such offer");
      if (o.status !== "pending_send") return fail("CONFLICT", "offer is not pending_send (another tick got there first)");
      const d = donations.get(o.donation_id) as Donation;
      const identity = base.identity(o.identity_id) as IdentityView;
      if (identity.status !== "joined") {
        o.status = "send_failed";
        o.failure = "courier_not_joined";
        reopen(d);
        return fail("CONFLICT", "courier has not joined", "courier_not_joined");
      }
      o.status = "open";
      o.expires_at = clock.now().getTime() + responseWindowMs;
      return { ok: true, data: { offer_id, identity, message_view: view(o) } };
    },
    async markOfferSendFailed({ offer_id, reason }) {
      const o = offers.get(offer_id);
      if (!o) return fail("NOT_FOUND", "no such offer");
      if (o.status !== "open" && o.status !== "pending_send") return fail("CONFLICT", "offer is already closed");
      o.status = "send_failed";
      o.failure = reason;
      reopen(donations.get(o.donation_id) as Donation);
      return { ok: true, data: {} };
    },
    async recordOfferProviderMessage({ offer_id, provider_message_id }) {
      const o = offers.get(offer_id);
      if (!o) return fail("NOT_FOUND", "no such offer");
      o.provider_message_id = provider_message_id;
      return { ok: true, data: {} };
    },
    async setLastTick(at) {
      lastTicks.push(at);
    },
  };

  const core: MessagingCore & DispatchCore = { ...base.core, ...dispatch };

  return {
    core,
    base,
    lastTicks,
    seedDonation(input: { id: string; cutoff: Date; candidates: string[] }) {
      donations.set(input.id, {
        id: input.id,
        status: "eligible",
        cutoff: input.cutoff.getTime(),
        candidates: input.candidates,
        offered: new Set(),
        reason: null,
      });
    },
    /** A courier replies NO: the offer closes and the donation returns to eligible (S-06). */
    decline(offer_id: string) {
      const o = offers.get(offer_id) as Offer;
      o.status = "declined";
      reopen(donations.get(o.donation_id) as Donation);
    },
    /** Make createNextOffers fail with an unexpected error for this donation. */
    breakDonation: (id: string) => void broken.add(id),
    offer: (id: string) => offers.get(id),
    offersFor: (donationId: string) => [...offers.values()].filter((o) => o.donation_id === donationId),
    donation: (id: string) => donations.get(id),
  };
}
