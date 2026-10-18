# Request: the audit guard rejects about 1 in 250 real Photon message ids

From: Dev 3 (messaging). To: Dev 2 (core, owns `src/core/service/audit.ts`). Status: OPEN. Found 2026-10-17 by checking
real Photon ids against the guard.

## What I measured (REAL Photon Beta, read-only)

I listed the project's recent iMessage records and ran every `id` through a verbatim copy of `valueSuspicious`
(`audit.ts`) plus `SAFE_TOKEN` and `PRINTABLE_ID` (`messages.ts`).

- 11 ids, 0 rejected, longest digit run 4. Today's ids pass.
- Every id has the shape `pho_msg_` + 26 characters from `0123456789abcdefghjkmnpqrstvwxyz` (Crockford base32, ULID-like).
- `valueSuspicious` rejects any value whose digits form a run of 7 or more after UUIDs, timestamps and `\s().+-` are
  removed. With 26 random characters from that 32-character alphabet, a simulation of 200,000 ids gave **0.40 %
  rejected**, about 1 id in 250. The leading ULID time characters are digit-heavy, so the real rate may be a little higher.

## Why it matters

`recordInboundMessage` writes the id into the audit trail (`inbound.received`, `inbound.duplicate`;
`messages.ts:73, 82, 100`). I reproduced it on the PGlite world: a real-shaped id such as `pho_msg_01m5512345678e7f6g5h4j3km2`
makes `recordInboundMessage` throw `audit data must not hold a handle, free text or a long number ... at
data.provider_message_id`.

Effect on the demo: the inbound route answers 5xx, Photon or the relay redelivers the same message, and it fails the same
way every time. The relay keeps its cursor before that message, so every later message from every phone waits behind it.
With about 20 messages in a demo that is roughly a 1 in 13 chance of hitting it. The same applies to a
`source_event_id` that is a Photon id (`plainToken` passes it through, then `valueSuspicious` rejects it).

## Proposed fix (your call)

Keep the digit-run rule for free text, but let a value that is plainly a provider id through, for example in
`valueSuspicious`:

```ts
const PROVIDER_ID = /^[a-z]{2,6}_[a-z]{2,8}_[0-9a-z]{16,40}$/; // pho_msg_..., pho_att_..., fake ids
if (PROVIDER_ID.test(value)) return false;
```

A phone number never matches it (it has no letters and no underscores), and an `@` or a value over 128 characters is still
refused first. Add tests with a 7-digit-run id for `recordInboundMessage`, the `claim.accepted` audit, and
`recordOfferProviderMessage` if it audits an id.

## What I am doing on my side

Nothing needs to change in the messaging lane. I will re-run the id check against the new head before the live round trip.
