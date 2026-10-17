REQUEST: Core needs to tell messaging whether an outbound message with a given idempotency key already exists, and delivery recording should not lose events
LANE: Dev 3
STATUS: open
CONTRACT SECTION: docs/CONTRACTS.md §9.3 (core functions), §8.2-§8.3
CHANGE:
  1. Add `hasOutboundMessage(idempotency_key: string): Promise<boolean>` (or confirm that `listMessages({ identity_id })` is an acceptable way to answer it). handleInbound sends one reply per inbound message under key `reply:<provider_message_id>:v1` and must skip the send when a reclaimed, half-finished row is reprocessed (prompt §5).
  2. Make `recordStatusEvent` + `recordDeliveryStatus` safe to retry. The contract says to dedupe first and then update; if the update fails after the dedupe row was written, Photon's redelivery is seen as a duplicate and the delivery status is lost. Either make `recordDeliveryStatus` idempotent and always applied, or do both in one transaction.
  3. `recordDeliveryStatus` should return `{ offer_id: string | null, offer_status: string | null }` so messaging can close a still-open offer on a `failed` event without a second lookup.
  4. `openOfferForSend` for a courier who has not joined: please return a non-OK result with `details.reason = "courier_not_joined"` after marking the offer `send_failed`. tick counts that as a send failure and does not send.
WHY (which acceptance criterion needs it): AC-11 (duplicates processed once), AC-13 (failed delivery leads to the next candidate), T-MS-03, T-MS-10.
COMPATIBILITY: additive (1, 3) and behavior clarifications (2, 4). Dev 2 implements; Dev 3 reviews. Dev 3's code depends on these through a local port (`src/workflows/core-port.ts`) and an in-memory double, so nothing blocks in the meantime.
TESTS AFFECTED: Dev 2's core tests for the functions above; Dev 3's integration tests once sub-PR 2(b) is wired.
DECISION:
MERGED SHA:
