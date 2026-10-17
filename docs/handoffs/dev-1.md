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
