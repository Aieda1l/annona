import type { DeliveryStatusEvent } from "@/contracts";
import type { DeliveryCore } from "./core-port";

// Delivery-status events (CONTRACTS §9.4). They update an offer's delivery_status and nothing else: they never start,
// extend or stop a deadline (§7). A `failed` event on a still-open offer closes it early so the next tick moves on.

export function createDeliveryHandler(deps: { core: DeliveryCore }) {
  const { core } = deps;

  return async function handleDeliveryStatus(evt: DeliveryStatusEvent): Promise<void> {
    // Photon delivers at least once, so the same provider_event_id can arrive again. The ledger row is only a record:
    // core's recordDeliveryStatus is idempotent and monotonic, so it runs for EVERY event, first or duplicate. A crash
    // between the two calls then never loses the offer update when Photon redelivers (Dev 2 handoff, answer 2).
    await core.recordStatusEvent(evt);

    const recorded = await core.recordDeliveryStatus(evt);
    // Throwing makes the route answer with an error so Photon retries the delivery.
    if (!recorded.ok) throw new Error(`core could not record the delivery status: ${recorded.error.code}`);

    const { offer_id, offer_status } = recorded.data;
    if (evt.status === "failed" && offer_id !== null && offer_status === "open") {
      await core.markOfferSendFailed({ offer_id, reason: evt.failure_code ?? "delivery_failed" });
    }
  };
}
