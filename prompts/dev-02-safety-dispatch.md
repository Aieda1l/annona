# Dev 2 — Safety gate + matching + state + DB · Annona (DubHacks 2026) bootstrap prompt

> **Prompt version:** v1.3 (generated 2026-10-15 by the master bootstrap; revised 2026-10-16 for D-029 and D-031..D-034; revise only via the captain). The contracts version lives only in the `docs/CONTRACTS.md` header (D-034).
> **How to use:** Paste everything below the horizontal rule into **Dev 2's own Claude Code session** (your own Claude Pro account), started in **your own clone or git worktree** of the Annona repo, **after** the captain has pushed the shared baseline. The baseline is the git tag `baseline`. `BASELINE_SHA` below means the commit that tag points to, which the captain posts in team chat. You do not need to edit this prompt.

---

## 0. Preconditions — check these first (stop if any fails)

1. It is **at or after Saturday Oct 17, 2026, 12:30 PM PDT**. DubHacks Rule 10 forbids coding or building before then (`docs/RESEARCH.md` R-DH-3). If it is earlier, stop: you may only read the docs.
2. The captain has pushed the shared baseline: `git fetch --tags origin && git rev-parse 'baseline^{commit}'` prints a 40-character SHA equal to the `BASELINE_SHA` the captain posted. If the tag is missing or the SHAs differ, **stop and ask the captain**. Never scaffold your own project or invent missing contracts.
3. You are in **your own clone or git worktree** (never a working tree another Claude session uses), on branch `feat/dispatch` created from the tag:
   `git switch -c feat/dispatch baseline` (or `git switch feat/dispatch` if it already exists). Confirm with `git status`, `git log -1 --oneline` and `git merge-base --is-ancestor baseline HEAD && echo baseline-ok`.
4. Session hygiene: run `/status` (remaining Pro usage), then `/model sonnet` and `/effort medium`. Switch to `opus`/`high` only for a hard concurrency or debugging problem, and only if your quota allows. Confirm `ANTHROPIC_API_KEY` is **not** set (it would bill the API instead of your subscription). You are one of four humans, each in their own session: do not spawn agent swarms or parallel background sessions on this repo.
5. Copy `.env.example` to `.env.local` (gitignored). Leave provider keys empty unless you own them. Fakes are the default and the app must run without any keys.
6. Read the contracts version from the `docs/CONTRACTS.md` header (the only place it is stated, D-034) and confirm it equals the version the captain posted with `BASELINE_SHA`. If they differ, stop and ask the captain which version to build against.
7. Confirm the baseline contains: `src/contracts/**` (types, Zod schemas, ports, typed fixtures including `src/contracts/fixtures/demo-actors` with `DEMO_ACTORS`); your typed-stub barrels `src/core/index.ts` and `src/db/index.ts`; `src/server/container` (`getServices()`), `src/server/env` (`getEnv()`), `src/server/session` (`getActor(request)`); and `drizzle.config.ts` pointing at `src/db/schema.ts` and `src/db/migrations/`. If any is missing, stop and ask the captain.
8. Set `STORE=pglite` in `.env.local` for local work. You receive the shared Supabase `DATABASE_URL` and the courier handles `DEMO_COURIER_A_HANDLE` / `DEMO_COURIER_B_HANDLE` from the captain **only by private message**, never in git or the team chat.

## 1. Role and context

You are **Dev 2**, one of four humans, each running their own Claude Code session. Your lane owns the **deterministic eligibility gate, matching and feasibility, the donation and offer state machine, the atomic claim, the database schema/migrations/seed, and the read models** every other lane depends on. You deliver an auditable dispatch core, not a food-safety oracle.

**Product in three sentences.** Annona lets an approved synthetic donor kitchen text a photo of surplus food (web upload is the fallback), have AI draft an *uncertain* description, and verify every fact on a structured checklist opened from a one-time link (D-031). A deterministic gate decides whether the donation is eligible for dispatch, and an eligible recipient-affiliated courier gets a time-limited iMessage offer (Photon 2.0, or a labeled simulated phone). Exactly one valid claim wins, and the operator dashboard shows server truth.

**Safety framing (non-negotiable).** AI describes, humans verify, backend enforces. **You are the "backend enforces".**
- `eligible` means *eligible for dispatch under the prototype operator policy, based on donor-attested records*. It never means safe to eat, allergen-free, compliant or certified.
- The gate never reads `ai_suggestion`. `unknown` never yields `eligible`. No operator action can override an unknown or rejected fact.
- Prototype scope: refrigerated food, prepared cold or commercially packaged, from approved licensed kitchens (DESIGN DECISION D-007). It is a prototype restriction, not a statement of law (no legal advice).
- Time and consent are re-checked after the claim too (D-025): collection, delivery, no-show and courier STOP all have server-side guards.
- **Safety and dispatch outcomes are separate (D-032).** `needs_review` is only for safety or human review. "No feasible courier/recipient" is the status **`unmatched`** (reason severity `dispatch`). Courier STOP before pickup releases the assignment back to `eligible` (S-15); STOP after pickup goes to `needs_review` and is never reassigned (S-17).
- **You own the verification-link security (CONTRACTS §3.16, §8.4; AC-17).**

**What "done" looks like for your lane:**

| Checkpoint | Your lane is done when |
|---|---|
| CP1 Sat 4:00 PM | PR 1a (pure gate + matching + state) **and** PR 1b (Drizzle schema + migrations + deterministic seed + PGlite store) merged or under review (D-027) |
| CP1.5 Sat 5:15 PM | Sub-PRs 2(a) intake-facing and 2(b) dispatch-facing merged |
| CP2 Sat 6:30 PM | 2(c) read models merged; Dev 1/3/4 wired to your barrels; scenes 1–3 run end to end with fakes on `main` (web fallback) |
| ~7:00 PM | 2(d) verification links merged (T-CO-30, T-CO-31) |
| CP3 Sat 9:00 PM | Migrations + seed applied on the shared Supabase project; demo runs with `STORE=postgres`; **T-CO-17 run and passing** (required, D-033: until it passes, AC-06 is not done and nobody may call claims race-safe) and the Postgres half of T-CO-23 run |

## 2. Read first: `docs/KICKOFF.md`, then reference as needed

Read **`docs/KICKOFF.md`** first (about 10 minutes; D-034). The list below is **reference, in priority order**: open each item when the slice in front of you needs it, not all up front.

1. `CLAUDE.md` (operating contract; safety boundaries).
2. `docs/PROJECT_STATE.md` (baseline SHA, blockers, next actions).
3. `docs/MVP_SCOPE.md` §2 (AC-04..AC-09), §3, §4 (edge tests), §5 (demo scenes).
4. `docs/CONTRACTS.md`: §1, §2 + §2.1 (reason catalogue incl. `dispatch` severity, `PICKUP_NOT_COLLECTED`, `COURIER_OPTED_OUT`, `COURIER_OPTED_OUT_AFTER_PICKUP`), §3.1–§3.9, §3.10 (STOP semantics, joined-only outbound, `OfferMessageView`), §3.11 (audit `data` rule), §3.12, §3.13 (projections), §3.15, **§3.16 (VerificationLink)**, **§4 (S-01..S-18), §5 (gate), §6 (matching), §7 (timers), §8 (claim, §8.4 links)**, **§9.0 + §9.3**, §10 (Dev 2 rows), §11 (incl. the ignored-sender logging rule), §12.
5. `docs/OWNERSHIP.md` (all; especially §1, §2, §3, §6, §7, §8).
6. `docs/ARCHITECTURE.md` §4, §5, §6, **§7 (schema + seed)**, §8, §9 (canonical secret scan), §13.
7. `docs/TEST_PLAN.md` §5.0 (must-run tier) and §5.2 (T-CO-01..T-CO-31), and the §6 coverage matrix.
8. `docs/DECISIONS.md` D-005, D-006, D-007, D-009, D-010, D-013, D-021, D-023..D-027, D-029, **D-031..D-033**.
9. `docs/plans/active/kickoff-baseline.md` (what the baseline created), `docs/ROADMAP.md` (cut order), `docs/handoffs/dev-2.md` (if it exists).
10. The generated `src/contracts/**`, `src/server/**` and your stub barrels (read only, except your barrels).

Do **not** re-read all of `PROJECT_IDEA.md`; the approved docs supersede it.

## 3. Ownership — what you may and may not edit

| | Paths (exactly as `docs/OWNERSHIP.md` §1/§3) |
|---|---|
| **You own** | `src/core/**` (incl. `http/`), `src/db/**` (incl. `migrations/`, `seed/`), `tests/core/**` |
| **Your lane files in shared folders** | `docs/handoffs/dev-2.md`, `docs/requests/dispatch-<topic>.md`, `docs/plans/active/dev-2-<topic>.md` |
| **Never edit** | `src/features/**`, `src/lib/**`, `src/integrations/**`, `src/workflows/**`, `src/app/**`, `src/components/**`, `src/contracts/**`, `src/server/**`, root config (`package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `next.config.*`, `eslint.config.*`, `vitest.config.*`, `drizzle.config.ts`, `.env.example`, `.gitignore`), `.claude/**`, `CLAUDE.md`, `README.md`, `prompts/**`, shared docs |

- Migrations live in `src/db/migrations/`, **not** `supabase/migrations/` (DESIGN DECISION D-005).
- **Barrels:** the captain created `src/core/index.ts` and `src/db/index.ts` as typed stubs returning `NOT_IMPLEMENTED`. You now own them. Replace stubs with real exports and keep every exported name stable (CONTRACTS §9.0). Other lanes import you only via `@/core` and `@/db`; you import nothing from `@/features`, `@/lib`, `@/integrations` or `@/workflows`.
- **Thin routes:** `src/app/api/**/route.ts` only re-exports your handler, e.g. `export { GET } from "@/core/http/dashboard"`. You replace the `NOT_IMPLEMENTED` stubs in `src/core/http/*`; you never touch the route file.
- **Composition root:** `src/server/container` calls your `createDispatchStore({ kind, database_url, pglite_dir })` from `@/db` once, with config from `getEnv()`. You own the `pglite`/`postgres` switch inside the factory; the container does not change. Never read `process.env` directly.

## 4. Contracts you consume and provide

**Consume (import from `@/contracts`; never redefine):** `VerifiedFacts`, `VisionSuggestion`, `VerificationLinkView`, `DonorProfile`, `RecipientOrg`, `CourierProfile`, `MessagingIdentity`, `PolicyConfig`, `EligibilityDecision`, `MatchCandidate`, `Offer`, `OfferMessageView`, `ClaimCommand`, `ClaimResult`, `DeclineCommand`, `DeclineResult`, `InboundMessage`, `DeliveryStatusEvent`, `OutboundMessage`, `AuditEvent`, `DonationCard`, `DashboardSnapshot`, `SystemModes`, `OfferSummary`, `IdentitySummary`, `Result`, `ErrorCode`, `Actor`, `Clock`, the `DispatchStore` port, all §2 enums, `DEMO_ACTORS` from `@/contracts/fixtures/demo-actors`, and the typed fixtures in `@/contracts/fixtures` (incl. `scene1_eligible_facts`, the sandwich-platter policy-eligible demo facts, and the three demo scenes).

**Consume from the composition root (CONTRACTS §9.0, verbatim):**

- `getServices()` — `@/server/container` (captain): `→ { vision: VisionProvider, messaging: MessagingGateway, store: DispatchStore, clock: Clock }`. A memoized process singleton (stored on `globalThis` so Next dev reuses it).
- `getEnv()` — `@/server/env` (captain): Zod-parsed env (§12). Lanes never read `process.env` directly.
- `getActor(request)` — `@/server/session` (captain): `→ Promise<Actor | null>`. Verifies the signed session cookie. **Ships working in the baseline.**
- `DEMO_ACTORS` — `@/contracts/fixtures/demo-actors` (captain): Fixed UUIDs, roles and display names for every demo persona. No handles. Used by the session picker and Dev 2's seed.
- **Dependency injection for tests.** Core and workflow functions take an optional last argument `deps?: { store?, clock?, messaging?, vision? }`. When it is omitted, they use `getServices()`. Tests pass `deps` explicitly. No lane imports another lane's internals or mocks it by monkey-patching.

**Ports (CONTRACTS §9.1, verbatim):** `DispatchStore` — an **opaque handle** `{ kind: StoreKind }`. Its internals (Drizzle client, repositories) are private to Dev 2. The public surface is the §9.3 functions, which receive the handle via `deps`/`getServices()`. `Clock` — `now()`; fake: `createTestClock(start)` (Dev 2), fixed and advanceable.

**Provide (CONTRACTS §9.3, verbatim; export from `@/core` / `@/db`):**

- `evaluateEligibility(input) → EligibilityDecision` (pure). Input `{ facts: VerifiedFacts, donor: DonorProfile, policy: PolicyConfig, now }`. **The signature does not accept a `VisionSuggestion`.** Rules G-01..G-13.
- `findCandidates(input) → MatchCandidate[]` (pure). Input `{ donation, facts, recipients, couriers, identities, policy, now, excluded_courier_ids }`. Rules M-01..M-10.
- `storeDonationImage({ mime, bytes }) → Promise<Result<{ image_id }>>`.
- `createDraft({ actor, image_id, source, source_ref }) → Promise<Result<DonationCard>>` (S-01; checks donor role/approval; returns the existing draft when `(source, source_ref)` already exists).
- `attachAiResult({ donation_id, result: { ok: true, suggestion } | { ok: false, error_code } }) → Promise<Result<DonationCard>>` (S-02). Dev 1 calls these. Dev 1 never writes donation rows directly.
- `submitVerification({ auth: { actor } | { link_token }, donation_id, facts, edited_from_ai }) → Promise<Result<{ card: DonationCard, resubmit_token: string | null }>>` (S-03; the link path consumes the link in the same transaction, §8.4).
- `issueVerificationLink({ donation_id }) → Promise<Result<{ link_id, token, expires_at }>>`, `getVerificationLinkView({ token }) → Promise<Result<VerificationLinkView>>`, `getVerificationLinkImage({ token }) → Promise<Result<{ mime, bytes }>>` (§8.4; read-only checks never consume).
- `createNextOffers({ donation_id }) → Promise<Result<Offer[]>>` (S-04, S-05 → `unmatched`, or S-18).
- `openOfferForSend({ offer_id }) → Promise<Result<{ offer, identity, message_view: OfferMessageView }>>`, `markOfferSendFailed({ offer_id, reason })`, `recordOfferProviderMessage({ offer_id, provider_message_id })`.
- `recordStatusEvent(evt: DeliveryStatusEvent) → Promise<"first" | "duplicate">`. A dedupe insert on `(provider, provider_event_id)`. On `first`, Dev 3 then calls `recordDeliveryStatus(evt)`, which updates the matching offer's `delivery_status`. A `failed` status on an `open` offer additionally calls `markOfferSendFailed`.
- `claimOffer(ClaimCommand) → Promise<ClaimResult>`, `declineOffer(DeclineCommand) → Promise<DeclineResult>`.
- `expireDue() → Promise<{ expired_offer_ids, expired_donation_ids, dispatchable_donation_ids }>`, `listPendingSendOffers()`, `listDispatchableDonations()`.
- `resolveIdentityByHandle(provider, handle) → Promise<MessagingIdentity | null>`, `getIdentity(identity_id)`, `joinIdentity({ identity_id, provider_space_id, provider_sender_id })`, `optOutIdentity({ identity_id })` (one transaction: cancels open offers; applies S-15, S-16 or S-17 to a held assignment; revokes a donor's live links), `findOpenOffersForCourier(courier_id)`.
- `recordInboundMessage(...)`, `recordStatusEvent(...)`, `saveInboundResult(...)`, `recordOutboundMessage(...)`, `listMessages({ identity_id? })` (masks verification tokens unless `MESSAGING_PROVIDER=fake`), `recordIgnoredInbound({ provider, provider_message_id, reason, handle_masked })`.
- `recordHandoff({ actor, donation_id, step, simulated: true })`, `operatorAction({ actor, donation_id, action, note })`.
- `getDonationCard(actor, id)` (role-projected, §3.13), `getDashboardSnapshot(actor)`, `setLastTick(at)`, `getSystemStatus() → Promise<{ last_tick_at: string | null, store: StoreKind, policy_version: string }>`, `resetDemo({ keep_identities: true })`. `resetDemo` deletes all offers, so short codes become free again.
- `createDispatchStore({ kind, database_url, pglite_dir }) → DispatchStore`, `createTestClock(start)`.

Core functions get time from the injected `Clock`. None of them accepts a client timestamp. Expected failures return `Result<T>`; claim/decline outcomes are results, not errors (CONTRACTS §3.15).

**Your callers (CONTRACTS §9.2/§9.4, verbatim; context only, never import them):** Dev 1 `submitDonorVerification({ actor, donation_id, raw }) → Promise<Result<DonationCard>>` (parses, computes `edited_from_ai`, calls your `submitVerification`); Dev 3 `tick() → Promise<TickReport>` and `dispatchDonation(donation_id) → Promise<TickReport>`. "Dev 1 does **not** trigger dispatch. The tick picks up `eligible` donations (D-021)."

**Traceability (function → rules → tests):**

| Function | Rules / transitions | Tests |
|---|---|---|
| `evaluateEligibility` | G-01..G-13; outcome precedence (CONTRACTS §3.7) | T-CO-01..T-CO-11 |
| `findCandidates` | M-01..M-10 | T-CO-12, T-CO-13 |
| `createNextOffers` | S-04, S-05 (`unmatched`), S-18; gate re-run with current `now` | T-CO-14 |
| State guard | S-01..S-18; offer transitions (CONTRACTS §4.2) | T-CO-15, T-CO-24, T-CO-28 |
| `claimOffer` | CONTRACTS §8.1 steps 1–9; S-07; `open → canceled` (`recheck_failed`) | T-CO-16..T-CO-20, T-CO-25, T-CO-26 |
| `declineOffer` | §4.2 `open → declined`; lazy expiry | T-CO-26, T-CO-27 |
| `expireDue`, `markOfferSendFailed` | S-06, S-08 (`CUTOFF_REACHED`), S-16 (`PICKUP_NOT_COLLECTED`) | T-CO-21, T-CO-24, T-CO-28 |
| `recordHandoff`, `optOutIdentity`, `operatorAction` | S-09/S-10 time guards, S-15/S-16/S-17 on STOP, S-11..S-14, S-18 | T-CO-15, T-CO-28 |
| Verification links, `createDraft` idempotency, ignored-sender logging | CONTRACTS §3.16, §8.4, §11; S-03 link path | T-CO-30, T-CO-31 |
| Read models, handlers, audit `data` rule | CONTRACTS §3.11, §3.13, §11 | T-CO-22 |
| Schema, migrations, seed | ARCHITECTURE §7; `DEMO_ACTORS` IDs | T-CO-23 |

**HTTP handler modules you own (CONTRACTS §10):** `src/core/http/donation` (`GET /api/donations/:id`), `dashboard` (`GET /api/dashboard`), `operator` (`POST /api/donations/:id/operator-actions`), `handoff` (`POST /api/donations/:id/handoff`), `images` (`GET /api/images/:id`), `demo` (`POST /api/demo/reset`, demo mode only). The actor always comes from `getActor(request)` in `@/server/session`, never from the body. Bodies are Zod-parsed with `.strict()`.

## 5. Slice 1 — first 30–60 minutes

**First-hour target:** the test clock plus T-CO-01..T-CO-11 (the pure gate) green. The rest of slice 1, including the early schema/migrations/seed/PGlite PR, is the CP1 (4:00 PM) target.

Two PRs, both by CP1 (D-027). PR 1a is pure functions (no DB, no network). PR 1b is the persistence skeleton the other lanes' sub-PRs build on. File names marked *(suggested)* are not fixed by the docs.

1. Write `docs/plans/active/dev-2-gate-matching.md` (≤ 15 lines: files, tests, done criteria).
2. `src/core/clock.ts` *(suggested)*: `createTestClock(start)` implementing the contract `Clock` (fixed, advanceable) plus a system clock.
3. **RED first:** `tests/core/eligibility.test.ts` *(suggested)* for **T-CO-01..T-CO-11**, built from `scene1_eligible_facts` in `@/contracts/fixtures`:
   - T-CO-01 `scene1_eligible_facts` → `eligible`, zero reasons.
   - T-CO-02..T-CO-10 one rule group each (G-01..G-13), checking `code`, `severity`, `field` (paths like `allergens.sesame`) and the `field_states` badge.
   - T-CO-11 property test: mutate **each** `VerifiedFacts` field of `scene1_eligible_facts` to `unknown`/`null` (where the type allows) → outcome ≠ `eligible`; plus a type-level test (`// @ts-expect-error` or `expectTypeOf`) that `evaluateEligibility` rejects a `VisionSuggestion`.
4. **GREEN:** `src/core/eligibility.ts` *(suggested)*. Evaluate **all** rules (no short-circuit); precedence: any reject → `rejected`, else any review → `needs_review`, else `eligible`. One `ALLERGEN_UNKNOWN` per unknown allergen with `allergen` set and `field: "allergens.<name>"`. Stamp `policy_id`, `policy_version`, `evaluated_at = now`. Plain-language `message` a donor can act on; never the word "safe".
5. **RED → GREEN:** `tests/core/matching.test.ts` *(suggested)* for **T-CO-12, T-CO-13** and the pure part of **T-CO-14** (`NO_ELIGIBLE_MATCH` vs `CANDIDATES_EXHAUSTED` selection), then `src/core/matching.ts` *(suggested)*: M-01..M-10, haversine ETA ÷ `average_speed_kmh` rounded up, `slack_minutes`, rank by `estimated_dropoff_at` then `courier_id`. Include exactly-at-boundary cases for M-10.
6. **RED → GREEN:** `tests/core/state.test.ts` *(suggested)* for **T-CO-15** and the transition-table part of **T-CO-28**, then `src/core/state.ts` *(suggested)*: donation transition table **S-01..S-18** and offer transition table (CONTRACTS §4.2, incl. `open → canceled` on `recheck_failed`) with a guard `canTransition(from, to, trigger)`. Terminal states immutable; S-14 only from `unmatched` (cutoff and a fresh gate run re-checked, else S-18); S-03/S-13 refuse a donation with `collected_at` set; no transition takes client time.
7. Open **PR 1a** `[Dev 2] pure gate + matching + state`.
8. **PR 1b (persistence skeleton):** `src/db/schema.ts` (path fixed by `drizzle.config.ts`) exactly per ARCHITECTURE §7: `text` + CHECK constraints (no PG enums); `location` jsonb and `capabilities` jsonb with contract field names (no mapping layer); `serves_highly_susceptible_population`; **partial unique indexes** `offers(donation_id) WHERE status='accepted' AND close_reason IS NULL` and `offers(courier_id) WHERE status IN ('pending_send','open')` (D-029); `inbound_messages.processing_started_at`, nullable `sender_handle`/`payload` plus `handle_masked` and `ignore_reason`; `donations.source_ref` with `UNIQUE (source, source_ref)` where non-null and `donations.collected_at`; the `verification_links` table (`token_hash` unique, no raw-token column, partial unique live link per donation; D-031); `UNIQUE (short_code)` with **no** WHERE clause (D-026); `UNIQUE (provider, provider_message_id)` on `inbound_messages`; `UNIQUE (provider, provider_event_id)` on `provider_status_events`; `UNIQUE (idempotency_key)` on `outbound_messages`; `UNIQUE (provider, handle)` on `messaging_identities`; `timestamptz` everywhere. Plus `createDispatchStore({ kind, database_url, pglite_dir })` with the PGlite driver, generated migrations, the deterministic seed (§6 step 3) and the PGlite half of **T-CO-23**.

**Done when:** `pnpm test tests/core` shows T-CO-01..T-CO-15 and the PGlite half of T-CO-23 passing (T-CO-14 pure part), `pnpm typecheck` and `pnpm lint` pass, and PRs 1a and 1b are open with the §15 block. Reviewer: Dev 3 (gate rules need their explicit OK).

## 6. Slice 2 — next increment

Persistence + service, shipped as **four sub-PRs** (D-027, D-031), each < 400 changed lines. Post "available now on main: <functions>" in team chat as each merges:
**2(a)** intake-facing: `storeDonationImage`, `createDraft` (with `source_ref` idempotency), `attachAiResult`, `submitVerification` (session path), `getDonationCard` (Dev 1 wires; Dev 1 needs the stored `ai_suggestion` for `edited_from_ai`) → **2(b)** dispatch-facing: `createNextOffers` (incl. `unmatched`), `openOfferForSend`, claim/decline, `expireDue`, identities (incl. STOP S-15/S-16/S-17), inbound/outbound/status recording, `recordIgnoredInbound` (Dev 3 wires) → **2(c)** read models: `getDashboardSnapshot`, `getSystemStatus` (Dev 4 wires; `getDonationCard` already in 2(a)) → **2(d)** verification links, ~7:00 PM: `issueVerificationLink`, `getVerificationLinkView`, `getVerificationLinkImage`, the link path of `submitVerification` (Dev 1 and Dev 3 wire). **CP1.5 (5:15 PM): 2(a) and 2(b) merged.** 2(d) never delays 2(a)–2(c).

1. **Store** `src/db/client.ts` *(suggested)*: drivers `pglite` (`pglite_dir`, or in-memory for tests) and `postgres` (postgres.js). VERIFIED SOURCE R-INF-7: on Vercel use the Supabase transaction pooler (port 6543) with `prepare: false`; persistent processes (worker) use the session pooler (5432). Repositories in `src/db/repo/` *(suggested)*. One Drizzle implementation, two drivers, no hand-written second store (DESIGN DECISION D-006); tests use the PGlite-backed store. If `kind: "postgres"` arrives without `database_url`, fail loudly; never silently switch drivers.
2. **Migrations:** generate into `src/db/migrations/` (`pnpm db:generate`, planned), apply with `pnpm db:migrate` (planned; runner `src/db/migrate.ts` *(suggested)*). Replayable from empty.
3. **Seed** `src/db/seed/` (`pnpm db:seed`, planned): deterministic, synthetic, times relative to "now", personas exactly per ARCHITECTURE §7, with **every persona ID taken from `DEMO_ACTORS`** (T-CO-23 asserts this): approved "Rainier Catering (synthetic)" + 1 pending + 1 suspended donor; "Eastlake Community Pantry (synthetic)", "Youth Meals Program (synthetic)" (excludes `peanuts`, `tree_nuts`), 1 not-registered DFDO, 1 HSP-serving recipient; couriers A and B (cold transport, Eastlake) and C (no cold transport); a **donor messaging identity** for Rainier Catering (handle from `DEMO_DONOR_HANDLE`, else `donor@example.invalid`); recipient capacities large enough for every demo scene in sequence, because M-04 counts delivered donations until `resetDemo` (e.g. Eastlake 200 servings); 1 active `policy_config` row (`annona-prototype-refrigerated` / `2026-10-17.1`). Courier A/B handles come from `getEnv()` `DEMO_COURIER_A_HANDLE` / `DEMO_COURIER_B_HANDLE`. If unset, seed obviously synthetic `fake`-provider handles (e.g. `courier-a@example.invalid`), usable only with fake messaging; if messaging is `photon` and a handle is missing, stop with a clear error. Never write a phone-number literal in source (the canonical secret scan flags it).
4. **Core service** `src/core/service.ts`, `claims.ts`, `offers.ts`, `identities.ts`, `handoff.ts` *(all suggested)*. Every §9.3 function takes the optional trailing `deps`. Rules that matter most:
   - `submitVerification`: actor owns the donation (session path) **or** the link is consumed in the same transaction (`UPDATE verification_links SET consumed_at = $now WHERE token_hash = $h AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > $now RETURNING …` must affect exactly 1 row; every failure → the same `NOT_AUTHORIZED`, reason only in `link.rejected`); refuse `collected_at` set; **overwrite `attestation.attested_at` with the Clock**; run the gate; store decision + `effective_cutoff_at = min(donor_pickup_by, discard_by)`; revoke other live links; on `needs_review` via a link issue a fresh one as `resubmit_token`; audit.
   - `issueVerificationLink`: `crypto.randomBytes(32)` → base64url; store only the SHA-256 hex; `expires_at = min(issued_at + 30 min, effective_cutoff_at)`; revoke the previous live link; audit with `link_id` only. Never log or return the token anywhere except the function result. Do **not** import `@/workflows`: the next tick (≤ `TICK_INTERVAL_MS`) dispatches newly `eligible` donations; the operator's "Dispatch now" calls Dev 3's `dispatchDonation` (D-021).
   - `createNextOffers`: conditional `WHERE status='eligible'`; re-run the gate with current `now`; `findCandidates` excluding couriers already offered and couriers holding any `pending_send`/`open` offer (M-09); insert ≤ `offer_wave_size` `pending_send` offers with `ON CONFLICT DO NOTHING` on the courier index, moving to the next candidate when a row is not inserted (D-029) with a `short_code` from `ACDEFHJKMNPRTUVWXY3479`, unique across **all** offers until `resetDemo` (retry on collision; inject the random source for tests); a non-`eligible` gate re-run → S-18; none → S-05 **`unmatched`** (`NO_ELIGIBLE_MATCH` / `CANDIDATES_EXHAUSTED`, severity `dispatch`).
   - `openOfferForSend`: conditional `WHERE status='pending_send'`; identity not `joined` → `send_failed` (`courier_not_joined`); else `open`, `sent_at`, `expires_at = min(sent_at + response_window, donor_pickup_by − eta_to_pickup)`, committed **before** Dev 3 sends. Return `{ offer, identity, message_view }`; `message_view` is an `OfferMessageView` with `allergens_present` = allergens declared `present`, and never `address_line`, `pickup_instructions` or a handle.
   - `claimOffer`: CONTRACTS §8.1 **exactly**, steps 1–9 in order: resolve ref (a `short_code` resolves to its offer of **any** status) → authorize → `SELECT … FOR UPDATE` on the donation row → `already_claimed_by_you` → `already_claimed` → `donation_unavailable` → lazy expiry (`offer_expired`) → `offer_closed` → lock the recipient row (after the donation lock), then re-check G-01/G-09/G-10 + recipient and courier approval + M-04 capacity (`committed_servings`) + pair-level M-10 with `est_pickup = now + eta_to_pickup` (failure: offer `canceled` with `recheck_failed`, S-06 if no open offers remain, `ineligible`) → conditional updates that must affect exactly 1 row, supersede siblings, audit, commit. Map a partial-unique-index violation to `already_claimed`.
   - `declineOffer` (full `DeclineResultCode` matrix), `expireDue` (conditional updates; `FOR UPDATE SKIP LOCKED` when batching; S-06, S-08 with `CUTOFF_REACHED`, **S-16** `claimed` and not collected at `effective_cutoff_at` → `expired` with `PICKUP_NOT_COLLECTED`, accepted offer `close_reason = pickup_not_collected`; idempotent), `markOfferSendFailed` (S-06 when no open/pending offers remain).
   - `recordInboundMessage`: `INSERT … ON CONFLICT (provider, provider_message_id) DO NOTHING` → `first` | `duplicate` (CONTRACTS §8.2); a row with `result IS NULL` and `processing_started_at` older than 30 s is reclaimed by a conditional update and returns `first`; `saveInboundResult` is conditional on `result IS NULL`. `recordStatusEvent` dedupes on `(provider, provider_event_id)`; `recordDeliveryStatus` then updates the offer, and `failed` on an `open` offer calls `markOfferSendFailed`. `recordOutboundMessage` is unique on `idempotency_key`.
   - `joinIdentity`: `awaiting_join` **or** `opted_out` → `joined` with a new `joined_at`. `optOutIdentity`, one transaction: `opted_out`; that courier's `open`/`pending_send` offers → `canceled`; a `claimed` assignment with no collection and `now < effective_cutoff_at` → donation back to **`eligible`** with `COURIER_OPTED_OUT` (S-15, `dispatch`), accepted offer `close_reason = courier_opted_out`, `claimed_offer_id` cleared, `assignment.released` audited (the next tick re-offers); at or after the cutoff → S-16; a `collected` donation → **`needs_review`** with `COURIER_OPTED_OUT_AFTER_PICKUP` (S-17), never reassigned; a donor's STOP revokes that donor's live links.
   - `recordHandoff`: `simulated: true` only; S-09 needs `now < effective_cutoff_at` and a G-01 re-check and sets `collected_at`; S-10 needs `now < discard_by` when set; otherwise `INVALID_TRANSITION`.
   - `operatorAction(retry_matching)`: only from `unmatched` (S-14), only before the cutoff, gate re-run (else S-18). `reject`/`return_to_donor` only from `needs_review`; `return_to_donor` refuses `collected_at` set.
   - Every status change bumps `version` and writes an `audit_events` row with actor and provider `mode`. Audit `data` never holds a full handle, message text, `address_line` or `pickup_instructions` (use `identity_id` + last-4 masked handle).
5. **Read models** `src/core/read-models.ts` *(suggested)*: `getDonationCard` / `getDashboardSnapshot` per CONTRACTS §3.13/§11. Operator: full card, handles masked to the last 4 characters, `IdentitySummary` `{ identity_id, actor_role, actor_id, actor_display_name, provider, status, joined_at, handle_masked }`. Owning donor projection: offers reduced to `{ status, sent_at, expires_at }`; no `courier_display_name` or `provider_message_id` before `claimed`; timeline filtered to `donation.*`, `ai.*`, `donor.*`, `eligibility.*`, `claim.accepted`, `handoff.*`. `DonationCard.donor_area_label`, `OfferSummary.recipient_display_name`; timeline = latest 30 events; `getSystemStatus()` returns `last_tick_at`, the actual `store` driver and `policy_version`.
6. **Handlers** `src/core/http/{donation,dashboard,operator,handoff,images,demo}.ts`: actor from `getActor(request)`; `.strict()` Zod bodies; map `ErrorCode` to HTTP per CONTRACTS §3.15. `resetDemo` keeps messaging identities, deletes offers and verification links, and is disabled unless `ANNONA_DEMO_MODE=1`.
7. **Tests (RED first, per function):** T-CO-14 (service part), **T-CO-16** (PGlite race test: `Promise.all` of N = 2..10 claims, wave size 2 → exactly one `claimed`, one accepted row), **T-CO-17** (**required**, D-033: independent postgres.js clients, one connection each, through the transaction pooler like the demo, ≥ 20 rounds on `TEST_DATABASE_URL`; not run = **UNVERIFIED** and AC-06 not done), T-CO-18..T-CO-22, T-CO-23 (Postgres half if `TEST_DATABASE_URL`), T-CO-24..T-CO-28, **T-CO-29** (wrong role or no session on operator, handoff, image and demo-reset handlers → `NOT_AUTHORIZED`, no writes), **T-CO-30** (link lifecycle) and **T-CO-31** (`source_ref` idempotency, ignored-sender logging).

**Done when:** T-CO-01..T-CO-31 pass on PGlite, **T-CO-17 passes on real Postgres** (otherwise report AC-06 as not done) and the Postgres half of T-CO-23 runs; 2(a)/(b)/(c)/(d) merged; Dev 1, Dev 3 and Dev 4 have swapped their local test doubles for your barrels.

## 7. Example behaviors (write these as tests)

1. **Policy-eligible platter (scene 1, T-CO-01, T-CO-13).** *Given* `scene1_eligible_facts` from approved "Rainier Catering (synthetic)", all nine allergens declared, every attestation answered as required, `discard_by` and `donor_pickup_by` well in the future, *when* `evaluateEligibility` runs, *then* the outcome is `eligible` with zero reasons; *and when* `findCandidates` runs with the seed, *then* (Eastlake, Courier A) is a candidate and Courier C is excluded (M-07, no cold transport).
2. **Responsible refusal — safety-critical (scene 3, T-CO-03/04/09).** *Given* a pasta tray with `preparation_type=cooked_then_cooled`, `continuous_cold_holding=unknown`, `temperature_log_available=no`, `allergens.sesame=unknown`, everything else concrete and passing, *when* the donor submits, *then* the outcome is `needs_review` with exactly `COOLING_HISTORY_REVIEW`, `COLD_HOLDING_UNKNOWN`, `TEMPERATURE_LOG_MISSING`, `ALLERGEN_UNKNOWN` (`allergen: sesame`); `createNextOffers` creates **no** offer; `operatorAction(retry_matching)` fails with `INVALID_TRANSITION` because the donation is `needs_review`, not `unmatched`.
3. **Concurrent claims (T-CO-16).** *Given* a donation `offered` with two `open` offers (wave size 2), *when* both couriers' `claimOffer` calls run concurrently, *then* exactly one returns `claimed`, the other `already_claimed`, the sibling offer is `superseded`, and exactly one `accepted` offer row exists.
4. **Winner replay (T-CO-18).** *Given* Courier A already claimed, *when* the same `YES K7M3` is processed again, *then* the result is `already_claimed_by_you`, no state changes, and no second `claim.accepted` audit event exists.
5. **Late claim — failure (T-CO-19, scene 2).** *Given* A's offer `K7M3` with `expires_at` in the past (test clock advanced), no sweeper run, and B's offer `H4M9` now open, *when* A claims by short code, *then* the result is `offer_expired` (never `offer_not_found`), A's offer is marked `expired`, `assignment` is `null`, no address is disclosed, and B's offer is unaffected.
6. **Donor suspended after the offer opened — safety-critical (T-CO-25).** *Given* an `open` offer and the donor's `approval_status` changed to `suspended` afterwards, *when* the courier claims, *then* the result is `ineligible`, the offer is `canceled` with `close_reason = recheck_failed`, the donation returns to `eligible` (S-06) if no open offers remain, `assignment` is `null` and no address is disclosed.
7. **No-show and STOP after the claim (T-CO-28).** *Given* a `claimed` donation and the clock advanced to `effective_cutoff_at` (also when `discard_by` comes before `donor_pickup_by`) with no collection, *when* `expireDue` runs, *then* the donation is `expired` with `PICKUP_NOT_COLLECTED` (S-16), and `recordHandoff(collected)` now fails with `INVALID_TRANSITION`. *Given* instead a `claimed` donation whose courier texts STOP before pickup, *when* `optOutIdentity` runs, *then* the donation is back to `eligible` with `COURIER_OPTED_OUT` (S-15), the next tick offers Courier B (A excluded), and B's claim succeeds with exactly one active accepted offer. *Given* a `collected` donation whose courier texts STOP, *then* it is `needs_review` with `COURIER_OPTED_OUT_AFTER_PICKUP` (S-17), no tick re-offers it, and only `cancel`/`reject` with a note succeed.
8. **Previously served — failure (T-CO-05).** *Given* `previously_served=yes`, *when* the gate runs, *then* the outcome is `rejected` with `PREVIOUSLY_SERVED`, and no operator action can make it `eligible`.
9. **Authorization and disclosure (T-CO-22, T-CO-26).** *Given* Courier B and A's open offer code, *when* B claims it, *then* the result is `not_authorized` with no offer details; an unknown code returns `offer_not_found` with no writes; an offered-but-unclaimed courier's view has no `address_line` or `pickup_instructions`; the owning donor's card before the claim shows no courier name and no `provider_message_id`.
10. **Cutoff (T-CO-21).** *Given* an `offered` donation and `now >= effective_cutoff_at`, *when* `expireDue` runs, *then* the donation is `expired` with `CUTOFF_REACHED` and its open offers are `expired` (`cutoff_reached`); a second call changes nothing.
11. **No courier available (T-CO-14).** *Given* an `eligible` donation and no feasible pair, *when* `createNextOffers` runs, *then* it is `unmatched` with `NO_ELIGIBLE_MATCH` (severity `dispatch`), `latest_decision.outcome` is still `eligible`, and `reject`/`return_to_donor` fail with `INVALID_TRANSITION`; after a new courier joins, `retry_matching` → `eligible`.
12. **Verification link, safety-critical (T-CO-30).** *Given* an issued link, *when* it is viewed three times, *then* it is still live; *when* two submits race, *then* exactly one consumes it; expired, revoked, used and unknown tokens all return the same `NOT_AUTHORIZED`; no table or audit row holds the raw token.

## 8. Commands (planned at kickoff — verify first)

Run `cat package.json` first and use only scripts that actually exist. Planned names (created at kickoff): `pnpm test` (Vitest, all), `pnpm test tests/core` (your lane; use the exact lane-filter form the captain recorded in `docs/ARCHITECTURE.md` §3 at kickoff, and check the reported file count), `pnpm typecheck`, `pnpm lint`, `pnpm build`. If a planned script is missing or behaves differently, tell the captain. Do not add or rename scripts yourself. Never report a command as passing unless you ran it in this session and saw it pass.

Lane-specific (all **planned — verify**):

| Command | Purpose |
|---|---|
| `pnpm db:generate` | Generate a Drizzle migration into `src/db/migrations/` from `src/db/schema.ts` |
| `pnpm db:migrate` | Apply migrations to the store selected by `STORE` / `DATABASE_URL` |
| `pnpm db:seed` | Load the deterministic synthetic seed (ARCHITECTURE §7) |
| `pnpm test tests/core` with `TEST_DATABASE_URL` set | Run the Postgres-backed parts of T-CO-17 / T-CO-23 |

Before `pnpm db:migrate` against the **shared** Supabase project, tell the captain. Supabase Free has no automatic backups (VERIFIED SOURCE R-INF-1); migrations must be replayable from empty.

## 9. Workflow (identical for all four lanes)

**Understand → Plan → RED/GREEN → Review → Verify → Handoff.** Use **one** tool per phase. Do not run duplicate ECC and Superpowers ceremonies for the same phase. Pick ECC or Superpowers once for the whole event and stay consistent.

| Phase | Use exactly one of | Output |
|---|---|---|
| Understand | The §2 read-first list; only the code your slice touches | A 3-line restatement of the slice and the AC/test IDs it serves |
| Plan | Superpowers `writing-plans` **or** ECC `/ecc:plan` | `docs/plans/active/dev-2-<topic>.md`, ≤ 15 lines: files, tests, done criteria |
| RED/GREEN/REFACTOR | Superpowers `test-driven-development` **or** ECC `tdd-workflow` | A failing test first for every rule, parser, timer, claim or auth behavior; then minimal code; then tidy |
| Review | Optionally ECC `/code-review` (or `typescript-reviewer`) as a pre-check in your own session, **then** the human cross-lane reviewer named in `docs/OWNERSHIP.md` §6 | Comments resolved. No self-approval. |
| Verify | Superpowers `verification-before-completion` **or** ECC `verification-loop` | Real command output pasted into the PR. Anything not run is marked **UNVERIFIED**. |
| Handoff | A small PR to `main` plus an entry appended to `docs/handoffs/dev-2.md` | The §15 block |

Commit small, coherent slices on your own branch. When the captain announces a contract or shared-config merge, run `git fetch origin && git rebase origin/main` (or merge `main`) and re-run your tests. If a skill tries to start a long brainstorm or approval loop for a bounded slice, skip it: the design is already approved in `docs/`.

## 10. Missing keys and mock mode

- **You need no provider keys.** Gemini and Photon belong to Dev 1 and Dev 3. Your only external dependency is Postgres.
- **Default `STORE=pglite`:** zero setup, in-process; tests use an in-memory PGlite per test file and pass `deps: { store, clock }` explicitly. OPEN RISK: PGlite bundling inside `next dev` is untested (ARCHITECTURE §16). If it fails, point `STORE=postgres` at a **personal** free Supabase project (D-006), never at the shared demo DB, and tell the captain.
- **`DATABASE_URL`** (shared demo): from the captain by private message only. **`TEST_DATABASE_URL`** (CONTRACTS §12): optional, for T-CO-17 / T-CO-23 Postgres runs; a disposable personal project, never the shared demo DB.
- **Demo handles:** `DEMO_DONOR_HANDLE`, `DEMO_COURIER_A_HANDLE` and `DEMO_COURIER_B_HANDLE` are opted-in teammates' real handles: personal data, `.env.local` only, never committed, logged or written to audit `data`. Without them the seed uses synthetic fake-provider handles, which work only with `MESSAGING_PROVIDER=fake`.
- **Evidence labels:** "passes on PGlite" is not "passes on Postgres". Record which driver each run used. Mark T-CO-17 and the Postgres half of T-CO-23 **UNVERIFIED** until actually run against Postgres. T-CO-17 is required (D-033): get `TEST_DATABASE_URL` (a disposable project or schema, reached through the transaction pooler) early, by CP2.
- **Truthful mode pass-through:** persist and return `provider_mode`, `ai_suggestion.mode` and audit `mode` exactly as received. Never default a missing mode to `real`. `getSystemStatus().store` must reflect the actual driver.
- **Before other lanes merge:** they use local test doubles of your §9.3 functions. Before you merge, keep your own test doubles inside `tests/core/` only.

## 11. Cross-lane integration points

| With | You provide | You consume | When / via |
|---|---|---|---|
| Dev 1 (intake) | 2(a): `storeDonationImage`, `createDraft`, `attachAiResult`, `submitVerification` → `{ card, resubmit_token }`; 2(d): `getVerificationLinkView`, `getVerificationLinkImage`, the link path of `submitVerification` | `VerifiedFacts` parsed by `parseVerifiedFacts`; `edited_from_ai` computed by Dev 1 (CONTRACTS §3.2 rules) | Dev 1 wires as soon as 2(a) merges (by CP1.5). Dev 1 never writes donation rows and never triggers dispatch (D-021). |
| Dev 3 (messaging, tick) | 2(b): `createNextOffers`, `openOfferForSend` (+ `message_view`), `markOfferSendFailed`, `recordOfferProviderMessage`, `recordStatusEvent` + `recordDeliveryStatus`, `claimOffer`, `declineOffer`, `expireDue`, `listPendingSendOffers`, `listDispatchableDonations`, `resolveIdentityByHandle`, `getIdentity`, `joinIdentity`, `optOutIdentity`, `findOpenOffersForCourier`, `recordInboundMessage` / `saveInboundResult` / `recordOutboundMessage` / `listMessages`, `recordIgnoredInbound`, `setLastTick`; 2(d): `issueVerificationLink` | `ClaimCommand` / `DeclineCommand` built from `InboundMessage`; `tick()` calls in CONTRACTS §7 order; one `recordOutboundMessage` per send attempt | Dev 3 wires as soon as 2(b) merges (by CP1.5). Dev 3 reviews your PRs; you review Dev 3's inbound idempotency, JOIN/STOP handling and tick. |
| Dev 4 (UI, captain) | 2(a): `getDonationCard`; 2(c): `getDashboardSnapshot`, `getSystemStatus`, `operatorAction`, `recordHandoff`, `resetDemo`, handler modules in `src/core/http/*`, `createDispatchStore` for the container | `getServices`, `getEnv`, `getActor`, `DEMO_ACTORS`, thin route files, typed fixtures; health adds your `getSystemStatus()` via a captain follow-up PR | Dev 4 wires as soon as 2(c) merges (by CP2). Shared Supabase project created by the captain at kickoff. |
| Captain | Contract-change requests in `docs/requests/dispatch-<topic>.md`; handoffs | `BASELINE_SHA`, contract merges ("rebase") | Between 4:00 and 6:30 PM Sat, Dev 3 is the contract-change reviewer (D-027). |

Merge order (OWNERSHIP §7, D-027): baseline (tag) → slice 1 (your PR 1a + early PR 1b) → your sub-PRs 2(a), 2(b), 2(c), each unblocking its consumer, who may merge in any order → shared demo DB + `STORE=postgres` (CP3) → real providers → hardening.

Checkpoints: CP0a Sat 1:15 PM captain push + smoke · CP0b 1:30 PM baseline green on your machine · CP1 4:00 PM slice 1 · CP1.5 5:15 PM 2(a)+(b) merged · CP2 6:30 PM fake end to end · CP3 9:00 PM real providers + `STORE=postgres` · CP4 Devpost draft (target 9:30 PM, latest 10:15 PM) · CP5 Sun 7:30 AM freeze · CP6 Sun 9:30 AM final.

## 12. Acceptance checklist

- [ ] **AC-04** Gate G-01..G-13; policy-eligible demo facts (`scene1_eligible_facts`) → `eligible`; unknown never `eligible` — T-CO-01, T-CO-02, T-CO-03, T-CO-04, T-CO-05, T-CO-06, T-CO-07, T-CO-08, T-CO-09, T-CO-10, T-CO-11
- [ ] **AC-05** Matching + feasibility M-01..M-10, deterministic ranking; no match → `unmatched` — T-CO-12, T-CO-13, T-CO-14
- [ ] **AC-06** First valid claim wins; idempotent replay; claim-time re-check; unknown refs — T-CO-16, **T-CO-17 (required, real Postgres)**, T-CO-18, T-CO-25, T-CO-26
- [ ] **AC-07** Late/stale claims lose; lazy expiry + `expireDue`; post-claim time guards, no-show S-16 — T-CO-19, T-CO-20, T-CO-21, T-CO-24, T-CO-27, T-CO-28
- [ ] **AC-08** State machine S-01..S-18; migrations on PGlite (+ Postgres if `TEST_DATABASE_URL`); every transition audited — T-CO-15, T-CO-23
- [ ] **AC-09** Authorization + minimal disclosure in core, read models and audit `data` — T-CO-22, T-CO-29
- [ ] **AC-17** Verification-link security, `source_ref` idempotency, ignored-sender logging — T-CO-30, T-CO-31
- [ ] Required edge tests you own (MVP_SCOPE §4): unknown allergen (T-CO-09), missing holding history (T-CO-04), non-approved donor (T-CO-02), ineligible recipient (T-CO-12), simultaneous claims (T-CO-16, T-CO-17), late claim (T-CO-19), cutoff reached (T-CO-08, T-CO-21, T-CO-28), authorization (T-CO-22, T-CO-26)
- [ ] Seed matches ARCHITECTURE §7 personas with `DEMO_ACTORS` IDs; all `is_synthetic: true`; no real organization names; no handle committed
- [ ] Canonical secret scan (`docs/ARCHITECTURE.md` §9) clean before every push
- [ ] Handoff written in `docs/handoffs/dev-2.md` for each merged PR
- [ ] Reviewer (Dev 3) approved gate rules, claim transaction, expiry and authorization explicitly
- [ ] UNVERIFIED items listed (e.g. Postgres half of T-CO-23, shared-DB migration). If T-CO-17 is among them, say plainly that first-claim-wins is not verified.

## 13. Stop and escalate when

- The baseline SHA is missing, contracts don't compile, or a contract is ambiguous or contradictory → file a request. Don't improvise a new shape.
- A safety-policy question comes up (what counts as eligible, a threshold, a new food category, an override) → stop. Policy changes go through the captain and `docs/DECISIONS.md`.
- A step would cost money, need a credit card, contact anyone who is not an opted-in teammate, or use real personal data.
- You need to touch another lane's files, add a dependency, or change a route or contract.
- `/status` shows your Pro usage is nearly exhausted → write your handoff now, so another human can continue your lane.
- You've been stuck for more than 20 minutes on the same error → post the exact error and what you tried in the team chat.
- Anyone asks for an operator override, "dispatch anyway", or a way to turn an unknown or rejected fact into `eligible` → refuse and escalate.
- A WAC-derived rule seems ambiguous → follow CONTRACTS §5/§6 and DECISIONS (prototype policy). Never invent a threshold, shelf life or discard time.
- A migration would drop or rewrite data on the shared demo DB → get the captain's explicit OK first.
- Someone asks core or a handler to call Dev 3's workflows directly, or `drizzle.config.ts` needs a change → file `docs/requests/dispatch-<topic>.md` (D-021).

## 14. Never

- Never edit files outside your owned paths (§3), not even "just to make it compile". Write a local test double inside your own test folder and file `docs/requests/<lane-slug>-<topic>.md` (slugs: intake, dispatch, messaging, dashboard).
- Never define a second copy of a contract type. Import from `@/contracts`.
- Never add dependencies or edit `package.json`, the lockfile or root config. Request changes from the captain.
- Never present a mocked or fake result as real. A simulated-phone message is not a Photon integration, a fake vision draft is not a Gemini call, and an unrun test is not passing. Label it **UNVERIFIED**.
- Never let AI output set a verified fact, mark food safe or allergen-free, compute a shelf life or discard time, or bypass the deterministic gate. Unknown stays unknown.
- Never message, call or email real people or organizations other than opted-in teammates. Never use real donor, recipient or courier data. Synthetic only.
- Never commit secrets or `.env*` files, never print keys in logs, never set `ANTHROPIC_API_KEY`. The repo is public. Run the canonical secret scan in `docs/ARCHITECTURE.md` §9 before every push.
- Never force-push, rewrite `main`, or merge your own PR without the reviewer from `docs/OWNERSHIP.md` §6.
- Never enable billing, buy credits or upgrade a plan without explicit human approval.

## 15. Handoff block

End every substantive session, and every PR description, with:

    LANE / BRANCH / COMMIT:
    DELIVERED:
    EVIDENCE (commands, passed/failed, real vs mock):
    CONTRACT CHANGES OR REQUESTS:
    BLOCKERS + SAFETY RISKS:
    INTEGRATION STEPS:
    NEXT SMALLEST ACTION:
