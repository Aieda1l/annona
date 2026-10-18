import * as core from "@/core";
import { err, type Deps } from "@/contracts";
import { identityFromCore } from "./core-adapter";
import type { DeliveryCore, DispatchCore, IdentityView, MessagingCore } from "./core-port";

// Binds Dev 2's core (CONTRACTS §9.3) to the three ports the workflows depend on. Core takes `deps?` last; this adapter
// closes over it so the handlers never see it. Everything crossing the boundary is narrowed to my own types, and an
// identity that does not parse becomes null (fail closed), never a guess.

export type BoundCore = MessagingCore & DispatchCore & DeliveryCore;

const view = (record: unknown): IdentityView | null => identityFromCore(record);

/** Core's setLastTick is a stub until Dev 2's 2(c); a tick must not fail after it has already sent offers. */
let warnedLastTick = false;
async function setLastTickWhenBuilt(at: string, deps?: Deps): Promise<void> {
  try {
    await core.setLastTick(at, deps);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith("NOT_IMPLEMENTED")) throw error;
    if (!warnedLastTick) {
      warnedLastTick = true;
      console.warn("[tick] core.setLastTick is not implemented yet; last_tick_at will not update until slice 2(c) lands");
    }
  }
}

export function bindCore(deps?: Deps): BoundCore {
  return {
    // MessagingCore
    recordInboundMessage: (provider, provider_message_id, payload) => core.recordInboundMessage(provider, provider_message_id, payload, deps),
    saveInboundResult: (input) => core.saveInboundResult(input, deps),
    resolveIdentityByHandle: async (provider, handle) => view(await core.resolveIdentityByHandle(provider, handle, deps)),
    getIdentity: async (identity_id) => view(await core.getIdentity(identity_id, deps)),
    joinIdentity: (input) => core.joinIdentity(input, deps),
    optOutIdentity: (input) => core.optOutIdentity(input, deps),
    findOpenOffersForCourier: async (courier_id) => (await core.findOpenOffersForCourier(courier_id, deps)).map((offer) => ({ offer_id: offer.id })),
    findRecipientNotice: async (offer_id) => {
      const found = await core.findRecipientNoticeForOffer(offer_id, deps);
      const identity = found ? view(found.identity) : null;
      return found && identity ? { identity, courier_display_name: found.courier_display_name } : null;
    },
    claimOffer: (command) => core.claimOffer(command, deps),
    declineOffer: (command) => core.declineOffer(command, deps),
    recordIgnoredInbound: (input) => core.recordIgnoredInbound(input, deps),
    recordOutboundMessage: (input) => core.recordOutboundMessage(input, deps),
    hasOutboundMessage: (idempotency_key) => core.hasOutboundMessage(idempotency_key, deps),

    // DispatchCore
    expireDue: () => core.expireDue(deps),
    listDispatchableDonations: () => core.listDispatchableDonations(deps),
    createNextOffers: async (input) => {
      const created = await core.createNextOffers(input, deps);
      return created.ok ? { ok: true, data: created.data.map((offer) => ({ offer_id: offer.id })) } : created;
    },
    listPendingSendOffers: async () => (await core.listPendingSendOffers(deps)).map((offer) => ({ offer_id: offer.id })),
    openOfferForSend: async (input) => {
      const opened = await core.openOfferForSend(input, deps);
      if (!opened.ok) return opened;
      const identity = view(opened.data.identity);
      // A courier identity that cannot be read is never messaged; the offer is closed so the next candidate is tried.
      if (!identity) {
        await core.markOfferSendFailed({ offer_id: input.offer_id, reason: "identity_unreadable" }, deps);
        return err("CONFLICT", "The courier identity could not be read.", { details: { reason: "courier_not_joined", offer_id: input.offer_id } });
      }
      return { ok: true, data: { offer_id: opened.data.offer.id, identity, message_view: opened.data.message_view } };
    },
    markOfferSendFailed: (input) => core.markOfferSendFailed(input, deps),
    recordOfferProviderMessage: (input) => core.recordOfferProviderMessage(input, deps),
    setLastTick: (at) => setLastTickWhenBuilt(at, deps),

    // DeliveryCore
    recordStatusEvent: (evt) => core.recordStatusEvent(evt, deps),
    recordDeliveryStatus: (evt) => core.recordDeliveryStatus(evt, deps),
  };
}
