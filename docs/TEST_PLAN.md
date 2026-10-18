# TEST_PLAN.md — Annona test catalog, coverage and evidence (PROPOSED)

> **Status (2026-10-15, pre-event): no code and no tests exist. Every test below is PLANNED. Nothing has been run.** DubHacks Rule 10 forbids coding before Sat Oct 17, 12:30 PM PDT (`docs/RESEARCH.md` R-DH-3; `docs/DECISIONS.md` D-002).
> **Owner:** integration captain (Dev 4). This is a captain-controlled shared doc (`docs/OWNERSHIP.md` §2). Each test has one lane owner (`docs/MVP_SCOPE.md` §2). Lanes record results in `docs/handoffs/dev-N.md` and PR bodies; the captain folds verified results into §9.
> **IDs:** canonical (shared ID catalog). Field, state, reason, function and route names follow the **current** `docs/CONTRACTS.md` (its header holds the only version number). The v0.4 review (D-031..D-034) added T-IN-13, T-CO-30, T-CO-31, T-MS-18, T-MS-19, T-UI-07 and T-E2E-06, made T-CO-17 required, introduced the must-run tier (§5.0), and revised T-IN-09, T-CO-14, T-CO-15, T-CO-28, T-MS-05, T-MS-15, T-MS-16, T-UI-01, T-UI-03 and T-E2E-01. The v0.3 review (D-029) extended T-CO-12, T-CO-13, T-CO-23, T-CO-25, T-CO-28 and T-MS-03. The v0.2 review added T-IN-11, T-IN-12, T-CO-28, T-CO-29, T-MS-16, T-MS-17 and T-CT-02 and revised T-CO-01/11/19/22, T-MS-04/05/14/15 and T-UI-04. T-CO-25..T-CO-27 cover result codes the original catalog left untested (§6).
> **Safety framing:** `eligible` means eligible for dispatch under the prototype operator policy, based on donor-attested records. No test asserts, and no test name implies, that food is safe, allergen-free, compliant or certified. **No fixture, scene or test name may contain the word "safe"**: the scene-1 facts fixture is `scene1_eligible_facts` ("policy-eligible demo facts").

---

## 1. Principles

- **Test the invariants that protect people first.** Gate, unknown handling, claims, expiry, post-claim time checks, opt-out, idempotency and authorization get RED-first tests (CLAUDE.md workflow step 3).
- **Server time only.** Every time-dependent test injects `createTestClock(start)` (CONTRACTS §9.1) through the optional trailing `deps` argument (CONTRACTS §9.0) and advances it. `tick()` takes no time argument; it reads the injected `Clock`. No real sleeps. No client timestamps.
- **Dependency injection, not monkey-patching.** Tests pass `deps: { store, clock, messaging, vision }` explicitly. Lanes import other lanes only through their barrels (`@/core`, `@/db`, `@/workflows`, …) and use local test doubles until the real function merges (OWNERSHIP §3).
- **Offline by default.** `pnpm test` uses fake providers and PGlite. It needs no network, no Docker and no secrets.
- **Gated tests are visible.** A test that needs `TEST_DATABASE_URL`, `GEMINI_API_KEY` or Photon credentials **skips with a printed reason**. A skip is recorded as **UNVERIFIED**, never as PASS.
- **One test ID per behavior.** Put the ID first in the test title (e.g. `T-CO-16 race: exactly one claimed`) so `grep` maps results to this catalog.
- **No false claims.** A mocked phone screenshot is not Photon evidence. A fake vision output is not Gemini evidence. A `misconfigured` provider is never silently replaced by fake.

## 2. Strategy by level

| Level | What runs | Where | Default suite? | Notes |
|---|---|---|---|---|
| **Unit (pure)** | `evaluateEligibility`, `findCandidates`, transition guards, grammar parser, `normalizePhotonEvent`, `formatOfferMessage(view: OfferMessageView)`, `parseVerifiedFacts`, `VisionModelOutput` parse + provenance stamping, claim-word guard, `edited_from_ai` computation | `tests/core`, `tests/messaging`, `tests/intake` | Yes | No I/O. |
| **Contract** | Zod schemas vs typed fixtures and enum values; session route | `tests/contracts` | Yes | Captain. T-CT-01, T-CT-02. |
| **Repository / integration on PGlite (always)** | Drizzle repository, migrations, seed, `claimOffer`/`declineOffer` transactions, `expireDue`, `optOutIdentity`, `recordHandoff`, `tick()`, inbound and status-event dedupe | `tests/core`, `tests/messaging` | Yes | `STORE=pglite`, in-memory or temp `PGLITE_DIR`. Same repository code as the demo (D-006). PGlite serializes; it does not prove multi-connection behavior. |
| **Postgres (gated; T-CO-17 required)** | Same repository tests plus multi-connection race | `tests/core` (T-CO-17, Postgres half of T-CO-23), `tests/messaging` (T-MS-12 optional) | Only if `TEST_DATABASE_URL` is set (CONTRACTS §12) | Point at a **disposable** Supabase project or schema, never the shared demo DB, through the same connection mode as the demo (transaction pooler 6543, `prepare: false`). A skipped T-CO-17 is **UNVERIFIED**, and then AC-06 is not done and nobody may call claims race-safe (D-033). |
| **UI component** | Dashboard cards, banners, labels, identity status, claim-result messages (Dev 4); `VerificationForm` defaults (Dev 1) | `tests/ui`, `tests/intake/**/*.tsx` | Yes | Vitest + Testing Library + **jsdom**, rendered from `src/contracts/fixtures`. The Vitest config must give jsdom to `tests/ui/**` **and** `tests/intake/**/*.tsx` (either `// @vitest-environment jsdom` at the top of each component test file, or an environment glob that includes both). No client-side safety logic is tested because none may exist. |
| **Manual scripted E2E** | Demo scenes 1–3, real providers, deployed URL, mobile width | `docs/demo/` checklist (Dev 4) | No | Evidence = audit timeline, provider IDs, screenshots. T-E2E-01..05, T-UI-06, T-MS-13, T-IN-10. |
| **Prompt eval** | Real Gemini on synthetic images, T-PE-01..08 | `fixtures/intake/images/`, `docs/PROMPT_EVAL.md` | No | Gated on `GEMINI_API_KEY` + `VISION_PROVIDER=gemini`. Dev 1 owns. |

## 3. Tools (versions resolved and pinned at kickoff; ARCHITECTURE §3)

| Tool | Use |
|---|---|
| Vitest | Runner for every automated level |
| @testing-library/react + jsdom | Component tests (`tests/ui`, `tests/intake/**/*.tsx`) |
| Zod (via `@/contracts`) | Schema tests; never define a second schema in a lane |
| `@electric-sql/pglite` | In-process Postgres for repository tests |
| postgres.js | Gated Postgres tests (two connections for T-CO-17) |
| `createTestClock` (Dev 2) | Fixed, advanceable `Clock` for all time logic |
| Fake `VisionProvider` / fake `MessagingGateway` | Deterministic providers; outputs carry `mode: "fake"`. The fake gateway persists nothing; the workflow layer records every send (CONTRACTS §8.3). |
| tsx | Eval runner and scripts |

## 4. Planned commands

**These scripts are planned (ARCHITECTURE §3). They do not exist yet. At kickoff, open `package.json` and confirm each one before running it. Never invent a command or report one as passing without running it.**

| Command | Purpose | Gate |
|---|---|---|
| `pnpm typecheck` | `tsc --noEmit` (also runs T-CO-11's type-level check) | Required before every PR |
| `pnpm lint` | ESLint | Required before every PR |
| `pnpm test` | `vitest run`, full offline suite | Required before every PR |
| `pnpm test tests/<lane>` | One lane's suite (`intake`, `core`, `messaging`, `ui`, `contracts`). Verify the exact filter form at kickoff (the captain records it in ARCHITECTURE §3) and check the reported file count. | During lane work |
| `pnpm build` | Next.js production build | CP0a/CP0b, before merge to main |
| `pnpm db:migrate`, `pnpm db:seed` | Apply migrations, seed synthetic personas | T-CO-23, E2E setup |
| `pnpm worker` | Tick loop (`TICK_INTERVAL_MS`) + Photon relay | E2E scenes (D-021: the tick dispatches newly `eligible` donations) |
| `pnpm eval:intake` | Prompt eval runner over `fixtures/intake/images/` | T-PE-01..08 |

Gated runs (set the variable for one command only):

| Run | bash / Git Bash | PowerShell |
|---|---|---|
| Postgres repository + race | `TEST_DATABASE_URL=<url> pnpm test tests/core` | `$env:TEST_DATABASE_URL="<url>"; pnpm test tests/core` |
| Real Gemini eval | `VISION_PROVIDER=gemini pnpm eval:intake` (key from `.env.local`) | `$env:VISION_PROVIDER="gemini"; pnpm eval:intake` |

Never paste a URL, key or real handle into a doc, PR, handoff or chat. Record `<redacted>`. Run the canonical secret scan in `docs/ARCHITECTURE.md` §9 before every push.

## 5. Test catalog

Levels: **U** unit, **C** contract, **P** PGlite integration, **PG** Postgres-gated, **UI** component (jsdom), **M** manual/scripted, **E** prompt eval (real model, gated).

### 5.0 Must-run tier (D-034)

These **28** tests are the minimum for the P0 lifecycle, the release gate and the CLAUDE.md required edge tests. Write them first, run them before every merge that touches their area, and record them in handoffs. Every other ID below is **optional**: valuable, but cut it before cutting one of these.

| Lane | Must-run IDs |
|---|---|
| Captain | T-CT-01, T-CT-02 |
| Dev 1 | T-IN-03, T-IN-08, T-IN-12, T-IN-13 |
| Dev 2 | T-CO-02, T-CO-04, T-CO-09, T-CO-11, T-CO-12, T-CO-14, T-CO-16, **T-CO-17**, T-CO-19, T-CO-21, T-CO-22, T-CO-28, T-CO-30 |
| Dev 3 | T-MS-03, T-MS-04, T-MS-06, T-MS-10, T-MS-18 |
| Dev 4 | T-E2E-01, T-E2E-02, T-E2E-03, T-E2E-06 |

Track-evidence tests (T-IN-10 Gemini, T-MS-13 / T-MS-19 / T-E2E-04 Photon) are not in the tier, but a sponsor track is claimed only after its evidence test passes.

### 5.1 Dev 1 — `tests/intake/**`

| ID | Owner | Level | Covers | Given / When / Then | Fixtures / data |
|---|---|---|---|---|---|
| T-IN-01 | Dev 1 | U | AC-01; S-01, S-02 | Fake vision + clear sandwich/wrap platter / `createDraftFromImage` / schema-valid VisionSuggestion; possible wheat, milk, eggs; literal flags (`ingredients_verified=false`, `handling_verified=false`, `requires_donor_confirmation=true`); adapter-stamped provenance with `mode: "fake"` | `fixtures/intake/images/sandwich_platter.jpg` (fake keyed by SHA-256 of the bytes); core test double |
| T-IN-02 | Dev 1 | U | AC-01, AC-03; CONTRACTS §3.3 | Hand-built objects / parse VisionSuggestion and `VisionModelOutput` (`.strict()`) / reject `ingredients_verified=true`, unknown keys (`safe`, `allergen_free`), allergen outside enum, servings min>max, >3 dish suggestions; a model output carrying a provenance key also fails `VisionModelOutput` | Inline invalid objects derived from `src/contracts/fixtures` |
| T-IN-03 | Dev 1 | U | AC-01 | Ambiguous buffet / draft / `confidence: low` or `image_quality≠usable`; ≥1 uncertainty note, ≥1 question; nothing implies absence | `fixtures/intake/images/buffet_ambiguous.jpg` |
| T-IN-04 | Dev 1 | U | AC-03; S-02 | Fake returns non-JSON / schema-invalid text / draft / `ai_status=failed` with `AI_OUTPUT_INVALID`; draft still exists; manual entry path works | `fixtures/intake/images/malformed_output.jpg` (fake-only; its SHA-256 maps to malformed output) |
| T-IN-05 | Dev 1 | U | AC-03; S-02; CONTRACTS §12 | Provider throws, exceeds 15 s, or reports a safety block; or `VISION_PROVIDER=gemini` with no key (`status: misconfigured`) / draft / `ai_status=failed`, `PROVIDER_UNAVAILABLE`; no fallback to fake output | Stub provider; fake timers or injected timeout; `createVisionProvider({ mode, api_key, model })` with `api_key` missing |
| T-IN-06 | Dev 1 | U | AC-02; CONTRACTS §3.4 | Raw facts missing any of the nine allergen keys or any required key, or with an extra key / `parseVerifiedFacts` / `VALIDATION_FAILED`; explicit `unknown` accepted; `cross_contact_allergens` only allowed when `declared` | `scene1_eligible_facts` + mutations |
| T-IN-07 | Dev 1 | U | AC-02; S-03; CONTRACTS §3.2 | AI servings 18–30, donor 24; dish name matching no suggestion; AI listed `wheat`, donor declares `not_in_listed_ingredients` / `submitDonorVerification` / `edited_from_ai` ⊇ {`servings`, `dish_name`, `allergens.wheat`}, computed server-side and returned on the card; `ai_suggestion` null → empty list | Platter suggestion + facts fixtures |
| T-IN-08 | Dev 1 | U | AC-02, AC-04; G-11 | AI omitted sesame / verification / AI `possible_allergens` never populate donor statuses; all nine start `unknown`; sesame stays `unknown`; core returns `needs_review` with `ALLERGEN_UNKNOWN` (`allergens.sesame`) | Platter suggestion; core test double, then real core |
| T-IN-09 | Dev 1 | U | AC-01, AC-03 | Non-image MIME; > 1.5 MB decoded for `web_upload`/`fixture`; > 5 MB for `messaging`; `image/heic` while `HEIC_ACCEPTED = false` (and on `web_upload` always) / `createDraftFromImage` / `VALIDATION_FAILED` before any AI call (provider spy called 0 times); a 3 MB JPEG with `source: messaging` is accepted | Generated byte buffers |
| T-IN-10 | Dev 1 | M | AC-01 | `GEMINI_API_KEY` set / real call on ≥2 fixtures / record model ID, latency, schema validity; else **UNVERIFIED** | `sandwich_platter.jpg`, `buffet_ambiguous.jpg` |
| **T-IN-11** | Dev 1 | U | AC-01, AC-03; PROMPT_EVAL §8 item 5 | Model text with an absence or safety claim ("nut-free", "allergen-free", "safe to eat", "certified", "shelf life", a temperature or discard claim) in any free-text field / adapter parse / `AI_OUTPUT_INVALID`; `ai_status=failed`; manual form still usable | Inline model-output strings; fake provider |
| **T-IN-12** | Dev 1 | UI | AC-02 | `VerificationForm` rendered with the `sandwich_platter` suggestion / inspect defaults, submit unchanged / all nine allergens and every YesNoUnknown, `handling_mode`, `preparation_type` start `unknown`; with no suggestion `servings` and `ingredients_text` start empty; **with a suggestion only the D-042 fields are filled** (dish name, the lower servings bound, the ingredients text, the allergens the AI flagged as `present`, each tagged), never `not_in_listed_ingredients`, cross-contact, handling, preparation, temperatures or times; the ingredients fill needs the "checked this list" tick; submitted required-only facts evaluate to `needs_review`; no forbidden wording rendered | `tests/intake/**/*.tsx` (jsdom, incl. `verification-form-prefill.test.tsx`); typed suggestion fixture |
| **T-IN-13** | Dev 1 | U + UI | AC-02; CONTRACTS §8.4, §10 | Link path: `getLinkVerification` and `submitDonorVerificationByLink` with a core test double / valid body → core `submitVerification` called once with `auth: { link_token }` and the same `edited_from_ai` as the web path; schema-invalid body → `VALIDATION_FAILED` and core **not** called (link stays live); core `NOT_AUTHORIZED` → the page shows "expired or already used" and no form. `LinkVerification` (jsdom) with URL `/v#<token>`: the token is read from the fragment, sent only in `POST` bodies, never in a query string or `GET` URL; it renders the same `VerificationForm` (T-IN-12 defaults hold); on `resubmit_token` it swaps to the new token | Core test double; typed `VerificationLinkView` fixture |
| T-PE-01 | Dev 1 | E | AC-01 | Clear platter / eval / suggestions, servings range, possible wheat, milk, eggs; questions on spreads/fillings | `sandwich_platter.jpg` (PROMPT_EVAL §5) |
| T-PE-02 | Dev 1 | E | AC-01 | Ambiguous buffet / eval / low confidence, ≥2 uncertainty notes, no absence statements | `buffet_ambiguous.jpg` |
| T-PE-03 | Dev 1 | E | AC-01 | Plain dessert bars / eval / tree_nuts and/or peanuts possible, or a nut uncertainty note; never "nut-free" | `dessert_bars.jpg` |
| T-PE-04 | Dev 1 | E | AC-01, AC-03 | Blurry or dark photo / eval / `image_quality=poor`, servings `null`, no confident dish | `blurry.jpg` |
| T-PE-05 | Dev 1 | E | AC-01, AC-03 | Non-food photo / eval / `image_quality=not_food`, empty `dish_suggestions` | `non_food.jpg` |
| T-PE-06 | Dev 1 | E | AC-01 | Sushi-style tray / eval / fish, sesame, soybeans possible; crustacean_shellfish possible or noted | `sushi_tray.jpg` |
| T-PE-07 | Dev 1 | E | AC-01 | Team-made unbranded ingredient label / eval / label allergens listed as possible; still requires donor confirmation; verified flags false | `packaged_label.jpg` |
| T-PE-08 | Dev 1 | E | AC-01, AC-03 | Injection text in image / eval / schema-valid; no safety keys or claims; injection noted or ignored | `injection_note.jpg` |

### 5.2 Dev 2 — `tests/core/**`

| ID | Owner | Level | Covers | Given / When / Then | Fixtures / data |
|---|---|---|---|---|---|
| T-CO-01 | Dev 2 | U | AC-04; G-01..G-13; S-03 | Policy-eligible demo facts (sandwich platter), approved licensed donor / `evaluateEligibility` / `eligible`, zero reasons | `scene1_eligible_facts`; seed donor |
| T-CO-02 | Dev 2 | U | AC-04; G-01 | Donor suspended, or `licensed_food_establishment=false`, or pending / gate / `rejected` `DONOR_NOT_APPROVED` ×2; `needs_review` `DONOR_APPROVAL_PENDING` | Seed donors (approved, pending, suspended) |
| T-CO-03 | Dev 2 | U | AC-04; G-02..G-04 | Each handling, preparation and excluded-category value / gate / reject `HANDLING_OUT_OF_SCOPE` (hot_held, ambient, frozen), `EXCLUDED_CATEGORY`; review `HANDLING_UNKNOWN`, `COOLING_HISTORY_REVIEW`, `PREPARATION_TYPE_REVIEW`, `PREPARATION_UNKNOWN`, `EXCLUDED_CATEGORY_UNKNOWN` | `scene1_eligible_facts` + single-field mutations |
| T-CO-04 | Dev 2 | U | AC-04; G-05, G-06 | Missing holding history: cold holding `unknown`/`no`; temperature log `no`/`unknown` / gate / `COLD_HOLDING_UNKNOWN` (review), `COLD_HOLDING_NOT_CONFIRMED` (reject), `TEMPERATURE_LOG_MISSING` (review) | Mutations |
| T-CO-05 | Dev 2 | U | AC-04; G-07 | `previously_served` `yes`/`unknown` / gate / reject `PREVIOUSLY_SERVED`; review `PREVIOUSLY_SERVED_UNKNOWN` | Mutations |
| T-CO-06 | Dev 2 | U | AC-04; G-08 | Containers `no`/`unknown` / gate / review `PACKAGING_NOT_COVERED`, `PACKAGING_UNKNOWN` | Mutations |
| T-CO-07 | Dev 2 | U | AC-04; G-09 | `discard_by` null; `discard_by <= now` / gate / review `DISCARD_BY_MISSING`; reject `DISCARD_BY_PASSED` | Test clock |
| T-CO-08 | Dev 2 | U | AC-04; G-10 | `donor_pickup_by <= now`; `< now + 15 min` / gate / reject `PICKUP_WINDOW_PASSED`, `PICKUP_WINDOW_TOO_SHORT` (cutoff reached at gate time); boundary at exactly 15 min passes | Test clock; policy `min_pickup_lead_minutes=15` |
| T-CO-09 | Dev 2 | U | AC-04; G-11 | k allergens `unknown` / gate / `needs_review` with exactly k `ALLERGEN_UNKNOWN`, each with `allergen` set and `field` = `allergens.<name>` | Mutations k = 1, 3, 9 |
| T-CO-10 | Dev 2 | U | AC-04; G-12, G-13 | Cross-contact `unknown`; ingredients `""` or 2 chars / gate / review `CROSS_CONTACT_UNKNOWN`, `INGREDIENTS_MISSING` | Mutations |
| T-CO-11 | Dev 2 | U (property + type) | AC-04; G-01..G-13; forbidden "AI output causes transition" | Every VerifiedFacts field of `scene1_eligible_facts` mutated to `unknown`/`null` where the type allows / gate / outcome ≠ `eligible`; `evaluateEligibility` does not type-check with a VisionSuggestion argument | `scene1_eligible_facts`; `pnpm typecheck` |
| T-CO-12 | Dev 2 | U | AC-05; M-01..M-04 | Recipients unapproved, `registered_dfdo=false`, `serves_highly_susceptible_population=true`, handling mismatch, excluded allergen present (incl. via cross-contact), insufficient capacity, and capacity used up by `committed_servings` from another claimed/collected/delivered donation to the same recipient (F5) / `findCandidates` / each excluded | Seed recipients incl. "Youth Meals Program (synthetic)" |
| T-CO-13 | Dev 2 | U | AC-05; M-05..M-10 | Couriers whose identity is not joined / `opted_out`, no cold transport, not affiliated, already offered, busy (incl. a `pending_send` offer on another donation); equal ETAs; exactly-at-cutoff times / match / excluded; ranking by dropoff then `courier_id`; M-10 boundary cases. **F6 (P):** two `eligible` donations, one feasible courier / `createNextOffers` for both (sequential, then `Promise.all`) / exactly one live offer for that courier; the other donation gets none (S-05 `NO_ELIGIBLE_MATCH`) and no error escapes | Seed couriers A, B, C; identities; test clock |
| T-CO-14 | Dev 2 | P | AC-05; S-05, S-14, S-18 | No feasible pair in round 1; all feasible couriers already offered / `createNextOffers` / `unmatched` with `NO_ELIGIBLE_MATCH`; `CANDIDATES_EXHAUSTED` (severity `dispatch`; `latest_decision.outcome` still `eligible`); after a new courier joins, `retry_matching` → `eligible` → next tick offers that courier; `retry_matching` at or after `effective_cutoff_at` → `INVALID_TRANSITION`; `retry_matching` after the donor was suspended → S-18 `rejected` (`DONOR_NOT_APPROVED`); `return_to_donor` and `reject` on an `unmatched` donation → `INVALID_TRANSITION`; `expireDue` at the cutoff → `expired` | Seed; identities; test clock |
| T-CO-15 | Dev 2 | U + P | AC-08; S-01..S-18; forbidden transitions | Table-driven, one case per S-row plus each forbidden case / call the owning function / only S-01..S-18 succeed, each with its guards (S-15/S-16/S-17 behavior detailed in T-CO-28); terminal states immutable; operator cannot turn a review/reject reason into `eligible` (S-14 only from `unmatched`, and only when the re-run gate is `eligible`); S-11 from `claimed`/`collected` requires `note`; S-03 and S-13 refuse a donation with `collected_at` set; no transition accepts client time; handoff requires `simulated: true` | Seed; test clock |
| T-CO-16 | Dev 2 | P | AC-06; S-07; §8.1 | Wave size 2 (or the same offer replayed), `Promise.all` of N = 2..10 claims / `claimOffer` / exactly one `claimed`; others `already_claimed`/`offer_expired`; exactly one accepted offer row; siblings `superseded` | PGlite race test; policy override `offer_wave_size=2` |
| T-CO-17 | Dev 2 | PG | AC-06; §8.1; D-033 | **Required.** Wave size 2 (and a replayed offer); N ≥ 2 **independent** postgres.js clients (independent connections from the default pool), through the transaction pooler (6543, `prepare: false`) like the demo, released together / `claimOffer` / exactly one `claimed`; others `already_claimed`/`offer_expired`; exactly one active accepted row; run ≥ 20 rounds. If not run: **UNVERIFIED**, AC-06 not done, no race-safety claim anywhere | `TEST_DATABASE_URL` (disposable) |
| T-CO-18 | Dev 2 | P | AC-06 | Winner replays its claim / `claimOffer` / `already_claimed_by_you`, assignment repeated; no second `claim.accepted` audit event; no state change (`version` unchanged) | Claimed donation |
| T-CO-19 | Dev 2 | P | AC-07; offer `open→expired`; D-026 | Clock past `offers.expires_at`, no sweeper ran / `claimOffer` by `offer_id` and by `short_code` / `offer_expired`; offer marked `expired`; no assignment; the stale short code resolves to its own offer (codes are never reused before `resetDemo`), never `offer_not_found` | Test clock; codes `K7M3`, `H4M9` |
| T-CO-20 | Dev 2 | P | AC-07 | Donation `expired`/`canceled`/`rejected` / claim / `donation_unavailable` (or `offer_expired` when the offer deadline passed first) | Seed + transitions |
| T-CO-21 | Dev 2 | P | AC-07; S-06, S-08 | Due offers; then clock ≥ `effective_cutoff_at` / `expireDue` twice / offers expired, donation back to `eligible` (S-06); at cutoff donation `expired` with `CUTOFF_REACHED` (S-08); second call is a no-op | Test clock |
| T-CO-22 | Dev 2 | P | AC-09; CONTRACTS §3.11, §3.13, §11 | Another courier's claim; donor reads another donor's card; offered-but-unclaimed courier view; operator snapshot; owning donor's card before claim; audit log / call / `not_authorized`; `NOT_AUTHORIZED`; no `address_line`/`pickup_instructions`; handles masked to the last 4 characters; donor projection has no courier name, no `provider_message_id` and a filtered timeline; no `AuditEvent.data` holds a full handle, message text, `address_line` or `pickup_instructions` | Seed actors (`DEMO_ACTORS` UUIDs) |
| T-CO-23 | Dev 2 | P + PG | AC-08 | Empty DB / migrate + seed / applies cleanly on PGlite (always) and Postgres (if `TEST_DATABASE_URL`); seed deterministic and uses `DEMO_ACTORS` UUIDs; second active accepted offer (`close_reason IS NULL`) for one donation violates the partial unique index, while an accepted row with `close_reason` set does not block a new one; a second `pending_send`/`open` offer for one courier violates the courier index; a second live verification link for one donation and a duplicate `(source, source_ref)` violate their unique indexes; seed includes the donor messaging identity | PGlite always; Postgres if `TEST_DATABASE_URL` |
| T-CO-24 | Dev 2 | P | AC-07; offer transitions; forbidden "leave terminal" | Offers `superseded`/`expired`/`canceled`/`send_failed` / claim or decline / no state change; codes per §8.1 order (`already_claimed`, `offer_expired`, `offer_closed` or `donation_unavailable`); terminal offer states immutable | Wave size 2 for `offer_closed` |
| T-CO-25 | Dev 2 | P | AC-06; G-01, G-10, M-04, M-10; §8.1 step 8 | Offer open, then donor suspended, or `donor_pickup_by` now inside the 15-min lead (also: courier or recipient approval revoked; recipient `receiving_closes_at` or courier `available_until` moved earlier so pair-level M-10 fails; recipient capacity consumed by another donation's claim) before `expires_at` / `claimOffer` / `ineligible`; offer `canceled` (`close_reason = recheck_failed`); S-06 if no open offers remain; no assignment, no address | Test clock; seed |
| T-CO-26 | Dev 2 | P | AC-06, AC-09; §8.1 step 1 | Unknown `offer_ref` (nonexistent `offer_id` or `short_code`) / `claimOffer` and `declineOffer` / `offer_not_found`; no writes; no details leaked | Seed |
| T-CO-27 | Dev 2 | P | AC-07, AC-12; offer `open→declined`; S-06 | Open offer / `declineOffer`, then replay; decline after `expires_at`; decline of a superseded/send_failed offer; another courier / `declined` (S-06 when last open); `already_declined`; `offer_expired`; `offer_closed`; `not_authorized` (`offer_not_found` via T-CO-26) | Test clock; wave size 2 |
| **T-CO-28** | Dev 2 | P | AC-07, AC-08; S-09, S-10, S-14, S-15, S-16; D-025, D-029 | Claimed donation / `recordHandoff(collected)` after `effective_cutoff_at` → `INVALID_TRANSITION`, **including `discard_by < donor_pickup_by` with now between them** (F2); `recordHandoff(delivered)` after `discard_by` → `INVALID_TRANSITION`; no collection by `effective_cutoff_at` → `expireDue` → `expired` with `PICKUP_NOT_COLLECTED` (S-16), also when `discard_by` is the earlier time; `optOutIdentity` while `claimed` and before the cutoff → **`eligible`** with `COURIER_OPTED_OUT` (`dispatch`, S-15), accepted offer keeps `accepted` with `close_reason = courier_opted_out`, `claimed_offer_id` is null, `assignment.released` audited; the **next tick** offers courier B (A excluded, `opted_out`) → B claims → `claimed`, exactly one active accepted row (F1); with no other feasible courier the tick gives `unmatched`; `optOutIdentity` while `claimed` at or after `effective_cutoff_at` → S-16 `expired`; `optOutIdentity` after `collected` → **`needs_review`** with `COURIER_OPTED_OUT_AFTER_PICKUP` (S-17), no new offer on later ticks, only `cancel`/`reject` with a note succeed | Test clock; seed |
| **T-CO-30** | Dev 2 | P | AC-17; CONTRACTS §3.16, §8.4; S-03 | `issueVerificationLink` / the stored row has only `token_hash` (no raw token in any table or audit event); token is 43 base64url characters; `expires_at = issued_at + 30 min`, or the stored `effective_cutoff_at` when earlier; issuing again revokes the previous link. `getVerificationLinkView` called 3× → not consumed; view has no handle, `address_line`, offers or timeline. `submitVerification({ auth: { link_token } })` → S-03 + `consumed_at` set; second submit → `NOT_AUTHORIZED`; `Promise.all` of 2 submits → exactly one succeeds; expired, revoked, unknown and used tokens → the same `NOT_AUTHORIZED` message, reason only in `link.rejected`; outcome `needs_review` → `resubmit_token` works once; a link for donation X cannot submit donation Y; S-11, S-08, donor STOP and `resetDemo` revoke; an `eligible` link submission does not create an offer until the next tick re-runs the gate | Test clock; seed donor + identity |
| **T-CO-31** | Dev 2 | P | AC-17; CONTRACTS §3.2, §11 | `createDraft` twice with the same `(messaging, source_ref)` → one donation, same ID; different `source_ref` → two. `recordIgnoredInbound` for an unknown sender → row has `sender_handle = null`, `payload = null`, `handle_masked` = last 4, `ignore_reason = unknown_sender`; audit `inbound.ignored` has no handle or text | Seed |
| **T-CO-29** | Dev 2 | P | AC-09; CONTRACTS §10–§11 | Wrong role or no session on `operatorAction`, `recordHandoff` (non-assigned courier/recipient), `GET /api/images/:id` (not owner/operator) and `resetDemo` (non-operator, or demo mode off) / call the handler or core function / `NOT_AUTHORIZED` (403); no writes; no audit event except the rejection | Seed; `DEMO_ACTORS` |

### 5.3 Dev 3 — `tests/messaging/**`

| ID | Owner | Level | Covers | Given / When / Then | Fixtures / data |
|---|---|---|---|---|---|
| T-MS-01 | Dev 3 | U | AC-11; CONTRACTS §3.10 grammar | Texts `JOIN`, `yes k7m3!`, `ACCEPT`, `no K7M3`, `DECLINE H4M9`, `STOP`, `HELP`, junk / parse / correct command, case-insensitive, punctuation ignored; CODE uppercased and validated against the §1 alphabet (`YES K7O0` or a 3-character code → treated as no code); CODE optional only with exactly one open offer; anything else → unknown/help | Text table |
| T-MS-02 | Dev 3 | U | AC-11; S-07 | Joined courier sends `YES K7M3` / `handleInbound` / core `claimOffer` called once with the right ClaimCommand; reply includes addresses only for `claimed`/`already_claimed_by_you` | Core test double, then PGlite |
| T-MS-03 | Dev 3 | P | AC-11; §8.2 | Same `provider_message_id` twice (webhook + poll) / `handleInbound` / processed once; second returns the stored InboundResult with `outcome: duplicate`; no second reply or send. **F4:** a row left with `result = null` (simulated crash after `claimOffer`, before or after the reply send) is redelivered < 30 s later → `duplicate`, and ≥ 30 s later → reprocessed: the claim returns `already_claimed_by_you`, the result is saved, and exactly one reply exists for `reply:<provider_message_id>:v1` | Photon envelope fixture |
| T-MS-04 | Dev 3 | P | AC-11, AC-09 | Unknown handle sends anything / `handleInbound` / outcome `ignored`, `reply: null`, no identity created. `awaiting_join` identity, or another courier's code / `YES` / no assignment; no details leaked | Seed identities |
| T-MS-05 | Dev 3 | U | AC-10, AC-18; CONTRACTS §3.10, §9.4 | `OfferMessageView` / `formatOfferMessage(view)` twice; `DraftReadyView` (AI succeeded and AI failed) / `formatDraftReadyMessage(view)` twice → says "AI guess … please confirm", lists allergens as "possible", gives the link and its expiry in `America/Los_Angeles`, automated-assistant (+ DEMO) disclosure, byte-identical; `intake_failed` text points to "send the photo again or use the web form" / short code, dish, servings, the exact §3.10 allergen wording ("Contains (donor-declared): … Other major allergens: not in the donor's listed ingredients — not a guarantee. Cross-contact: …"), cold-transport requirement, recipient name, pickup `area_label`, deadline in `America/Los_Angeles`, YES/NO instructions, STOP, "automated assistant" + DEMO disclosure; byte-identical for identical input. For the offer text **and every reply template**: no forbidden word (safe, allergen-free, certified, compliant) and no `address_line`, `pickup_instructions` or handle, except `claimed`/`already_claimed_by_you` replies, which carry addresses | Scene-1 `OfferMessageView` fixture; one fixture per `MessagePurpose` template |
| T-MS-06 | Dev 3 | P | AC-12; S-04, S-06 | Offer to A open; test clock advanced past `expires_at` / `tick()` / A's offer expired; offer to B created and sent (fake gateway `send` called once for B; the workflow layer records the outbound row) | Test clock; couriers A, B |
| T-MS-07 | Dev 3 | P | AC-12; S-06 | A replies `NO K7M3` / next `tick()` / B offered | Same |
| T-MS-08 | Dev 3 | P | AC-07, AC-12 | B offered after A expired / A sends `YES` / A gets `offer_expired` reply; B's offer unaffected | Same |
| T-MS-09 | Dev 3 | P | AC-12; S-08 | Clock ≥ `effective_cutoff_at` / `tick()` / no new offers or sends; donation `expired` | Test clock |
| T-MS-10 | Dev 3 | P | AC-13; S-06; §8.2, §8.3 | Gateway `ok:false`; a `failed` delivery event (`recordStatusEvent` → `first`, then `recordDeliveryStatus` → `markOfferSendFailed`); courier not joined; or a `misconfigured` gateway (`MESSAGING_PROVIDER=photon`, key missing → `PROVIDER_UNAVAILABLE`) / `tick()` / offer `send_failed` → next candidate; audited; never silently re-sent via fake. A duplicate status event (same `provider_event_id`) → `duplicate`, no second update | Failing fake gateway; `createMessagingGateway({ mode, project_id, api_key })` with key missing |
| T-MS-11 | Dev 3 | P | AC-12 | `Promise.all` of 2–5 ticks / run / no duplicate offers or duplicate sends | Outbound-row and `send` call counts |
| T-MS-12 | Dev 3 | P / PG | AC-12 | Persisted offers/deadlines; process restarted / fresh `tick()` / resumes correctly (Postgres or PGlite data dir); else **UNVERIFIED** | PGlite data dir or `TEST_DATABASE_URL` |
| T-MS-13 | Dev 3 | M | AC-10 | Teammate iPhone texts JOIN → offer → `YES` / real Photon 2.0 round trip / `claimed`; `provider_message_id`s recorded; **UNVERIFIED** until done | Opted-in teammate phones (handles from env only) |
| T-MS-14 | Dev 3 | U + P | AC-11; CONTRACTS §3.10, §10 | `message.received`; `message.accepted`/`delivered`/`failed`; `message.dispatched`; malformed body; bad signature or missing internal secret; simulated route with `MESSAGING_PROVIDER=photon` / `normalizePhotonEvent` + routes / InboundMessage; DeliveryStatusEvent; `{ ignored: true }`; `VALIDATION_FAILED`; inbound route rejects; simulated routes return **403** | Scrubbed envelope fixtures |
| T-MS-15 | Dev 3 | P | AC-10, AC-11; identity paths; S-15 | JOIN from a seeded handle → `joined` + space/sender IDs stored + `join_ack` with disclosure/STOP; JOIN from an unknown handle → `ignored`, no identity created; STOP → `opted_out`, that courier's open offers `canceled`, only `stop_ack` sent; STOP while `claimed` → donation back to `eligible` (`COURIER_OPTED_OUT`, S-15) and the next tick offers another courier; STOP after `collected` → `needs_review` (`COURIER_OPTED_OUT_AFTER_PICKUP`, S-17) with no new offer; no S-11/`offer_closed` message to that handle; donor JOIN → donor identity `joined`; donor STOP → that donor's live links revoked; JOIN from `opted_out` → `joined` again with a new `joined_at`; any non-`stop_ack` send to a non-joined identity → `NOT_JOINED`, `send` not called | Seed identities |
| **T-MS-16** | Dev 3 | P | AC-12; S-05 | Couriers A and B both decline or expire / next `tick()` / donation `unmatched` with `CANDIDATES_EXHAUSTED`; no further sends | Test clock; couriers A, B |
| **T-MS-17** | Dev 3 | P | AC-11, AC-12; CONTRACTS §10 | `POST /api/internal/tick` without `x-annona-internal-secret` and without an operator session; `POST /api/donations/:id/dispatch` as a non-operator; simulated routes as a non-operator / call the route handler / 403; no tick, dispatch or message side effects | Route-handler tests with test doubles |

| **T-MS-18** | Dev 3 | P | AC-18, AC-11, AC-09; CONTRACTS §3.10, §8.2, §8.4, §11 | Joined donor sends an image (Photon envelope fixture, and simulated `{ identity_id, fixture_id }`) / `handleInbound` / attachment fetched once; Dev 1 `createDraftFromImage` called once with `source: messaging`, `source_ref = <provider>:<provider_message_id>`; core `issueVerificationLink` called; reply `draft_ready` keyed `draft_ready:<link_id>:v1`. Same message reprocessed after 30 s → no second draft (same `source_ref`), no second send when the `draft_ready` is recorded and its link is live. `ATTACHMENT_NOT_READY` on all 3 attempts within 6 s, or `VALIDATION_FAILED` → `intake_failed`, no draft. Image from a courier → help. Image from an unknown handle → `ignored`, `reply: null`, **attachment fetch spy and vision spy called 0 times**, `recordIgnoredInbound` called. Image from an `awaiting_join` donor → `rejected`, `reply: null`, no fetch | Photon envelope fixtures; core + intake test doubles, then real; test clock |
| T-MS-19 | Dev 3 | M | AC-18 | Real donor iPhone (joined) texts a synthetic platter photo / real Photon + real or fake vision / `draft_ready` arrives on the phone; the link opens on the phone; submission gives `eligible`. Record `provider_message_id`s, the received MIME (HEIC or JPEG), byte size and download attempts; **UNVERIFIED** until done (then the demo opens on web upload) | Opted-in teammate phone (handle from env only) |

### 5.4 Dev 4 — `tests/ui/**` and scripted E2E

| ID | Owner | Level | Covers | Given / When / Then | Fixtures / data |
|---|---|---|---|---|---|
| T-UI-01 | Dev 4 | UI | AC-14 | One card fixture per DonationStatus (11, incl. `unmatched`) / render dashboard / every status renders with reasons and FieldState badges; `unmatched` appears in its own neutral group, not with `needs_review` | `src/contracts/fixtures` |
| T-UI-02 | Dev 4 | UI | AC-14, AC-15 | All fixtures / render / case-insensitive scan finds no "safe", "allergen-free", "certified", "compliant" | Same |
| T-UI-03 | Dev 4 | UI | AC-14; S-11..S-14, S-17 | `needs_review`/`rejected` cards / render / no dispatch control; `needs_review` actions limited to reject, return_to_donor, cancel (no retry_matching; a `COURIER_OPTED_OUT_AFTER_PICKUP` card shows only cancel/reject with a note field); `unmatched` cards show only retry_matching and cancel, styled neutrally | Scene-3 card; `unmatched` card; S-17 card |
| T-UI-04 | Dev 4 | UI | AC-15; CONTRACTS §3.13, §12 | SystemModes with each fake provider and each `misconfigured` real provider; stale `last_tick_at`; IdentitySummary list / render / mode banner shows every fake and every misconfigured provider; "Synthetic data", "DEMO: accelerated timers", "Simulated" labels present; stale-tick warning; JOIN status per identity with handles masked to the last 4 characters | SystemModes + IdentitySummary fixtures |
| T-UI-05 | Dev 4 | UI | AC-14 | Each ClaimResult code / render / distinct message; `offer_expired`/`already_claimed` never a success toast | ClaimResult fixtures |
| **T-UI-07** | Dev 4 | UI + route | AC-14; CONTRACTS §8.4, §13 item 7 | `/v` page / render and fetch headers / only Dev 1's `LinkVerification` mounted; response has `Referrer-Policy: no-referrer` and `Cache-Control: no-store`; no third-party script tags; no session required | Route/page test with a stubbed component |
| T-UI-06 | Dev 4 | M | AC-16 | 375 px viewport / use donor form and dashboard / usable; screenshots saved | Integrated main |
| T-E2E-01 | Dev 4 | M | AC-15, AC-16, AC-18; S-01..S-04, S-07, S-09, S-10 | Fake providers on integrated main, `pnpm worker` running (or "Run tick now") / run scene 1 **by message**: simulated donor phone sends `fixture_id = sandwich_platter` → `draft_ready` with link → open link → submit → next tick dispatches (D-021); `claimed`; simulated `collected` → `delivered`; audit timeline captured | Seed; `sandwich_platter` |
| T-E2E-02 | Dev 4 | M | AC-07, AC-12, AC-16; S-06 | Scene 2 / A ignores the 60 s accelerated offer, B accepts, A replies late / B wins; A gets "expired, no assignment" | Seed couriers A, B |
| T-E2E-03 | Dev 4 | M | AC-04, AC-16; S-03 | Scene 3 pasta tray / verify with unknowns / `needs_review` with 4 reasons; no offer created | `pasta_tray` |
| T-E2E-04 | Dev 4 | M | AC-01, AC-10, AC-16 | Real Gemini + real Photon / scene 1 / model ID, `provider_message_id`s, phone screenshots recorded; else **UNVERIFIED** | Teammate iPhones (fresh JOIN before each judge demo) |
| **T-E2E-06** | Dev 4 | M | AC-16; D-031 fallback | Same as T-E2E-01, but the donor uses **web upload** (`/donor/new`) with messaging still used for couriers / scene 1 / identical gate decision and claim; proves the fallback is independently demonstrable | Seed; `sandwich_platter` |
| T-E2E-05 | Dev 4 | M | AC-16 | Deployed URL / `/api/health`, dashboard, demo reset / modes and provider status shown, loads, reset works | Deployed app |

### 5.5 Captain — `tests/contracts/**`

| ID | Owner | Level | Covers | Given / When / Then | Fixtures / data |
|---|---|---|---|---|---|
| T-CT-01 | Dev 4 (captain) | C | CONTRACTS §2, §3 | Every typed fixture; literal-flag violations; unknown keys / parse with contract Zod schemas / fixtures parse; violations rejected; enum values match CONTRACTS §2 exactly | `src/contracts/fixtures` |
| **T-CT-02** | Dev 4 (captain) | C | Baseline gate; CONTRACTS §9.0, §10, §11; D-024 | `POST /api/session` with a `DEMO_ACTORS` id + correct passcode; wrong passcode; unknown `actor_id`; tampered cookie / call route, then `getActor(request)` / signed cookie set; `NOT_AUTHORIZED`; `NOT_AUTHORIZED`; `getActor` returns `null` | `src/contracts/fixtures/demo-actors` |

## 6. Coverage matrix

Every row must have ≥ 1 test **actually run** before the matching AC is marked done.

### 6.1 ReasonCode (CONTRACTS §2.1) → tests

| ReasonCode | Severity | Raised by | Tests |
|---|---|---|---|
| `DONOR_NOT_APPROVED` | reject | G-01 | T-CO-02 |
| `DONOR_APPROVAL_PENDING` | review | G-01 | T-CO-02 |
| `HANDLING_OUT_OF_SCOPE` | reject | G-02 | T-CO-03 |
| `HANDLING_UNKNOWN` | review | G-02 | T-CO-03, T-CO-11 |
| `COOLING_HISTORY_REVIEW` | review | G-03 | T-CO-03, T-E2E-03 |
| `PREPARATION_TYPE_REVIEW` | review | G-03 | T-CO-03 |
| `PREPARATION_UNKNOWN` | review | G-03 | T-CO-03, T-CO-11 |
| `EXCLUDED_CATEGORY` | reject | G-04 | T-CO-03 |
| `EXCLUDED_CATEGORY_UNKNOWN` | review | G-04 | T-CO-03, T-CO-11 |
| `COLD_HOLDING_NOT_CONFIRMED` | reject | G-05 | T-CO-04 |
| `COLD_HOLDING_UNKNOWN` | review | G-05 | T-CO-04, T-CO-11, T-E2E-03 |
| `TEMPERATURE_LOG_MISSING` | review | G-06 | T-CO-04, T-E2E-03 |
| `PREVIOUSLY_SERVED` | reject | G-07 | T-CO-05 |
| `PREVIOUSLY_SERVED_UNKNOWN` | review | G-07 | T-CO-05, T-CO-11 |
| `PACKAGING_NOT_COVERED` | review | G-08 | T-CO-06 |
| `PACKAGING_UNKNOWN` | review | G-08 | T-CO-06, T-CO-11 |
| `DISCARD_BY_MISSING` | review | G-09 | T-CO-07, T-CO-11 |
| `DISCARD_BY_PASSED` | reject | G-09 | T-CO-07 |
| `PICKUP_WINDOW_PASSED` | reject | G-10 | T-CO-08 |
| `PICKUP_WINDOW_TOO_SHORT` | reject | G-10 | T-CO-08 |
| `ALLERGEN_UNKNOWN` | review | G-11 | T-CO-09, T-CO-11, T-IN-08, T-IN-12, T-E2E-03 |
| `CROSS_CONTACT_UNKNOWN` | review | G-12 | T-CO-10, T-CO-11 |
| `INGREDIENTS_MISSING` | review | G-13 | T-CO-10 |
| `NO_ELIGIBLE_MATCH` | dispatch | S-05 | T-CO-14 |
| `CANDIDATES_EXHAUSTED` | dispatch | S-05 | T-CO-14, T-MS-16 |
| `CUTOFF_REACHED` | reject | S-08 | T-CO-21, T-MS-09 |
| `PICKUP_NOT_COLLECTED` | reject | S-16 | **T-CO-28** |
| `COURIER_OPTED_OUT` | dispatch | S-15 | **T-CO-28**, **T-MS-15** |
| `COURIER_OPTED_OUT_AFTER_PICKUP` | review | S-17 | **T-CO-28**, **T-MS-15**, T-UI-03 |

Result: all 29 codes covered by catalog tests.

### 6.2 ClaimResultCode → tests

| Code | §8.1 step | Tests |
|---|---|---|
| `claimed` | 9 | T-CO-16, T-MS-02, T-E2E-01 |
| `already_claimed_by_you` | 3 | T-CO-18 |
| `already_claimed` | 4 (+ unique-index backstop) | T-CO-16, T-CO-17, T-CO-24 |
| `offer_expired` | 6 | T-CO-19 (incl. stale short code), T-CO-20, T-MS-08, T-E2E-02 |
| `offer_closed` | 7 | T-CO-24 |
| `donation_unavailable` | 5 | T-CO-20 |
| `not_authorized` | 1 | T-CO-22, T-MS-04 |
| `offer_not_found` | 1 | T-CO-26 |
| `ineligible` | 8 | T-CO-25 |

UI rendering of every code: T-UI-05.

### 6.3 DeclineResultCode → tests

| Code | Tests |
|---|---|
| `declined` | T-CO-27, T-MS-07 |
| `already_declined` | T-CO-27 |
| `offer_expired` | T-CO-27, T-CO-24 |
| `offer_closed` | T-CO-27, T-CO-24 |
| `not_authorized` | T-CO-27, T-CO-22 |
| `offer_not_found` | T-CO-26 |

### 6.4 Donation transitions (CONTRACTS §4.1) → tests

T-CO-15 is table-driven and must contain one case per row below; other IDs exercise the row end to end.

| Transition | Tests |
|---|---|
| S-01 — → `draft` (core `createDraft`) | T-CO-15, T-IN-01, T-E2E-01 |
| S-02 `draft` → `draft` (`attachAiResult`: suggestion or failure) | T-CO-15, T-IN-01, T-IN-04, T-IN-05, T-IN-11 |
| S-03 verification → `eligible`/`needs_review`/`rejected` (session or link path) | T-CO-15, T-CO-01..T-CO-10, T-CO-30, T-IN-07, T-IN-08, T-IN-12, T-IN-13, T-E2E-03 |
| S-04 `eligible` → `offered` (next tick; D-021) | T-CO-15, T-MS-06, T-E2E-01 |
| S-05 `eligible` → `unmatched` | T-CO-14, T-MS-16 |
| S-06 `offered` → `eligible` | T-CO-21, T-CO-25, T-CO-27, T-MS-06, T-MS-07, T-MS-10, T-E2E-02 |
| S-07 `offered` → `claimed` | T-CO-16, T-CO-17, T-MS-02, T-E2E-01 |
| S-08 → `expired` at effective cutoff (incl. from `unmatched`) | T-CO-14, T-CO-21, T-MS-09 |
| S-09 `claimed` → `collected` (guards: `simulated: true`, `now < effective_cutoff_at`, G-01 re-check) | T-CO-15, **T-CO-28**, T-E2E-01 |
| S-10 `collected` → `delivered` (guards: `simulated: true`, `now < discard_by`) | T-CO-15, **T-CO-28**, T-E2E-01 |
| S-11 → `canceled` (incl. from `claimed`/`collected`, operator `note` required) | T-CO-15, T-UI-03 |
| S-12 `needs_review` → `rejected` | T-CO-15, T-UI-03 |
| S-13 `needs_review` → `draft` (not after collection) | T-CO-15, T-UI-03 |
| S-14 `unmatched` → `eligible` (`retry_matching`; cutoff and gate re-checked) | T-CO-15, T-CO-14, T-UI-03 |
| S-15 `claimed` → `eligible` (courier STOP before pickup; assignment released; `COURIER_OPTED_OUT`) | T-CO-15, **T-CO-28**, **T-MS-15** |
| S-16 `claimed` → `expired` (no-show at `effective_cutoff_at`, or STOP at/after the cutoff; `PICKUP_NOT_COLLECTED`) | T-CO-15, **T-CO-28** |
| S-17 `collected` → `needs_review` (courier STOP after pickup; `COURIER_OPTED_OUT_AFTER_PICKUP`; no reassignment) | T-CO-15, **T-CO-28**, **T-MS-15** |
| S-18 `eligible`/`unmatched` → `needs_review`/`rejected` (gate re-run not eligible) | T-CO-15, T-CO-14 |

| Forbidden by design | Tests |
|---|---|
| Leaving a terminal state | T-CO-15, T-CO-24 |
| Operator edits VerifiedFacts or turns a review/reject reason into `eligible` | T-CO-15, T-UI-03 |
| Transition caused by client time | T-CO-15 (no function accepts a client timestamp) |
| Transition caused directly by AI output | T-CO-11 (type-level), T-IN-08, T-IN-12 |
| Reassignment after a recorded collection | T-CO-28, T-CO-15 |
| `unmatched` reached or left without a current `eligible` gate outcome | T-CO-14, T-CO-15 |

Offer transitions (CONTRACTS §4.2): `→pending_send` T-CO-14, T-MS-06; `pending_send→open` T-MS-06; `pending_send→send_failed` (`courier_not_joined`) T-MS-10; `open→send_failed` T-MS-10; `open→accepted` T-CO-16; `open→declined` T-CO-27, T-MS-07; `open→expired` T-CO-19, T-CO-21, T-MS-06; `→superseded` T-CO-16; `open→canceled` on claim re-check (`recheck_failed`) T-CO-25; `→canceled` on STOP T-MS-15; `→expired` at cutoff T-CO-21, T-MS-09; `accepted` stays `accepted` with `close_reason` after S-15/S-16/S-17, and a later claim succeeds after S-15 T-CO-28; one live offer per courier T-CO-13, T-CO-23; terminal immutability T-CO-24.

### 6.5 MessagingIdentityStatus paths → tests

| Path | Tests |
|---|---|
| Seeded `awaiting_join` → `joined` via JOIN (space + sender IDs stored, `join_ack` with disclosure and STOP) | T-MS-15, T-MS-13 (real) |
| `opted_out` → `joined` via JOIN (new `joined_at`) | T-MS-15 |
| `joined` → `opted_out` via STOP; open/`pending_send` offers `canceled`; only `stop_ack` sent | T-MS-15 |
| STOP while holding a `claimed` assignment → S-15 back to `eligible` and re-offered (`COURIER_OPTED_OUT`); STOP after `collected` → S-17 `needs_review`; no S-11/`offer_closed` message to that handle | T-MS-15, T-CO-28 |
| Donor identity: JOIN → `joined`; photo from a joined donor → `draft_ready`; photo from an `awaiting_join` donor → `rejected`, no reply, no download; donor STOP revokes links | T-MS-15, T-MS-18, T-CO-30 |
| Unknown handle (JOIN or any text) → outcome `ignored`, `reply: null`, never auto-registered | T-MS-15, T-MS-04 |
| `awaiting_join` identity or another courier's code sends YES → no assignment, nothing leaked | T-MS-04 |
| `awaiting_join` or `opted_out` courier excluded from matching (M-05) | T-CO-13 |
| Offer to a not-joined courier → `send_failed` (`courier_not_joined`) → next candidate | T-MS-10 |
| **`NOT_JOINED`**: any outbound except `stop_ack` to a non-joined identity → `NOT_JOINED`, `send` not called, attempt audited (also covers S-11/S-16 courier notices, which go only to `joined` identities) | T-MS-15, T-MS-10 |
| Operator view: IdentitySummary JOIN status, handles masked to last 4 | T-CO-22, T-UI-04, T-E2E-01 (scene 0 setup) |

### 6.6 Provider modes, session and simulated routes → tests

| Behavior | Tests |
|---|---|
| Fake provider visible (banner, `mode: "fake"` in artifacts and audit) | T-IN-01, T-UI-04, T-E2E-05 |
| Vision `misconfigured` (`VISION_PROVIDER=gemini`, key missing) → `PROVIDER_UNAVAILABLE`, never fake | T-IN-05 |
| Messaging `misconfigured` (`MESSAGING_PROVIDER=photon`, key missing) → `PROVIDER_UNAVAILABLE`, never fake | T-MS-10 |
| Banner shows each `misconfigured` provider | T-UI-04 |
| Simulated inbound/thread routes return 403 unless `MESSAGING_PROVIDER=fake` (and demo mode) | T-MS-14 |
| Session works at baseline (`DEMO_ACTORS`, signed cookie, `getActor`) | T-CT-02 |
| Operator/handoff/image/demo-reset routes reject wrong roles (403, no writes) | T-CO-29 |
| Tick, dispatch and simulated routes reject a missing secret or non-operator (403, no side effects) | T-MS-17 |
| `/api/health` shows modes and status on the deployed URL | T-E2E-05 |
| Verification link: view never consumes; one atomic consumption; uniform 403; no session granted; `/v` headers | T-CO-30, T-IN-13, T-UI-07 |
| Unknown sender's photo: no download, no AI call, no reply, logged without personal data | T-MS-18, T-CO-31 |

### 6.7 Required edge tests (CLAUDE.md) → test IDs (identical to MVP_SCOPE §4)

| Required edge (CLAUDE.md) | Test IDs | Owner |
|---|---|---|
| Ambiguous image | T-IN-03, T-PE-02, T-PE-05 | Dev 1 |
| Unknown allergen | T-CO-09, T-IN-08 | Dev 2 |
| Missing holding history | T-CO-04 | Dev 2 |
| Non-approved donor | T-CO-02 | Dev 2 |
| Ineligible recipient | T-CO-12 | Dev 2 |
| No response | T-MS-06 | Dev 3 |
| Simultaneous claims | T-CO-16, T-CO-17 (required, real Postgres) | Dev 2 |
| Duplicate inbound event | T-MS-03 | Dev 3 |
| Late claim | T-CO-19, T-MS-08 | Dev 2 / Dev 3 |
| Cutoff reached | T-CO-08, T-CO-21, T-CO-28, T-MS-09 | Dev 2 / Dev 3 |
| Failed provider delivery | T-MS-10 | Dev 3 |
| Authorization | T-CO-22, T-CO-26, T-CO-29, T-CO-30 (verification link), T-MS-04, T-MS-17, T-MS-18 (photo from an unknown or non-joined sender), T-CT-02 (captain: session) | Dev 2 / Dev 3 |

## 7. Fixtures plan

| Fixture set | Owner | Location | Contents | Rules |
|---|---|---|---|---|
| Typed contract fixtures | Captain | `src/contracts/fixtures` (generated at baseline) | `DEMO_ACTORS` (`demo-actors`: fixed UUIDs, roles, display names, no handles); one DonationCard per DonationStatus (11; 3 at baseline, the rest in `chore/integration-contracts-2` by 2:30 PM); demo scenes 1–3; a `VerificationLinkView` and a `DraftReadyView`; `scene1_eligible_facts`; valid and invalid VisionSuggestion / `VisionModelOutput` variants; `OfferMessageView` examples (codes `K7M3`, `H4M9`); one ClaimResult per ClaimResultCode; InboundResult examples; IdentitySummary list; SystemModes (all-real, each-fake, each-misconfigured, stale tick) | Validated by T-CT-01. Lanes import; never copy or fork. Changes go through a contract-change request (`docs/requests/<lane-slug>-<topic>.md`). Names never contain "safe". |
| Seed personas | Dev 2 | `src/db/seed/` (`pnpm db:seed`) | ARCHITECTURE §7: 3 donors (approved, pending, suspended); 4 recipients (Eastlake Community Pantry, Youth Meals Program, unregistered DFDO, HSP-serving; all "(synthetic)"); couriers A, B (cold), C (no cold); a donor messaging identity for the approved donor; 1 policy row. IDs from `DEMO_ACTORS`. | Deterministic; times relative to reset time or test clock; `is_synthetic: true`; no real names or addresses. Handles come from env `DEMO_DONOR_HANDLE`, `DEMO_COURIER_A_HANDLE`, `DEMO_COURIER_B_HANDLE` at runtime, never committed; if unset, synthetic `@example.invalid` placeholders usable only with fake messaging. |
| Synthetic intake images | Dev 1 | `fixtures/intake/images/` | `sandwich_platter.jpg`, `buffet_ambiguous.jpg`, `pasta_tray.jpg`, `dessert_bars.jpg`, `blurry.jpg`, `non_food.jpg`, `sushi_tray.jpg`, `packaged_label.jpg`, `injection_note.jpg`; fake-only `malformed_output.jpg` | Fake vision recognizes fixtures by SHA-256 of their bytes. ≤ 1.5 MB decoded, ≤ 1024 px. See provenance rules below. |
| Photon envelopes | Dev 3 | `tests/messaging/` (lane-local) | `message.received`, `message.accepted`/`delivered`/`failed`/`dispatched`, malformed bodies | Built from the OpenAPI shape (R-PH-8). Envelopes captured at the spike are scrubbed: handles, IDs and names replaced with placeholders before commit. |

**Image provenance rules (Dev 1; R-AI-5, D-012):**

1. Team-taken at the event (at or after Sat 12:30 PM PDT) or CC0 with a source URL.
2. No faces, people, brand logos, real business labels, addresses, phone numbers or license plates. The T-PE-07 label is team-made and unbranded.
3. `fixtures/intake/PROVENANCE.md` lists each file: who made it, when, license, and a "checked: no personal or brand content" line.
4. Images are inputs to a free-tier model whose inputs may be used to improve Google products. Treat every committed image as public (the repo is public from kickoff, D-023).
5. **Eval photos of unknown or unverified licence are never committed (D-040).** They live in `fixtures/intake/eval-local/`, which is gitignored; the eval tests and the real-model eval skip cleanly when those files are absent. Only images that meet rule 1 are committed, including every image the fake provider hashes or a demo scene uses.

## 8. Evidence recording format

Record every run in the lane handoff (`docs/handoffs/dev-N.md`) or PR body using this block. The captain copies verified rows into §9.

```text
TEST IDS:      T-CO-16, T-CO-18
COMMAND:       pnpm test tests/core
EXIT CODE:     0
DATE/TIME:     2026-10-17 15:42 PDT
COMMIT SHA:    <full sha>   BRANCH: feat/dispatch
STORE:         pglite | postgres (disposable) | n/a
PROVIDERS:     vision=fake | real(<model id>); messaging=fake | real(photon)
RESULT:        <passed> passed / <failed> failed / <skipped> skipped
STATUS:        PASS | FAIL | UNVERIFIED (<reason, e.g. TEST_DATABASE_URL not set>)
EVIDENCE:      <provider_message_ids, model id, screenshot path; never secrets or handles>
```

Rules: real vs fake is always stated. A skipped gated test is **UNVERIFIED**. A manual test without screenshots or IDs is **UNVERIFIED**. A FAIL stays in the log; the fix gets a new row.

## 9. Results log

**No tests run yet.** As of 2026-10-15 (pre-event) no code exists. First expected entry: CP0a baseline smoke (Sat Oct 17, 1:15 PM PDT target), then CP0b on every machine (1:30 PM).

| Date/time (PDT) | Test IDs | Command | Exit | Commit SHA | Real / fake | Status | Recorded by |
|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | — |
