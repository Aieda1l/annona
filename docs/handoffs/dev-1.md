# Dev 1 handoff log — Vision + donor intake (`feat/intake`)

Append-only. Newest entry last.

## 2026-10-17 — SP-4 and SP-14 kickoff spikes

Scripts and raw outputs stayed outside version control (`.spikes-local/`, excluded via `.git/info/exclude`). No credentials were printed, logged or saved.

**Setup:** `@google/genai@2.30.0` in Vertex AI mode, Application Default Credentials, no API key. Project `annona-511918`. Prompt asked for a JSON description, with every observation treated as unverified. One `models.generateContent` call per file, `responseMimeType: "application/json"`.

| Test | Input | Model | Location | MIME sent | Latency | Status | JSON |
|---|---|---|---|---|---|---|---|
| SP-4 (first try) | synthetic drawing | `gemini-3.5-flash-lite` | `us-central1` | image/jpeg | 4051 ms | **404 NOT_FOUND** ("Publisher model ... not found or your project does not have access to it") | n/a |
| SP-4 | synthetic drawing, 36,203 B | `gemini-3.5-flash-lite` | `global` | image/jpeg | 5176 ms | OK | PARSED |
| Real-food check (not a spike item) | team member's own photo, 108,046 B | `gemini-3.5-flash-lite` | `global` | image/jpeg | 7073 ms | OK | PARSED |
| SP-14 JPEG | Photon-downloaded file, unchanged, 41,497 B | `gemini-3.5-flash-lite` | `global` | image/jpeg | 4773 ms | OK | PARSED |
| SP-14 HEIC | Photon-downloaded file, unchanged, 1,456,484 B | `gemini-3.5-flash-lite` | `global` | image/heic | 5444 ms | OK | PARSED |

**Verdicts:** SP-4 VERIFIED. SP-14 HEIC_ACCEPTED (original bytes, no transcoding). SP-14 JPEG ACCEPTED. Photo intake: GO.

**Caveats:**
- MIME types were taken from file magic bytes (`ffd8ffe0` JFIF; `ftypheic`), not from the MIME type Photon reported. Dev 3 has not confirmed the reported value.
- Each spike was a single call per file. Latency and reliability are not characterized.
- Model output is unverified AI observation. The JPEG sample listed eight separate "dinosaur chicken nugget" entries, so the draft step needs de-duplication or counts.

**Contract/design discrepancies for the captain (no `docs/requests/` file filed yet):**
1. D-012 and the Dev 1 prompt assume an AI Studio key (`GEMINI_API_KEY`, `apiKey` passed explicitly). The spikes used ADC on Vertex instead. The adapter needs an auth-mode decision.
2. On Vertex, `gemini-3.5-flash-lite` returned 404 at `us-central1` and worked at `global`. If Vertex is chosen, location must be configurable and default to `global`.

**Blockers + safety risks:** none new. No real donor or recipient data was used.

**Next smallest action:** captain decision on Vertex/ADC vs AI Studio key; meanwhile start slice 1 (fake vision + parsing, RED tests first).

## 2026-10-17 — Gemini adapter (branch `feat/intake-gemini`, not pushed)

**Delivered (local):** `src/lib/ai/gemini.ts` (`createGeminiProvider({ client, model })`), `src/lib/ai/prompts/annona-intake.v1.md` (draft, never run against an evaluated set), factory wiring (`createVisionProvider` builds `new GoogleGenAI({ apiKey })` when a key is set; no key means `misconfigured`, no client). Response schema is the contract `VisionModelOutput` via `z.toJSONSchema`, passed as `responseJsonSchema`.

**Tests:** `tests/intake/gemini.test.ts` (40, injected fake client, no network), updated `tests/intake/factory.test.ts` (SDK mocked), `tests/intake/prompt-examples.test.ts`.

**Real evidence (T-IN-10, manual):** `GEMINI_SMOKE=1` run through Vertex AI with ADC (no API key), model `gemini-3.5-flash-lite`, location `global`, project redacted here. Two fixtures, both `ok` and schema-valid, 1.9 s and 2.0 s. The API reported `modelVersion` `gemini-3.5-flash-lite`. The `apiKey` client path in the factory is **UNVERIFIED against the real API** (no key is stored on this machine); it is covered only by a mocked-SDK test asserting `new GoogleGenAI({ apiKey })`.

**Caveats:**
- Fixture images are abstract placeholder drawings, so the model's descriptions (for example `not_food` for the buffet drawing) say nothing about prompt quality. T-PE-01..08 need real synthetic photos and have not been run.
- 15 s timeout exists in both the service race and the adapter; the adapter also aborts the underlying request.
- The prompt file is read from disk at runtime: see `docs/requests/intake-prompt-file-tracing.md`.

**Next smallest action:** make real synthetic eval photos, write `src/lib/ai/eval.ts` runner, push the adapter PR after CP2.

## 2026-10-17 — Eval runner (`pnpm eval:intake`, branch `feat/intake-gemini`)

**Delivered (local):** `src/lib/ai/eval-cases.ts` (T-PE-01..08 catalog, U1-U4/M1-M4 scoring, T-PE-01 tolerates recall in 2 of 3 runs), `src/lib/ai/eval-report.ts` (PROMPT_EVAL §10 records and a console table), `src/lib/ai/eval.ts` (CLI: `--runs`, `--cases`, `--out`). `VISION_PROVIDER=gemini` runs the real model with `GEMINI_API_KEY` or, without a key, Vertex AI with ADC via `GOOGLE_CLOUD_PROJECT`; asking for `gemini` without either exits 2 and never falls back to fake. Fake runs are labeled a harness check and recorded as `not_run`.

**Tests:** `tests/intake/eval-score.test.ts` and `eval-report.test.ts` (33, scoring and formatting only, no model).

**Run once as a shake-down (not logged in PROMPT_EVAL §11):** fake harness: T-PE-01/02/04 pass, 5 cases not run (fixtures missing). Real model via Vertex ADC on the abstract placeholder drawings, 1 run: T-PE-02 and T-PE-04 pass, T-PE-01 fails on "a question about spreads or fillings" because the drawing is not recognizable as sandwiches. That failure reflects the placeholder image, not the prompt.

**Blocked on:** real synthetic photos for `dessert_bars`, `non_food`, `sushi_tray`, `packaged_label`, `injection_note` (and better `sandwich_platter`, `buffet_ambiguous`, `blurry`), per `fixtures/intake/PROVENANCE.md` rules. No prompt version can pass the release rule until all eight cases run.

## 2026-10-17 — First full eval run, and an image provenance problem

Eight images were supplied (`~/Downloads/annona-images`). They look like web-sourced stock or marketing photos: no camera metadata, no source or license information, `sushi_tray` is a PNG named `.jpg`, and `non_food` shows two people, cars and an identifiable campus street. **They are not committed** because they do not meet the provenance rules (team-taken, or CC0 with a source URL; the repo is public). Resized copies (never upscaled, max 1024 px) live in the git-excluded `.spikes-local/eval-images/`. `pnpm eval:intake --images-dir <dir>` evaluates them locally.

Result (Vertex ADC, `gemini-3.5-flash-lite`, 3 runs per case): 5 pass, 3 fail (T-PE-02, 03, 06). Details and the candidate v2 changes are in `docs/PROMPT_EVAL.md` §11. Not a release run.

**Needs a decision:** (1) get committable images (team-taken or CC0 with source URLs) for all eight cases, including a genuinely cluttered buffet and a desk-objects non-food photo with no people; (2) approve the v2 prompt edits.

## 2026-10-17 — Fixtures committed; v1 at 6 of 8

Dev 1 chose to use web-sourced images despite the provenance rule. All eight eval images are now in `fixtures/intake/images/` (resized, never upscaled), with `PROVENANCE.md` stating their real status and `docs/requests/intake-fixture-provenance.md` asking the captain to align `TEST_PLAN.md` §7. `non_food.jpg` is now a desk photo (no people); `dessert_bars.jpg` is blondies.

Full eval on the committed fixtures (Vertex ADC, `gemini-3.5-flash-lite`, 3 runs per case): **6 pass, 2 fail**. T-PE-02 fails on a fixture mismatch (the buffet photo is tidy) plus a prompt false positive (the "text instructions were ignored" note fires on benign table signs). T-PE-06 fails on one run with no shellfish listed or noted for sushi. Details in `docs/PROMPT_EVAL.md` §11. One of nine T-PE-03 runs timed out at 15 s; it did not recur.

**Next smallest action:** draft `annona-intake.v2.md` (narrow the injection-note rule; add nuts and shellfish rules), rerun all eight, then open the adapter PR after CP2.

## 2026-10-17 — Second buffet image, multi-image cases, and a latency finding

`buffet_ambiguous.jpg` is now a crop of the buffet photo (covered and opaque dishes); `buffet_ambiguous_2.jpg` (steam-table line) was added. The eval runner supports several images per case (`EvalCase.fixtures`), so T-PE-02 keeps its ID and runs both. Result: T-PE-02 1/6, T-PE-06 1/3, the other six cases pass 3/3.

**Decisions needed:** (1) T-PE-02: neither image is truly unidentifiable, and "every dish low confidence" fails whenever anything is identifiable. Pick: a genuinely unidentifiable photo, v2 guidance on what `confidence` means, or (deliberately) a different criterion. (2) Latency: occasional stalls (24 s, one no response in 60 s; about 5 of 100 calls over 15 s) cost drafts via the 15 s timeout. Consider a shorter timeout with one retry; the contract and D-012 would need to agree.

**Next smallest action:** draft `annona-intake.v2.md` (narrow the injection-note rule; add nuts, shellfish and confidence-meaning guidance) and rerun.

## 2026-10-17 — v2 prompt, adapter retry, third buffet image

**Delivered (local):** `annona-intake.v2.md` (confidence per named dish, narrowed ignored-text note, nuts and shellfish rules); the adapter now retries once on retryable provider failures (two 7 s attempts keep the 15 s total from D-012; never for safety blocks, 4xx or bad output) and reports each attempt through `onAttempt`; prompt versions selectable (`promptVersion`, `--prompt-version`; default stays v1); `buffet_closed.jpg` added to T-PE-02 (it carries a stock watermark, noted in PROVENANCE).

**Result:** v1 and v2 each pass 5 of 8 on identical fixtures. v2 fixes the buffet crop (3/3 vs 1/3) and shellfish (10/10 vs 1/10) but regresses on the blurry photo (rated `usable` 3 of 10 times; v1 was 10 of 10 `poor`). Details and a comparison table in `docs/PROMPT_EVAL.md` §11.

**Decisions needed:** (1) remove `buffet_ambiguous_2` from T-PE-02: the model is right to call the visible fried rice `high`, so the case cannot pass for a correct model. (2) Approve a v3 draft: restore the blurry-photo behavior (move or strengthen the poor-photo rule), have `not_food` photos use "No food is visible in the photo.", and add a sauces-and-seasonings rule for soy and wheat. v3 is a new file and a new full run.

## 2026-10-17 — v3 prompt; `buffet_ambiguous_2` dropped

`buffet_ambiguous_2.jpg` is out of T-PE-02 and out of the repo (local copy kept). T-PE-02 now runs the crop and `buffet_closed`; v2 and v3 both pass it 6/6.

**v3 written** (`annona-intake.v3.md`): poor-photo rule first and broader, fixed `not_food` note, sauces rule (soy, wheat), a blurry-photo example. It fixes the blurry-photo regression (10/10 `poor`) and soy recall (10/10) but shellfish for sushi fell to about 50%. Current full-eval scores on the same fixtures: v2 7/8, v3 6/8. No version passes all eight, and the default stays v1 in code.

**Decision needed:** the rules are crowding each other. Options: (a) try `gemini-3.8-flash` with v3; (b) a v4 that merges the allergen rules into one checklist; (c) accept v2 or v3 for the demo as advisory-only (the donor verifies everything and the AI never fills a fact) and stop tuning. Stalls also cluster (2 of 3 runs in one eval); the retry rescued them.

## 2026-10-17 — Escalation to gemini-3.8-flash (built; measured; recommend off for the demo)

**Delivered (local):** the adapter asks `gemini-3.8-flash` (once, LOW thinking, inside the existing 14 s budget) when the first answer is for a `usable` photo with no dish above `low`. A failed second call keeps the first answer; the second answer passes the same strict parse and claim-word guard; a stored suggestion's `model` shows which model answered. `GEMINI_ESCALATION_MODEL` unset = on; `off` disables. Eval runner: `--escalation-model <id|off>`; records show `escalated` and the answering model. Request filed for the env surface: `docs/requests/intake-escalation-env.md`.

**Measured (T-PE-02, 20 runs per configuration):** v2 off 20/20, on 18/20; v3 off 19/20, on 13/20. Latency p50 about 2 s off, 6-7 s on, p95 up to about 14 s. 3.8-flash at the default thinking level took 8-37 s; at LOW 2.6-4.6 s (MINIMAL is rejected). Escalation fires almost only on the deliberately ambiguous buffet photos and does not improve the outcome there.

**Decision (Colin): keep it on for the demo.** `GEMINI_ESCALATION_MODEL=off` is the switch if it causes trouble. Details: `docs/PROMPT_EVAL.md` section 13.

## 2026-10-17 — T-IN-08 and T-IN-12 verified against the real gate

`evaluateEligibility` is real on `main`, so the two items marked UNVERIFIED are now verified: `tests/intake/real-gate.test.ts` runs the facts the intake service sends to core through the real gate (all-unknown allergens give `needs_review` with `ALLERGEN_UNKNOWN` for all nine; AI-listed allergens never fill donor statuses; an unknown sesame the AI omitted stays unknown; `edited_from_ai` is provenance only and the gate has no parameter for it). The T-IN-12 `it.todo` is now a real test in `verification-form.test.tsx`: a form submitted with only the required fields evaluates to `needs_review`. A mutation (AI-listed allergens leaking into donor facts) makes the test fail. Still UNVERIFIED: T-IN-08 against real core persistence (needs Rui's 2(a)).

## 2026-10-17 — T-IN-13: LinkVerification and /api/verify/* (against a core double)

**Delivered (local):** `LinkVerification` (reads the token from the URL fragment; sends it only in POST bodies, never in a URL or the DOM; loads the view and the photo; renders the same `DraftReview` and `VerificationForm` with every answer starting at `unknown`; shows a thank-you, or the gate reasons, after submit; swaps to `resubmit_token` on `needs_review` and keeps what the donor typed; one uniform "expired or already used" state). `src/features/intake/http/verify.ts` (`VIEW`, `IMAGE`, `SUBMIT`, via `createVerifyHandlers`): token-only authorization, strict bodies, size caps, no session read and no cookie, `Cache-Control: no-store` and `Referrer-Policy: no-referrer` on every response, any core `NOT_AUTHORIZED` or `NOT_FOUND` becomes the same 403 with the contract's message, image served only for image MIME types with `nosniff`. Service: `getLinkVerification`, `getLinkVerificationImage`, `submitDonorVerificationByLink` (parses facts first, so a schema-invalid body makes no core call and the link stays live; same `edited_from_ai` as the web path; a failed refresh of the new link never turns a successful submit into an error). Barrel exports are real now.

**Evidence:** 50 new tests (`link-service`, `http-verify`, `link-verification`), core double extended with link functions. Full suite 1512 passed, 28 skipped; typecheck clean; lint 0 errors; `pnpm build` ok.

**UNVERIFIED:** nothing here has run against real core: `getVerificationLinkView` is still a stub on `main` (Rui's 2(d), due about 7:00 PM). Wire and re-run when it lands. The `/v` page (Dev 4) mounts `LinkVerification` with no props, which now works.

## 2026-10-17 evening: PR #5 review follow-ups (worktree-intake-followups)

- Claim guard widened (parse.ts + PROMPT_EVAL U3): unhyphenated `<allergen> free`, `no/without/zero <allergen>`, `best before/by`, `expire(s)`, `vegan`, `hypoallergenic`, `kept chilled/...`, `fahrenheit/celsius`. Ordinary uncertainty wording still passes (tests).
- `service.ts` re-parses provider results with `VisionSuggestion` and requires `mode` to equal the provider's mode (else `AI_OUTPUT_INVALID`).
- Servings must match `/^\d+$/` (`1e2`, `0x10` rejected); `readJson` checks `content-length` before buffering.
- Evidence: typecheck clean; lint 0 errors (1 existing warning in Dev 4's test); vitest 1591 passed, 28 skipped. Not done: a11y, PNG alpha, ImageBitmap close, magic-byte sniff, real-core integration (Rui's 2(a)/2(d) still stubs on origin/main at 16:20).
- **T-IN-10 API-key path VERIFIED (2026-10-17 16:26 PDT):** `GEMINI_SMOKE=1` with a free-tier AI Studio key (from macOS Keychain, never printed): 2 of 2 passed, `gemini-3.5-flash-lite`, `auth: api_key`, `usable` photos, 2.97 s and 2.21 s, schema-valid and guard-clean, escalation not triggered (requested model = returned model). An earlier run with a key from a project without the Generative Language API enabled got HTTP 403 and failed closed (`PROVIDER_UNAVAILABLE`, non-retryable). Free tier: rate limits apply; evals not run on this key.

## 2026-10-17 evening: PR #30 review (Dev 4) follow-ups

- **Eval photos out of the PR (D-040).** The nine web-sourced photos are removed from the net diff; `sandwich_platter`, `buffet_ambiguous` and `blurry` are back to `main`'s team-made drawings, so everything the fake provider hashes and every committed image is team-made CC0. Local copies are in `fixtures/intake/eval-local/` (gitignored here and by #32). `pnpm eval:intake` defaults to that directory and skips a case whose photos are absent; the gated smoke test throws a message naming the missing file. `PROVENANCE.md` rewritten. The photos remain in this PR's earlier commits on the public remote (D-040 limit). PROMPT_EVAL results used the local photos and are not reproducible from a clean checkout.
- **Failing test.** `link-verification.test.tsx` built the image response from a jsdom `Blob`; Node's `Response` only recognizes its own `Blob` class, and what it does with a foreign one varies by Node version (on Node 26 it stringifies to `[object Blob]`). The test now builds the response from bytes. It passed on macOS before and after (Node 26.12), so **the Windows failure (Node 22.23.2) is not reproduced and the fix is UNVERIFIED there**; Dev 4 please rerun.
- **Duplicate handoff file** `dev-1-agent-handoff.md` removed from the PR (kept locally in `.spikes-local/`).
- **Test gap:** the misconfigured stub now asserts `retryable:false` and no SDK call. The other three tests the review lists already exist: escalated answer that fails parse or carries a claim word (`gemini.test.ts`, "keeps the first answer when the escalation fails"), provider `mode:"fake"` under a real service (`service.test.ts`, "a suggestion whose mode differs"), non-donor role makes no service call (`http-drafts.test.ts`, "rejects the %s role").
- **Deferred, owner Dev 1, required before a real key goes into a shared or deployed environment:** idempotency key / `source_ref` on web drafts (a repeat can cost up to 3 paid calls), magic-byte sniff before the paid call, and gating `fixture_id` on demo mode. Not in this PR. Also deferred: capping `model`, URL and control-character rejection in free-text fields, a per-donor drafts-per-minute cap. Escalation env in `getEnv()` after #32 merges.

## 2026-10-17 evening: HEIC_ACCEPTED = true (feat/intake-heic)

Flipped per CONTRACTS §9.3 on the SP-14 result above (real Photon-downloaded HEIC, 1,456,484 B, parsed by `gemini-3.5-flash-lite`). Intake now accepts `image/heic|heif` from `messaging` only, 5 MB cap. **Not yet end to end:** core `storeDonationImage` still refuses HEIC (request: `docs/requests/intake-heic-core-allowlist.md`), and the stored HEIC may not render in non-Safari browsers. Dev 3's `photo.ts` passes Photon's content-type through unfiltered and does not sniff.

## 2026-10-17 evening: Cyrus's #30 re-review items (feat/intake-gating)

- **`fixture_id` gate (HIGH):** `POST /api/intake/drafts` refuses `{ fixture_id }` with `NOT_FOUND` unless the provider is `fake` or `ANNONA_DEMO_MODE=1`. With `VISION_PROVIDER=gemini`, the demo needs `ANNONA_DEMO_MODE=1` for fixture drafts. Normal web uploads are unaffected. Workflows and the simulated phone call `createDraftFromImage` directly, not this route.
- **Magic bytes (HIGH):** core's `storeDonationImage` checks the declared type against the first bytes and runs before vision. `tests/intake/real-core.test.ts` now proves an HTML file labelled `image/jpeg` is refused (`VALIDATION_FAILED`), vision is not called and no draft row is left.
- **Paid-call multiplication (MEDIUM):** web and fixture drafts have no `source_ref` (CONTRACTS §3.2), so `createIntakeService` shares the in-flight result per donor, source and photo bytes. Nothing is reused after it settles (review: a stored card went stale after verification or a demo reset), so a repeat after completion is a new draft and a retry after a failure runs at once. Messaging stays on core's `source_ref` idempotency. The cache is in memory per server instance (one process in the demo; serverless instances do not share it). A durable key would need a contract change.
- **Tests added:** gate (4), dedupe (8), non-donor with the real service triggers no vision call or store (3), empty `possible_allergens` leaves every allergen `unknown` with no hint, magic-byte case above. Two of the review's "missing tests" already existed (escalated answer with a claim word or unusable output keeps the first answer; misconfigured real provider returns `PROVIDER_UNAVAILABLE`, `retryable: false`, `mode: real`). Mode mismatch under a real service is in `service.test.ts`.
- **Not done (LOW):** cap and sanitize `model`, reject URLs and control characters in free text, per-donor drafts-per-minute cap.
- Deployment: `GEMINI_API_KEY` on the host is still to be set by the captain.

## Notes for the next agent session (replaces the separate agent handoff file)

- Read `CLAUDE.md`, then this file. Lane: `src/features/intake/**`, `src/lib/ai/**`, `tests/intake/**`, intake prompts and fixtures; propose cross-lane changes in `docs/requests/`.
- `pnpm` is not installed on Colin's machine: use `npx -y pnpm@10.33.3 <cmd>` (`typecheck`, `lint src tests`, `vitest run`, `eval:intake`). Bare `pnpm lint` trips on `.claude/worktrees` and `.spikes-local`.
- Shell is zsh: an unquoted variable holding several words is not split. macOS `sed` is BSD (`sed -i ''`); prefer the Edit tool or Python.
- Before every push run the canonical secret scan in `docs/ARCHITECTURE.md` section 9. Never commit `.env*`, keys, or `.spikes-local/`.
- Gemini auth: production uses an API key. Colin keeps a free-tier AI Studio key in the macOS Keychain (item `annona-gemini`, read inside a script, never printed); be conservative with calls. Local evals can use Vertex AI with gcloud ADC (`location=global`).
- Real-model calls stall occasionally; the adapter retries once. Evals are noisy (3 runs vary by 1 to 2 cases). No prompt version passes all eight cases; the default stays v1.
- Eval photos live in the gitignored `fixtures/intake/eval-local/` (D-040); the eval and smoke tests skip when they are absent.
- Open: link-path real-core tests wait on Dev 2's 2(d); HEIC works in intake but core's `storeDonationImage` still refuses it (`docs/requests/intake-heic-core-allowlist.md`).
