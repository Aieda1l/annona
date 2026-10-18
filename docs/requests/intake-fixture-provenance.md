# Request: relax the fixture provenance rule for the hackathon

- **From:** Dev 1 (`feat/intake-gemini`)
- **To:** integration captain (Dev 4)
- **Type:** shared doc change (`docs/TEST_PLAN.md` §7, rule 1; possibly `docs/DECISIONS.md`); not a contract change
- **Status:** proposed; Dev 1 has decided to use the images below and is asking the captain to align the shared docs

## Current rule

`docs/TEST_PLAN.md` §7, "Image provenance rules": images must be team-taken at the event, or CC0 with a source URL. Rule 3 requires `fixtures/intake/PROVENANCE.md` to list who made each file, when, and its license.

## What happened

Dev 1 supplied eight eval images (T-PE-01..08). Seven appear to be web-sourced stock or marketing photos; no source URL or license was recorded. One (`non_food.jpg`) appears to be a team photo of a desk. Dev 1 decided the provenance rule does not need to be met for the hackathon. `PROVENANCE.md` now records the real status ("supplied by Colin; source not recorded; license unverified") instead of claiming original work.

## Ask

1. Amend rule 1 of `TEST_PLAN.md` §7 to say what the team actually decided, for example: "Eval images may be web-sourced for the hackathon; record what is known, do not claim original work, and replace before any use beyond the demo."
2. Keep the content rules (no faces or people, no real brand labels beyond incidental marks, no addresses, phone numbers or license plates) and keep treating every committed image as public.
3. Decide whether a `DECISIONS.md` entry is wanted.

## Risk to weigh

The repo is public from kickoff (D-023) and these images are committed to it. Some appear to be commercial marketing photos, so publishing them is a copyright exposure and may matter for Devpost and judging. The unverified licenses should be mentioned if anyone asks. The fix is to swap in team-taken photos; the eval runner needs only the same file names.
