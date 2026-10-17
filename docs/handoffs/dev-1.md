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
