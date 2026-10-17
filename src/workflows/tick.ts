import type { Clock, MessagingGateway, OutboundMessage } from "@/contracts";
import type { DispatchCore, MessagingCore } from "./core-port";
import { createOutboundSender } from "./outbound";
import { formatOfferMessage } from "./templates";

// tick() keeps offers moving (CONTRACTS §7). Correctness never waits on it: claim and decline check deadlines in core.
// Order: expireDue -> createNextOffers for every dispatchable donation -> open and send every pending_send offer.
// Every core step is a conditional update, so a losing concurrent tick gets CONFLICT and skips; it is not an error.

export type TickReport = {
  at: string;
  expired_offers: number;
  expired_donations: number;
  offers_created: number;
  offers_sent: number;
  send_failures: number;
};

type TickCore = Pick<MessagingCore, "getIdentity" | "recordOutboundMessage"> & DispatchCore;

/** Another tick (or a lazy check in claim/decline) got there first. */
const lostRace = (code: string): boolean => code === "CONFLICT" || code === "INVALID_TRANSITION";

export function createTicker(deps: { core: TickCore; gateway: MessagingGateway; clock: Clock }) {
  const { core, gateway, clock } = deps;
  const send = createOutboundSender({ core, gateway });

  const emptyReport = (at: string): TickReport => ({
    at,
    expired_offers: 0,
    expired_donations: 0,
    offers_created: 0,
    offers_sent: 0,
    send_failures: 0,
  });

  async function createOffers(donation_id: string, report: TickReport, failures: string[]): Promise<void> {
    try {
      const created = await core.createNextOffers({ donation_id });
      if (created.ok) report.offers_created += created.data.length;
      else if (!lostRace(created.error.code)) failures.push(`createNextOffers ${donation_id}: ${created.error.code}`);
    } catch (error) {
      failures.push(`createNextOffers ${donation_id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function sendOffer(offer_id: string, report: TickReport, failures: string[]): Promise<void> {
    const opened = await core.openOfferForSend({ offer_id });
    if (!opened.ok) {
      // Core already failed an offer to a courier who has not joined; it is not sent, and the next tick moves on.
      if (opened.error.details?.reason === "courier_not_joined") report.send_failures += 1;
      else if (!lostRace(opened.error.code)) failures.push(`openOfferForSend ${offer_id}: ${opened.error.code}`);
      return;
    }

    const { identity, message_view } = opened.data;
    const message: OutboundMessage = {
      to_identity_id: identity.id,
      text: formatOfferMessage(message_view),
      purpose: "offer",
      correlation: { offer_id },
      idempotency_key: `offer:${offer_id}:v1`,
    };
    const result = await send(message);

    if (result.ok) {
      await core.recordOfferProviderMessage({ offer_id, provider_message_id: result.provider_message_id });
      report.offers_sent += 1;
      return;
    }
    // No automatic resend to the same courier in P0 (CONTRACTS §8.3): the next tick offers the next candidate.
    const reason = result.error_code === "NOT_JOINED" ? "courier_not_joined" : result.error_code;
    const failed = await core.markOfferSendFailed({ offer_id, reason });
    if (!failed.ok && !lostRace(failed.error.code)) failures.push(`markOfferSendFailed ${offer_id}: ${failed.error.code}`);
    report.send_failures += 1;
  }

  async function sendPendingOffers(report: TickReport, failures: string[]): Promise<void> {
    for (const { offer_id } of await core.listPendingSendOffers()) {
      try {
        await sendOffer(offer_id, report, failures);
      } catch (error) {
        failures.push(`offer ${offer_id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /** Unexpected failures are collected so one bad donation cannot starve the others, then surfaced together. */
  function assertNoFailures(failures: string[]): void {
    if (failures.length > 0) throw new Error(`tick finished with ${failures.length} failure(s): ${failures.join("; ")}`);
  }

  return {
    async tick(): Promise<TickReport> {
      const at = clock.now().toISOString();
      const report = emptyReport(at);
      const failures: string[] = [];

      const expired = await core.expireDue();
      report.expired_offers = expired.expired_offer_ids.length;
      report.expired_donations = expired.expired_donation_ids.length;

      const dispatchable = new Set(expired.dispatchable_donation_ids);
      for (const { donation_id } of await core.listDispatchableDonations()) dispatchable.add(donation_id);
      for (const donation_id of dispatchable) await createOffers(donation_id, report, failures);

      await sendPendingOffers(report, failures);
      assertNoFailures(failures);
      await core.setLastTick(at);
      return report;
    },

    /** The operator's "Dispatch now": offers one donation immediately. It is not a tick, so it does not touch last_tick_at. */
    async dispatchDonation(donation_id: string): Promise<TickReport> {
      const report = emptyReport(clock.now().toISOString());
      const failures: string[] = [];
      await createOffers(donation_id, report, failures);
      await sendPendingOffers(report, failures);
      assertNoFailures(failures);
      return report;
    },
  };
}
