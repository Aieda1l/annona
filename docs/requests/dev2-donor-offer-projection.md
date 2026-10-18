REQUEST: A DonorOfferSummary type for the owning donor's DonationCard
LANE: Dev 2
STATUS: open
CONTRACT SECTION: docs/CONTRACTS.md section 3.13 (DonationCard projections), section 11
CHANGE: Section 3.13 says the owning donor sees `active_offers` and `offer_history` reduced to `{ status, sent_at, expires_at }`, with no courier name or provider message id before a claim. `DonationCard` (strict) types both as `OfferSummary[]`, which requires an id, a short code and names. Today `getDonationCard` keeps the schema valid by filling the hidden fields with placeholders for the donor: the zero UUID, short code `AAAA`, empty names, `provider_message_id: null`, `delivery_status: "unknown"`. Proposal: add `DonorOfferSummary = { status, sent_at, expires_at, provider_mode }` and let `DonationCard.active_offers` / `offer_history` be `OfferSummary[] | DonorOfferSummary[]` (or a separate `DonorDonationCard`). Dev 4 would then render the donor page from the reduced shape.
WHY (which acceptance criterion needs it): AC-09 (disclosure matrix, section 11): the placeholders work, but a typed reduced shape cannot leak a real id or code by mistake and removes the magic values.
COMPATIBILITY: additive type; the operator card is unchanged. Dev 4 renders the donor page from the reduced fields only (it already ignores ids and codes).
TESTS AFFECTED: tests/core/service-intake.test.ts and service-dispatch.test.ts (donor projection); tests/contracts for the new type.
DECISION:
MERGED SHA:
