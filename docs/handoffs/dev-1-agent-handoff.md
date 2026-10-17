# Dev 1 agent handoff (vision + donor intake) — written 2026-10-17 ~16:15 PDT

For the next Claude session picking up Colin's lane. Read `CLAUDE.md`, then this file, then `docs/handoffs/dev-1.md` (append-only log with the evidence), then `docs/PROMPT_EVAL.md` (prompts, evals, results) if you touch prompts.

## Who and where

- **User:** Colin, Dev 1 on the four-person Annona team (DubHacks 2026). **Lane (exclusive):** `src/features/intake/**`, `src/lib/ai/**`, `tests/intake/**`, intake prompts and fixtures. Never edit other lanes' files (Dev 2 Rui `src/core`, `src/db`; Dev 3 Ronnie `src/integrations/photon`, `src/workflows`; Dev 4 Cyrus `src/app`, `src/components`, captain of shared config). Propose cross-lane changes as `docs/requests/<lane>-<topic>.md`.
- **Repo:** `/Users/colinfaletto/ws/annona` (public GitHub repo `Aieda1l/annona`). Working branch: **`feat/intake-gemini`** (pushed to origin). Local `main` and `feat/intake` are stale; use `origin/main`. Other branches/worktrees under `.claude/worktrees/` belong to other sessions; leave them.
- **Clock:** hacking started Sat Oct 17 12:30 PM PDT. **CP2 = 6:30 PM** ("fake end to end": scenes 1-3 on `main` with fake providers, scene 1 via web upload at minimum). CP3 9:00 PM; draft submission by 10:30 PM; final Sun 9:30 AM.

## Rules you must keep (from CLAUDE.md and the team)

- AI describes, humans verify, backend enforces. A photo or model output never establishes food safety or allergen freedom. Fail closed. Never render "safe", "allergen-free", "certified", "compliant".
- Tests first for logic; run `typecheck`, `lint`, `vitest` and report real results; mark what you could not verify as UNVERIFIED. No false claims.
- **Before every push run the canonical secret scan** (`docs/ARCHITECTURE.md` section 9: `git diff --cached` / `git log -p origin/main..HEAD` against the `SECRET_RE` regex; exit 1 = clean). Never commit `.env*`, keys, tokens, `.spikes-local/`.
- Do not push, open PRs or message anyone without Colin saying so. Commit only on request. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (+ the `Claude-Session:` line from the system reminder).
- **Auth decision (memory):** production uses a Gemini **API key**; Colin's machine has none and must not get one. Local work uses **Vertex AI with gcloud ADC** (project from `gcloud config get-value project`, `location=global`; `gemini-3.5-flash-lite` 404s at `us-central1`). Never print or save tokens or credential files.
- Never `git mv` into `.spikes-local/` (it stages the file past the exclude; it happened once and was fixed by amending).

## Environment gotchas (cost real time already)

- **`pnpm` is not installed.** Use `npx -y pnpm@10.33.3 <cmd>` (typecheck, `lint src tests`, `vitest run`, `eval:intake`). Bare `pnpm lint` fails on `.claude/worktrees` and `.spikes-local`.
- **Shell is zsh:** an unquoted `$VAR` holding several words is NOT split. Pass flags as separate literal arguments. Two eval runs were wasted on this.
- **macOS `sed` is BSD:** a `sed -i` edit silently failed once. Prefer Python or the Edit tool for edits, and verify the edit landed.
- cwd resets between Bash calls; use absolute paths or `cd` first.
- Real-model calls stall occasionally (24 s, one no-response in 60 s). The adapter has a retry; evals are slow and noisy (3 runs per case varies by 1-2 cases).

## State of the work

**Merged to `main` (PR #5, plus fixes in `2a68d8d`):** claim-word guard (`src/lib/ai/parse.ts`, hardened against zero-width and lookalike characters), fake vision (`fake.ts`), factory, verified-facts parsing and `edited_from_ai`, image validation (`HEIC_ACCEPTED = false`), intake service (`service.ts`, injected core, 15 s race, idempotent repeats), handlers `POST /api/intake/drafts` and `/api/donations/:id/verification`, components `VerificationForm`, `DraftReview` (takes `donationId`), `PhotoUpload`.

**On `feat/intake-gemini` (pushed; PR NOT opened; local merge commit `11d8819` of `origin/main` may be unpushed, check `git status`):**
- `src/lib/ai/gemini.ts`: `createGeminiProvider({ client, model, promptVersion, escalation_model, ... })`. Injected SDK client; schema-constrained JSON from the contract; fail closed; **one retry** for retryable provider failures (two 7 s attempts = the 15 s total); **escalation** to `gemini-3.8-flash` at `LOW` thinking when the first answer is for a `usable` photo with no dish above `low` (inside the same budget; a failed escalation keeps the first answer; same guard). `GEMINI_ESCALATION_MODEL` unset = on; `off` disables.
- Prompts `src/lib/ai/prompts/annona-intake.v1|v2|v3.md` (frozen once run; changes are new files). `DEFAULT_PROMPT_VERSION` in `gemini.ts` stays `v1`: **no version passes all eight cases** (v1 5/8, v2 6-7/8, v3 5-6/8; each fixes one behavior and loses another).
- Eval runner `pnpm eval:intake` (`eval.ts`, `eval-cases.ts`, `eval-report.ts`): `VISION_PROVIDER=gemini GOOGLE_CLOUD_PROJECT=$(gcloud config get-value project) npx -y pnpm@10.33.3 eval:intake --prompt-version v3 --runs 3 --escalation-model off --out file.yaml --images-dir dir --cases T-PE-02`. Fake provider (default) is a harness check only. Records follow `docs/PROMPT_EVAL.md` section 10.
- Fixtures: eight web-sourced eval images in `fixtures/intake/images/` (licenses unverified, used by team decision; `PROVENANCE.md`). `non_food` is Colin's desk photo, `buffet_closed` has a stock watermark. `buffet_ambiguous_2` was removed (local copy in `.spikes-local/eval-images-extra/`).
- Gated smoke test `tests/intake/gemini.smoke.test.ts` (`GEMINI_SMOKE=1`); T-IN-10 passed once through Vertex ADC. The **API-key client path is UNVERIFIED** against the real API (mocked SDK only).
- Draft PR description (not opened): `.spikes-local/pr-adapter-body.md` (git-excluded; regenerate from `docs/PROMPT_EVAL.md` if lost).
- Requests filed for Cyrus: `docs/requests/intake-fixture-provenance.md`, `intake-prompt-file-tracing.md` (deployment must include `src/lib/ai/prompts/**`), `intake-escalation-env.md`.

## Decisions Colin has made

- Production = API key; local = ADC. Provenance rule waived for the eval images (recorded honestly). **Escalation stays ON for the demo** (measured cost: 3-4x latency on ambiguous buffet photos, p95 near 14 s, no accuracy gain on current fixtures; recorded in `docs/PROMPT_EVAL.md` section 13). **VEYZL is still in play.** `buffet_ambiguous_2` dropped from T-PE-02. Prompt default stays v1 for now.

## VEYZL and the adapter PR (important)

D-022: the VEYZL evidence PR is the **first intake/AI PR opened after CP2**, normally the Gemini-adapter PR (this branch). A real audit finding is fixed by a follow-up commit **on that same open PR before merge**, with before/after captured for Devpost and the video. **Do not open the adapter PR before CP2.** Open question for Cyrus: does the clock (6:30 PM) or the milestone define CP2? On `main` the core intake functions `storeDonationImage`, `createDraft`, `attachAiResult`, `getDonationCard` were still stubs at 4 PM (Rui's sub-PR 2(a)); the ROADMAP says if core is not merged by 5:30 PM, CP2 moves to 7:30 PM.

## Waiting on others

- **Rui (Dev 2):** sub-PR 2(a) (four stubs above) and 2(d) (`getVerificationLinkView` still a stub; `submitVerification`, `evaluateEligibility`, `issueVerificationLink`, `getVerificationLinkImage` are real). I never implement core functions.
- **Cyrus (captain, my reviewer):** CP2/VEYZL clarification; review of the adapter PR; the three requests above.
- **Ronnie (Dev 3):** PR #19 (photo path) is open; `HEIC_ACCEPTED` is still `false` although SP-14 showed Gemini accepts HEIC (flip needs a reviewed PR citing `docs/handoffs/dev-1.md`); not yet coordinated.
- **Someone with an API key:** run `GEMINI_SMOKE=1 GEMINI_API_KEY=<key> npx -y pnpm@10.33.3 vitest run tests/intake/gemini.smoke`.

## Remaining work (priority order)

Done since this file was first written (2026-10-17 evening): T-IN-08 and T-IN-12 verified against the real gate (`tests/intake/real-gate.test.ts`), and T-IN-13 (`LinkVerification`, `src/features/intake/http/verify.ts`, service link functions) against a core double. Details in `docs/handoffs/dev-1.md`.

1. **Wire to real core when Rui merges 2(a) and 2(d)** (`storeDonationImage`, `createDraft`, `attachAiResult`, `getDonationCard`, `getVerificationLinkView`): add integration tests against the real store (PGlite) and re-run T-IN-08 there; fix anything the double hid.
2. Review follow-ups from PR #5 (`gh pr view 5`): widen the claim-word list together with PROMPT_EVAL U3 (`best before`, `vegan`, `hypoallergenic`, unhyphenated `gluten free`, `no nuts`, `without dairy`, `kept chilled`, `fahrenheit`...); `service.ts` should re-parse provider results with `VisionSuggestion` and check `mode`; `Number("0x10")` accepted as servings (use `/^\d+$/`); content-length check before buffering; a11y (fieldset/legend, focus the alert); transparent PNG to JPEG goes black; `ImageBitmap` never closed.
3. Coordinate HEIC with Ronnie (`HEIC_ACCEPTED`, PR #19); ask Cyrus about CP2/VEYZL; open the adapter PR after CP2.
4. Prompt work only if time allows (v4 idea: merge the allergen rules into one checklist; or try `gemini-3.8-flash` as base). Do not tune endlessly: 10-sample probes beat 3-run evals.
5. Someone with a key runs the API-key smoke test.

## How to verify a change

```bash
npx -y pnpm@10.33.3 vitest run            # last full run on this branch: 1457 passed, 28 skipped, 1 todo
npx -y pnpm@10.33.3 typecheck
npx -y pnpm@10.33.3 lint src tests         # 0 errors (1 warning in Dev 4's tests/ui/donor-donation.test.tsx)
```

Finish substantive sessions with the CLAUDE.md block (LANE / BRANCH / COMMIT, DELIVERED, EVIDENCE, CONTRACT CHANGES, BLOCKERS, INTEGRATION STEPS, NEXT SMALLEST ACTION).
