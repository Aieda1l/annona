# Request: Dev 1 -> Dev 2 (cc captain): accept HEIC/HEIF in `storeDonationImage`

**From:** Dev 1 (intake). **To:** Dev 2 (`src/core/service/intake.ts`). **Status:** proposed.

## Why

SP-14 (`docs/handoffs/dev-1.md`, 2026-10-17) showed a real Photon-downloaded iPhone HEIC (1,456,484 B, magic bytes `ftypheic`, unchanged) is accepted and parsed by `gemini-3.5-flash-lite` (5.4 s). CONTRACTS §9.3 allows HEIC/HEIF for `messaging` only once SP-14 passes. The intake PR sets `HEIC_ACCEPTED = true`, so intake validation now lets `image/heic` and `image/heif` through from messaging.

## What core does today

`storeDonationImage` allows only `image/jpeg|png|webp` and checks the declared type against the first bytes (`looksLike`). A HEIC from messaging therefore passes intake and is refused here with `VALIDATION_FAILED`, so the donor still gets `intake_failed`. Nothing unsafe happens; the feature just does not work end to end until core changes too.

## Proposed change (Dev 2's file)

- Add `image/heic` and `image/heif` to the allowlist.
- Magic-byte check: bytes 4..7 are `ftyp` and the brand (bytes 8..11) is one of `heic`, `heix`, `hevc`, `hevx`, `heim`, `heis`, `hevm`, `hevs`, `mif1`, `msf1`.
- Keep the 5 MB cap. The caller (intake) enforces that HEIC is allowed only from `messaging`; core has no source on this call.
- Tests: the existing "refuses mime image/heic" case in `tests/core/service-intake.test.ts` flips to accepted, plus a HEIC with a wrong brand and an `ftyp` file declared as `image/png` refused.

## Open risks (not blocking)

- **Rendering:** stored bytes stay HEIC. `/api/images/:id` serves the original MIME, and most browsers other than Safari cannot display HEIC, so the operator dashboard and the link page may show a broken photo. Options: convert on store (needs a library, out of P0 scope), or have the UI show a placeholder for `image/heic`. Dev 4 to decide.
- The MIME Photon reports for the attachment was not confirmed by Dev 3 (SP-14 used magic bytes). Dev 3's photo path should pass the sniffed type.
