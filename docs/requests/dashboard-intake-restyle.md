# Request: restyle of the intake components (Dev 4 → Dev 1)

> **From:** Dev 4 (UI lane), branch `feat/ui-redesign`. **To:** Dev 1 (owner of `src/features/intake/**`). **Status:** PROPOSED, needs Dev 1 review before merge.

## What changed in Dev 1's files

Presentation only. No field, default, order of fields, validation rule, payload shape, prefill rule (D-042), cold-question rule (D-043), token handling or fetch call changed. Every label, `data-testid`, role and accessible name the tests use is kept.

| File | Change |
|---|---|
| `components/VerificationForm.tsx` | Fields grouped into five numbered `FormSection`s (The food, Major allergens, Handling, Timing and pickup, Attestation). Each allergen's three native radios render as a segmented control (radios are `sr-only` inside their labels; "I don't know" is drawn dashed so it never looks answered). Cross-contact checkboxes become chips. Selects are 44 px tall on phones. AI hints/tags carry a sparkle icon. Submit sits in a sticky bar on phones. The `<legend>` stays the first child of each allergen `<fieldset>` (it names the group). |
| `components/DraftReview.tsx` | AI panel is a dashed "unverified" card; notices use the shared `Notice` (still `role="status"`); photo + AI column is sticky beside the form on wide screens. |
| `components/PhotoUpload.tsx` | The file input is `sr-only` inside a large labelled drop area with a camera icon and a spinner while preparing/uploading. Same accepted types, same messages, same `role="status"` text. |
| `components/LinkVerification.tsx` | Loading line with a spinner, styled outcome and "needs your attention" panels. Same states and copy. |

## Checks run

`pnpm vitest run tests/intake`: 28 files passed, 871 tests passed, 3 skipped (unchanged count).

## Ask

Review the diff of the four files above on `feat/ui-redesign`. If you prefer, cherry-pick only `VerificationForm.tsx` and `DraftReview.tsx`; the page-level redesign does not depend on the other two.
