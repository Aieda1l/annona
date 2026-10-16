# Dev 4 — UI + deployment + integration captain · Annona (DubHacks 2026) bootstrap prompt

> **Prompt version:** v1.3 (generated 2026-10-15 by the master bootstrap; revised 2026-10-16 for D-029 and D-031..D-034; revise only via the captain). The contracts version lives only in the `docs/CONTRACTS.md` header (D-034).
> **How to use:** Paste everything below the horizontal rule into **Dev 4's own Claude Code session** (your own Claude Pro account), started in **your own clone or git worktree** of the Annona repo, **after** the captain has pushed the shared baseline. The baseline is the git tag `baseline`. `BASELINE_SHA` below means the commit that tag points to, which the captain posts in team chat. You do not need to edit this prompt.

---

## 0. Preconditions — check these first (stop if any fails)

1. It is **at or after Saturday Oct 17, 2026, 12:30 PM PDT**. DubHacks Rule 10 forbids coding or building before then (`docs/RESEARCH.md` R-DH-3). If it is earlier, stop: you may only read the docs.
2. The captain has pushed the shared baseline: `git fetch --tags origin && git rev-parse 'baseline^{commit}'` prints a 40-character SHA equal to the `BASELINE_SHA` the captain posted. If the tag is missing or the SHAs differ, **stop and ask the captain**. Never scaffold your own project or invent missing contracts.
3. You are in **your own clone or git worktree** (never a working tree another Claude session uses), on branch `feat/dashboard` created from the tag:
   `git switch -c feat/dashboard baseline` (or `git switch feat/dashboard` if it already exists). Confirm with `git status`, `git log -1 --oneline` and `git merge-base --is-ancestor baseline HEAD && echo baseline-ok`.
4. Session hygiene: run `/status` (remaining Pro usage), then `/model sonnet` and `/effort medium`. Switch to `opus`/`high` only for a hard concurrency or debugging problem, and only if your quota allows. Confirm `ANTHROPIC_API_KEY` is **not** set (it would bill the API instead of your subscription). You are one of four humans, each in their own session: do not spawn agent swarms or parallel background sessions on this repo.
5. Copy `.env.example` to `.env.local` (gitignored). Leave provider keys empty unless you own them. Fakes are the default and the app must run without any keys.
6. Read the contracts version from the `docs/CONTRACTS.md` header (the only place it is stated, D-034) and confirm it equals the version the captain posted with `BASELINE_SHA`. If they differ, stop and ask the captain which version to build against.
7. **Captain exception (Slice 0 only).** You are the human who *creates* the baseline, so items 2, 3 and 5 apply **after** Slice 0 is tagged and pushed. Before Slice 0: run `git status` and `git branch --show-current` (expected: branch `master`, zero commits, no remote; `docs/RESEARCH.md` R-TOOL-10) and confirm `docs/plans/active/kickoff-baseline.md` exists. If it does not, stop and tell the team; do not improvise a scaffold. Item 6 applies before Slice 0 too: you generate `src/contracts/**` from the version in the `docs/CONTRACTS.md` header, and you post that version with `BASELINE_SHA`.
8. **Organizer answers** (`docs/PROJECT_STATE.md` §6, Q-1): whether pre-event planning docs may be committed (D-002) and whether sponsor accounts may be created early. If organizers have not answered by 12:30 PM, apply the defaults in `docs/plans/active/kickoff-baseline.md` §0 and proceed. Never block the baseline on an organizer reply. If they forbid the docs in the repo, use the plan's step 2-ALT. The VEYZL GitHub App waits for an **explicit** organizer OK (D-022).

## 1. Role and context

- You are **Dev 4**, one of four humans, each with their own Claude Code session. You build the **UI** (pages, dashboard, design-system primitives), own **deployment**, and act as **integration captain**. Captain is an extra duty, not a fifth resource, and it grants no right to edit other lanes' code.
- **Product (3 sentences).** An approved synthetic donor kitchen texts a surplus-food photo (web upload is the fallback); AI replies with an uncertain, editable description and a one-time checklist link; the donor verifies every fact on that checklist, including all nine allergens and handling (D-031). A deterministic gate returns `eligible`, `needs_review` or `rejected` with plain-language reasons. Eligible donations are offered to one cold-capable courier at a time by iMessage (Photon 2.0) or a labeled simulated phone; the first valid `YES <code>` (e.g. `YES K7M3`) wins, and your dashboard shows server truth.
- **Safety framing.** AI describes, humans verify, backend enforces. `eligible` means *eligible for dispatch under the prototype operator policy, based on donor-attested records* (`docs/CONTRACTS.md` header). It never means safe, allergen-free, compliant or certified. Your UI renders server decisions; it never computes them.
- **Done at CP0a (Sat 1:15 PM):** the **minimal** baseline (D-034) is tagged and posted. Anything not needed for four lanes to start (UI kit, remaining fixtures, function/route types, the rest of `env.ts`) goes into follow-up captain PRs by 2:30 PM.
- **Done at CP2 (Sat 6:30 PM):** demo scenes 1–3 run end to end on integrated `main` with fake providers, scene 1 at least via the web fallback, visible on `/operator`, with every label present (T-E2E-06, T-E2E-02, T-E2E-03).
- **Done at CP3 (Sat 9:00 PM):** scene 1 by message passes in fake mode (T-E2E-01) and the `/v` page is live (T-UI-07); deployed (or ladder-step-2 local) URL passes T-E2E-05; real Gemini and real Photon attempts are recorded as VERIFIED or UNVERIFIED in `docs/PROJECT_STATE.md`; the Devpost draft is ready to submit at CP4 (target Sat 9:30 PM, latest 10:15 PM, hard 10:30 PM; D-003, R-DH-4).

## 2. Read first: `docs/KICKOFF.md`, then reference as needed

Read **`docs/KICKOFF.md`** first (about 10 minutes; D-034). The list below is **reference, in priority order**: open each item when the slice in front of you needs it, not all up front.

1. `CLAUDE.md` (operating contract; safety boundaries; release gate).
2. `docs/PROJECT_STATE.md` (baseline record, blockers, organizer answers).
3. `docs/MVP_SCOPE.md` §2 (AC-14..AC-16), §3 release gate, §4 edge tests, §5 demo scenes, §6 non-goals.
4. `docs/CONTRACTS.md` (current version in its header) — §1 conventions (short codes), §2 enums (incl. `unmatched`, severity `dispatch`) + §2.1 reason codes, §3.6 FieldState, §3.7 EligibilityDecision, §3.9 ClaimResult, §3.13 read models + donor projection, §3.15 Result/HTTP mapping, §3.16 `VerificationLinkView`, §4 state machine (S-11..S-18), §8.4 verification links, **§9.0 composition root**, §9.2–§9.4, §10 routes, §11 disclosure, §12 modes/secrets (misconfigured rule), **§13 integration contract for Dev 4**, §15 change log.
5. `docs/OWNERSHIP.md` (all of it: you enforce it; §7 merge order now has sub-PR 2(d), §8 checkpoints moved to CP0a 1:15 / CP0b 1:30).
6. `docs/ARCHITECTURE.md` — §3 stack + planned scripts, §6 tick/stale warning, §8 modes, **§9 security + the canonical secret scan**, §10 UI screens, §11 layout, §13 failure modes + rollback.
7. `docs/TEST_PLAN.md` §5.0 (must-run tier) and the Dev 4 section (T-UI-01..T-UI-07, T-E2E-01..T-E2E-06; captain: T-CT-01, T-CT-02).
8. `docs/DECISIONS.md` D-001, D-003, D-006, D-010, D-013, D-017, D-021..D-034 (D-018 is superseded by D-022).
9. `docs/plans/active/kickoff-baseline.md` (Slice 0 script) and `docs/ROADMAP.md` (time plan, judging, scope-cut order).

Do **not** re-read all of `PROJECT_IDEA.md`; the approved docs above supersede it.

## 3. Ownership — what you may and may not edit

**Owned (as developer, `feat/dashboard`):** `src/app/**` (pages, layouts, thin route files), `src/components/**` (incl. `ui/` design system), `src/styles/**`, `public/**`, `tests/ui/**`, deployment files (`Dockerfile`, `railway.json` / `vercel.json`, `Procfile`), `docs/demo/**`, `docs/submission/**`.

**Captain-controlled shared surfaces (only via the OWNERSHIP §4 process, on `chore/integration-*`, reviewed by Dev 2; by Dev 3 between 4:00 and 6:30 PM Sat, D-027):** `src/contracts/**` + `tests/contracts/**`; `drizzle.config.ts`; `src/server/**` (`getServices()` container, `getEnv()`, `getActor(request)` session helper, health); root config (`package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `next.config.*`, `eslint.config.*`, `vitest.config.*`, `postcss.config.*`, `components.json`, `.env.example`, `.gitignore`); `.claude/**`, `CLAUDE.md`, `README.md`, `prompts/**`; shared docs (`docs/ARCHITECTURE.md`, `docs/CONTRACTS.md`, `docs/DECISIONS.md`, `docs/MVP_SCOPE.md`, `docs/OWNERSHIP.md`, `docs/PRODUCT_BRIEF.md`, `docs/RESEARCH.md`, `docs/TEST_PLAN.md`, `docs/ROADMAP.md`, `docs/BACKLOG.md`, `docs/PROJECT_STATE.md`).

**Lane barrels** (`src/lib/ai/index.ts`, `src/features/intake/index.ts`, `src/core/index.ts`, `src/db/index.ts`, `src/integrations/photon/index.ts`, `src/workflows/index.ts`): you **create** them at baseline as typed stubs; from then on each barrel belongs to its lane. Do not edit them after the baseline.

**Your own lane files:** `docs/handoffs/dev-4.md`, `docs/requests/dashboard-<topic>.md`, `docs/plans/active/dev-4-<topic>.md`.

**Forbidden (open a request instead):** `src/features/**`, `src/lib/**`, `src/core/**`, `src/db/**`, `src/integrations/**`, `src/workflows/**` (and `fixtures/intake/**`, Dev 1's).

- **Thin-route rule.** Every `src/app/api/**/route.ts` contains only a re-export, e.g. `export { POST } from "@/core/http/operator"`. You own the file; the lane in CONTRACTS §10 owns the handler module. Adding or renaming a route is a contract change.
- **Composition-root rule.** `src/server/container` calls exactly one factory per lane **through its barrel**, passing a config object built from `getEnv()`: `createVisionProvider` from `@/lib/ai`, `createDispatchStore` from `@/db`, `createMessagingGateway` from `@/integrations/photon`. Each lane owns its `real` / `fake` / `misconfigured` switch; the container does not change when a lane adds a real adapter.
- **Import rule (UI).** Pages and `src/components/**` never import `@/core`, `@/db`, `@/integrations/photon`, `@/workflows` or `@/lib/ai`. They talk to the server only over the CONTRACTS §10 routes. Mount Dev 1's intake components from `src/features/intake/components` (CONTRACTS §13 item 6).
- **Merge conflicts in another lane's files** go back to that lane's owner with the exact conflicting paths. Never resolve them yourself.

## 4. Contracts you consume and provide

**Types you render (import from `@/contracts`; never redefine):** `DonationCard`, `DashboardSnapshot`, `SystemModes`, `IdentitySummary`, `OfferSummary`, `EligibilityDecision` (+ `reasons`, `field_states`), `FieldState`, `ReasonCode`, `Allergen`, `DonorAllergenStatus`, `ClaimResult` / `ClaimResultCode`, `InboundResult`, `TickReport`, `AuditEvent`, `OperatorAction`, `HandoffStep`, `Result<T>`, `ErrorCode`, `Actor`. `VerificationLinkView` (the `/v` page only; Dev 1's component renders it). Typed fixtures: `src/contracts/fixtures` (at baseline: 3 cards, the three demo scenes, `DEMO_ACTORS`; after `chore/integration-contracts-2`: one card per `DonationStatus`, 11 incl. `unmatched`).

**Composition root you provide (CONTRACTS §9.0, verbatim; captain, working at baseline):**

| Export | Module | Contract |
|---|---|---|
| `getServices()` | `@/server/container` | `→ { vision: VisionProvider, messaging: MessagingGateway, store: DispatchStore, clock: Clock }`. A memoized process singleton (stored on `globalThis` so Next dev reuses it). |
| `getEnv()` | `@/server/env` | Zod-parsed env (§12). Lanes never read `process.env` directly. |
| `getActor(request)` | `@/server/session` | `→ Promise<Actor \| null>`. Verifies the signed session cookie. **Ships working in the baseline.** |
| `DEMO_ACTORS` | `@/contracts/fixtures/demo-actors` | Fixed UUIDs, roles and display names for every demo persona. No handles. Used by the session picker and Dev 2's seed. |

`Actor = { role: ActorRole, id: string | null }`. `Clock = { now(): Date }`.

**Factories the container calls (verbatim):** `createVisionProvider({ mode, api_key, model })` (Dev 1), `createDispatchStore({ kind, database_url, pglite_dir })` (Dev 2), `createMessagingGateway({ mode, project_id, api_key })` (Dev 3). Core and workflow functions take an optional last argument `deps?: { store?, clock?, messaging?, vision? }`; when omitted they use `getServices()`.

**Routes you provide (captain handlers in `src/server/**`, working at baseline):** `GET /api/health` → `SystemModes`; `GET /api/session/actors` (public, demo mode only) → `{ actors: { role, actor_id, display_name }[] }` from `DEMO_ACTORS`; `POST /api/session`, `DELETE /api/session` with `{ actor_id, passcode }` (`actor_id` must be in `DEMO_ACTORS`) → `{ actor }` (signed httpOnly cookie `{ role, actor_id }`, `DEMO_PASSCODE`; D-013, D-024). Health combines the container's provider modes (each `status: ok | misconfigured`) with Dev 2's `getSystemStatus() → Promise<{ last_tick_at: string | null, store: StoreKind, policy_version: string }>` once Dev 2's sub-PR 2(c) lands; add that in a captain follow-up PR. Until then health reports the container modes with `last_tick_at: null` and fabricates nothing.

**Functions you reach only through routes (CONTRACTS §9.2–§9.4 → §10, verbatim):**

| Function | Route your pages call |
|---|---|
| `createDraftFromImage({ actor, image: { mime, bytes_base64 }, source }) → Promise<Result<DonationCard>>` | `POST /api/intake/drafts` (`{ image }` or `{ fixture_id }`) |
| `submitDonorVerification({ actor, donation_id, raw }) → Promise<Result<DonationCard>>` | `POST /api/donations/:id/verification` |
| `getDonationCard(actor, id)` (role-projected, §3.13) | `GET /api/donations/:id` |
| `getDashboardSnapshot(actor)` | `GET /api/dashboard` (poll every 2 s, D-006) |
| `operatorAction({ actor, donation_id, action, note })` | `POST /api/donations/:id/operator-actions` |
| `recordHandoff({ actor, donation_id, step, simulated: true })` | `POST /api/donations/:id/handoff` |
| `resetDemo({ keep_identities: true })` | `POST /api/demo/reset` |
| `dispatchDonation(donation_id) → Promise<TickReport>` | `POST /api/donations/:id/dispatch` ("Dispatch now") |
| `tick() → Promise<TickReport>` | `POST /api/internal/tick` ("Run tick now", operator session) |
| `handleInbound(msg: InboundMessage) → Promise<InboundResult>` | `POST /api/messaging/simulated/inbound` with `{ identity_id, text, fixture_id? }` (`fixture_id` = simulated donor photo) |
| `getLinkVerification` / `submitDonorVerificationByLink` (Dev 1) | `POST /api/verify/view`, `/image`, `/submit` (called by Dev 1's `LinkVerification` on your `/v` page; you only mount it) |
| `listMessages({ identity_id? })` | `GET /api/messaging/simulated/thread?identity_id=` |

`TickReport = { at, expired_offers, expired_donations, offers_created, offers_sent, send_failures }`. Both simulated routes return **403 unless demo mode and `MESSAGING_PROVIDER=fake`**. There is **no post-verification dispatch hook** (D-021): the next tick (≤ `TICK_INTERVAL_MS`) dispatches a newly `eligible` donation; "Dispatch now" calls `dispatchDonation`.

**Read models you render (CONTRACTS §3.13):** `SystemModes` (per-provider `status: ok | misconfigured`); `DonationCard` (incl. `donor_area_label`); `OfferSummary` (incl. `short_code`, `recipient_display_name`, `provider_mode`, `delivery_status`); `IdentitySummary` `{ identity_id, actor_role, actor_id, actor_display_name, provider, status, joined_at, handle_masked }`. The **donor projection** reduces offers to `{ status, sent_at, expires_at }`, omits `courier_display_name` and `provider_message_id` until `claimed`, and filters the timeline. Render exactly what the server returns; never request or reconstruct the operator view on a donor page.

**Rules that bind your UI:** CONTRACTS §13 items 1–7; §11 disclosure (handles masked; no addresses before claim); S-11..S-14 operator actions (`reject` needs a `note`; `cancel` needs a `note` for `claimed`/`collected` and for a post-pickup `needs_review`; `retry_matching` appears **only on `unmatched` cards**, S-14); **`unmatched` gets its own neutral "Unmatched — needs couriers" group**, never safety styling; `dispatch`-severity reasons render neutrally; S-15 (back to `eligible` with `COURIER_OPTED_OUT`, re-offered), S-16 (`expired` with `PICKUP_NOT_COLLECTED`) and S-17 (`needs_review` with `COURIER_OPTED_OUT_AFTER_PICKUP`, only cancel/reject) appear as ordinary server states; S-09/S-10 time guards are server-side, so a refused handoff shows the returned `INVALID_TRANSITION`; §3.15 (claim/decline outcomes are 200 results, not errors). Gate rules G-01..G-13 and matching M-01..M-10 are Dev 2's: display their reason `message` text verbatim and never re-implement them.

## 5. Slice 1 — first 30–60 minutes

**First-hour target (after CP0b):** `ModeBanner` + T-UI-04 and `StatusBadge` + T-UI-01 green on fixtures. The rest of slice 1 is the CP1 (4:00 PM) target. **Captain note on §14:** the "never edit `package.json`/root config" item applies to your `feat/dashboard` work. As captain you change root config only in Slice 0 and on `chore/integration-*` branches via OWNERSHIP §4/§5, with a reviewer.

**Slice 0 (captain kickoff, 12:30 PM → CP0a 1:15 PM, before any UI work).** Execute `docs/plans/active/kickoff-baseline.md` exactly. If it disagrees with the current CONTRACTS or D-021..D-034, the contract and decisions win: note the gap in `docs/PROJECT_STATE.md` afterwards. It must produce:

1. `git branch -m master main`; commit 1 = the planning docs as they are (README labels them pre-event ideation, D-002), or step 2-ALT if organizers forbid that.
2. Next.js scaffolded in a temp dir and moved in without overwriting `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/`, `prompts/` or `.claude/settings.json` (verify with `git diff --exit-code` on those paths). Every planned dependency in ARCHITECTURE §3 installed at **exact** versions, incl. `socket.io-client`; `@photon-ai/api` is **not** installed.
3. `src/contracts/**` generated from the current CONTRACTS (minimal set, D-034): enums, entities, `VisionModelOutput`, `Result`, ports, `DEMO_ACTORS`, scenes incl. `scene1_eligible_facts` (no fixture or scene name contains "safe") and **3** card fixtures; `tests/contracts/` with **T-CT-01** and **T-CT-02** written first. **12:58 check:** if `entities.ts` is not done, ship only the cross-lane entities (kickoff-baseline Step 5). `functions.ts`, `routes.ts`, the other 8 card fixtures and the `VerificationLinkView`/`DraftReadyView` fixtures go to `chore/integration-contracts-2` by 2:30 PM.
4. `src/server/**`: lazy `getEnv()`, `getServices()` container (three factories via barrels), **working** `getActor(request)` + `/api/session` + `/api/session/actors` + `/api/health`. Barrels with typed stubs returning `NOT_IMPLEMENTED`; stub lane handler modules (501); every thin route file from CONTRACTS §10, including `/api/verify/{view,image,submit}`. `env.ts` parses only the names the container, session and health need; the rest arrives in contracts-2.
5. Package scripts; `vitest.config.*` with jsdom for `tests/ui/**` and `tests/intake/**/*.tsx`; `drizzle.config.ts`; `.env.example` with every name from CONTRACTS §12 (incl. `TICK_INTERVAL_MS`, `TEST_DATABASE_URL`, `DEMO_DONOR_HANDLE`, `DEMO_COURIER_A_HANDLE`, `DEMO_COURIER_B_HANDLE` left empty); shadcn is **not** in the baseline (Step 9 runs after CP0a in a `chore/integration-ui-kit` PR); `.gitignore` (`.env*` except `.env.example`, `.data/`, `.claude/worktrees/`).
6. Smoke: `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, then the canonical secret scan (§8). Record every exit code.
7. Commit 2 (baseline skeleton). Create the **public** GitHub repo (D-023), push `main`, create the annotated tag `baseline`, push it, and post `BASELINE_SHA` = `git rev-parse 'baseline^{commit}'` plus the repo URL in chat (**CP0a 1:15 PM**). Prompts are never edited. Lanes run `git fetch --tags origin && git switch -c feat/<lane> baseline`. Record the SHA in `docs/PROJECT_STATE.md` later, through a reviewed `chore/integration-*` PR (lanes do not need it).
8. **CP0b 1:30 PM:** all four machines on their branches with `pnpm install && pnpm typecheck && pnpm test && pnpm build` passing. Then create your own `feat/dashboard` from `baseline` (§0 items 2–3).
9. Right after CP0 (never blocking it): run shadcn (`init --yes --defaults` after checking `--help`) + base components in `src/components/ui` as `chore/integration-ui-kit` (reviewer: Dev 1); create the shared Supabase project and send `DATABASE_URL` to Dev 2 privately; collect the donor and courier handles by DM (Dev 2 + captain only; Dev 3 creates matching Photon assignments); link Vercel (`pnpm dlx vercel@<pinned>`; interactive `vercel link`/`login` and `gh auth` are run by the human in their own terminal); create the Devpost shell by ~2:00 PM (§6 captain duties).

**Slice 1 — operator dashboard on typed fixtures (`feat/dashboard`, no network).** Tests first (Vitest + Testing Library, jsdom):

| Test (write first) | File (suggested) | Asserts |
|---|---|---|
| T-UI-01 | `tests/ui/donation-card.test.tsx` | A card renders for every `DonationStatus` fixture (the 3 baseline cards first; all 11 after contracts-2), with reasons and `FieldState` badges from `decision.field_states`; `unmatched` sits in its own neutral group |
| T-UI-02 | `tests/ui/no-safety-wording.test.tsx` | Rendered text for every fixture contains no "safe", "allergen-free", "certified", "compliant" (case-insensitive, word-boundary regex) |
| T-UI-03 | `tests/ui/operator-actions.test.tsx` | `needs_review`/`rejected` cards show no dispatch control and no `retry_matching`; `needs_review` actions limited to `reject` / `return_to_donor` / `cancel` (only cancel/reject with a note for `COURIER_OPTED_OUT_AFTER_PICKUP`); `unmatched` cards show only `retry_matching` and `cancel`, styled neutrally |
| T-UI-04 | `tests/ui/mode-banner.test.tsx` | Banner names each fake provider and any `misconfigured` real provider; "Synthetic data", "DEMO: accelerated timers", "Simulated" present; stale `last_tick_at` warning; `IdentityList` shows each JOIN status with handles masked to the last 4 characters |
| T-UI-05 | `tests/ui/claim-result.test.tsx` | Each `ClaimResultCode` renders a distinct message; `offer_expired` / `already_claimed` never use success styling |

Then build (file names suggested):

1. `src/components/layout/ModeBanner.tsx` from `SystemModes`: "AI: FAKE", "Messaging: SIMULATED", store kind, "DEMO: accelerated timers" when `demo_accelerated`; a provider with `status: misconfigured` shows "AI: MISCONFIGURED — real provider selected, key missing" (same for messaging) in warning style. "Scheduler stalled" when `generated_at − last_tick_at > 30 s` (both server times; ARCHITECTURE §6). Persistent, not dismissible.
2. `src/components/layout/SyntheticBadge.tsx`; `src/app/layout.tsx` mounts banner + badge on every page.
3. `src/components/dashboard/`: `DonationCard.tsx`, `StatusBadge.tsx`, `FieldStateBadge.tsx` (five states, neutral palette, never green-for-safe), `AllergenGrid.tsx` (all nine allergens, donor status vs AI "possible" side by side; AI-unlisted allergens show nothing, not "absent"), `ReasonList.tsx` (renders `reason.message` verbatim), `OfferList.tsx` + `Countdown.tsx` (display-only, from `expires_at` / `effective_cutoff_at`), `AuditTimeline.tsx`, `IdentityList.tsx` (`actor_display_name`, `status`, `joined_at`, `handle_masked`), `OperatorActions.tsx`.
4. `src/app/operator/page.tsx` renders `DashboardSnapshot` fixtures grouped by status with `counts_by_status`. `src/app/page.tsx`: pitch header, "Synthetic demo" notice, profile picker from `GET /api/session/actors` (passcode form).

Design rules (design is 20% of the score, R-DH-8):

- Status colors encode workflow state only (e.g. `claimed`, `expired`). No green check on any food attribute or allergen.
- Every badge has a text label (not color alone); WCAG AA contrast; keyboard-reachable actions; visible focus.
- Mobile-first: cards stack at 375 px; no horizontal scroll on the donor form or dashboard.
- Times render in `America/Los_Angeles` with the zone shown; the source instant stays the server UTC value.

**Done when:** T-UI-01..T-UI-05 pass locally (`pnpm test tests/ui`), `pnpm typecheck` and `pnpm lint` pass, PR `[Dev 4] dashboard on fixtures` is open with Dev 1 as reviewer (target CP1 Sat 4:00 PM).

## 6. Slice 2 — next increment

Wire to real endpoints as soon as Dev 2's read-model sub-PR **2(c)** merges (D-027; OWNERSHIP §7). `GET /api/donations/:id` (`getDonationCard`) is usable earlier, from 2(a). Until then stay on fixtures. One small PR each:

1. **Health follow-up (captain PR on `chore/integration-*`).** Health adds `getSystemStatus()` from `@/core`; T-CT-01 still passes.
2. **Polling.** `src/app/operator/page.tsx` polls `GET /api/dashboard` every 2 s and `GET /api/health` for the banner; polling pauses while the tab is hidden (Vercel budget, ARCHITECTURE §13). On `ok:false` (e.g. 501 `NOT_IMPLEMENTED`, 502 `PROVIDER_UNAVAILABLE`, 403), show an error panel with the `ErrorCode`, keep the last snapshot labeled "stale since <time>", and never fabricate data.
3. **Donor pages.** `src/app/v/page.tsx` (**primary checklist, D-031**) mounts only Dev 1's `LinkVerification`, needs no session, sets `Referrer-Policy: no-referrer` and `Cache-Control: no-store`, and loads no analytics or third-party scripts (T-UI-07). `src/app/donor/new/page.tsx` (**web fallback**, build it first) mounts Dev 1's intake components (upload → draft review → verification form). `src/app/donor/donations/[id]/page.tsx` shows status, reasons and what is missing via `GET /api/donations/:id`, rendering only the donor projection. After verification, an `eligible` card waits for the next tick; do not call dispatch from donor pages.
4. **Operator detail.** `src/app/operator/donations/[id]/page.tsx`: full timeline, image via `GET /api/images/:id`, operator actions (`note` required for `reject`, and for `cancel` on `claimed`/`collected`), Simulated "Collected" / "Delivered (recipient accepted after inspection)" buttons → handoff route; a refused step shows the server's `INVALID_TRANSITION` message.
5. **Demo controls** on `/operator` (only when the server reports demo mode): Reset demo, Run tick now, Dispatch now. Show the returned `TickReport` counts.
6. **Simulated phone** `src/app/operator/phone/page.tsx`, linked only when `SystemModes.messaging.provider` is `fake`: header "SIMULATED PHONE — not iMessage"; one thread per fake identity (couriers **and the donor**), keyed by `IdentitySummary.identity_id` from the dashboard snapshot; send JOIN / YES <code> / NO <code> / STOP / HELP as `{ identity_id, text }`, or a fixture photo as `{ identity_id, text: "", fixture_id }`, to `POST /api/messaging/simulated/inbound`; the donor thread's `draft_ready` link opens `/v`; render `InboundResult.claim_result` with T-UI-05 messages. A 403 renders "Simulated phone disabled: real messaging is active".
7. **Deploy + demo docs.** Deploy (Vercel; `STORE=postgres`; env vars set in the Vercel dashboard only; include `fixtures/intake/images/**` in the deployment's file tracing via `next.config.*`, verifying the option name for the pinned Next version). `APP_BASE_URL` must be a URL the donor phone can open (verification links). Write `docs/demo/DEMO_SCRIPT.md` (setup JOINs for the donor phone and both courier phones + scenes 1–3, scene 1 by message with the web-upload fallback, exact clicks, expected server states, fallback steps), commit Dev 1's video script text from `docs/handoffs/dev-1.md` to `docs/demo/`, and write `docs/submission/DEVPOST.md`.
8. **Tests:** T-UI-06 (375 px screenshots of donor form, `/v` and dashboard), T-UI-07 (`/v` headers), then T-E2E-06 (web fallback), T-E2E-02, T-E2E-03 by CP2, T-E2E-01 (scene 1 by message) by CP3 (fake providers on integrated `main`), T-E2E-05 (deployed URL), T-E2E-04 (real Gemini + real Photon, evidence per §10). Record each in `docs/handoffs/dev-4.md` as run/passed/failed/UNVERIFIED.

**Done when:** CP2 passes (T-E2E-06, T-E2E-02, T-E2E-03 on `main`), T-E2E-01 passes by CP3, T-E2E-05 passes against the demo URL, and `docs/demo/DEMO_SCRIPT.md` exists.

**Captain duties (run alongside Slices 1–2):**

- Contract-change requests (`docs/requests/<lane-slug>-<topic>.md`; slugs `intake`, `dispatch`, `messaging`, `dashboard`): answer within ~20 min; commit approved changes on `chore/integration-contract-vX`, bump the version in the CONTRACTS.md header (the only place it lives, D-034) and add a §15 row, get the OWNERSHIP §6 reviewer, post "contracts vX merged at <sha>; rebase".
- Merge order per OWNERSHIP §7 / D-027; squash-merge only reviewed PRs with pasted check output; update `docs/PROJECT_STATE.md` after each integration.
- Run checkpoints CP0a/CP0b, CP1, CP1.5, CP2..CP6 (OWNERSHIP §8) and record pass/fail.
- **Devpost:** the ~2:00 PM shell holds all four contributors + Discord handles + **Community Kitchen, SideShift and DubHacks NEXT only**. First test in the real form whether a declared track can be removed later (R-SP-9). Add Photon, Gemini or VEYZL at the CP4 draft only if tracks are removable or that track's evidence already exists.
- **VEYZL (D-022):** after an explicit organizer OK, install the GitHub App on the public repo; it checks every PR. The evidence PR is the first intake/AI PR opened **after CP2** (normally Dev 1's Gemini-adapter PR). A real finding is fixed by a follow-up commit on that same open PR, before merge, with before/after captured. Drop the track (not swap) if nothing actionable by Sun 3:00 AM.
- **Public repo:** public from kickoff. Run the canonical scan before every push and a full-history scan Sun 9:00 AM. A leaked key is rotated immediately; history rewriting does not un-leak it.
- **Judging:** plan for presence across all three judging rounds (side-track judges visit any time, R-DH-9): the whole team for the assigned round; outside it, at least Dev 3 (iPhones) and one presenter stay at the table. Before each judge: press demo reset, have the donor phone and each courier phone send a fresh JOIN (Photon's send-permission window after JOIN is unknown), check the banner and `last_tick_at`. Never call claims race-safe in the pitch unless T-CO-17 passed (D-033). Keep the backup video ready on a second device.
- Video: backup recording Sat ~11 PM; final recording from CP5 (Sun 7:30 AM). Devpost final by **Sun 9:30 AM** (hard **10:00 AM**, D-003). Whole team at HUB Ballroom by 10:20 AM.
- A sponsored track is dropped, not swapped, if its evidence is missing by Sun 8:00 AM (D-001).

## 7. Example behaviors (write these as tests)

1. **Responsible refusal (safety-critical, scene 3).** Given the scene-3 pasta-tray fixture card with `status: needs_review` and reasons `COOLING_HISTORY_REVIEW`, `COLD_HOLDING_UNKNOWN`, `TEMPERATURE_LOG_MISSING`, `ALLERGEN_UNKNOWN` (sesame), when `/operator` renders it, then all four reason messages appear verbatim, sesame shows `unknown`, the only actions are reject / return to donor / cancel, and no "dispatch", "dispatch anyway" or "approve" control exists (T-UI-03).
2. **AI never reads as verified (safety-critical).** Given a draft card whose `ai_suggestion.possible_allergens` lists wheat and milk only and whose donor statuses are all `unknown`, when the allergen grid renders, then wheat and milk show "AI: possible" next to donor status `unknown`, the other seven show `unknown` (never "none" or "absent"), and no text matches the T-UI-02 forbidden words.
3. **Late claim (failure, scene 2).** Given an `InboundResult` for courier A's late `YES K7M3` with `claim_result.code = "offer_expired"`, when the simulated phone renders it, then it shows "Expired — no assignment made" in a neutral/warning style, not a success toast, and no assignment or address appears (T-UI-05).
4. **Labeled and misconfigured modes.** Given `SystemModes` with `vision.mode = "fake"` and `messaging.mode = "real"`, `messaging.status = "misconfigured"`, when any page renders, then a persistent banner shows "AI: FAKE" and "Messaging: MISCONFIGURED", never "SIMULATED" or a healthy real label for messaging, and no fake data is substituted (T-UI-04).
5. **Stalled scheduler (failure).** Given a snapshot where `generated_at − last_tick_at = 45 s`, when the dashboard renders, then "Scheduler stalled" shows with a "Run tick now" control; offer countdowns keep displaying but do not enable or disable any action.
6. **Minimal disclosure.** Given a `claimed` card and two `IdentitySummary` rows (one `joined`, one `opted_out`), when the operator dashboard renders, then courier and recipient display names appear, `IdentityList` shows each status with `handle_masked` (last 4 characters only), and no full handle appears anywhere in the DOM. Given the donor projection of an `offered` card, the donor page shows offers only as status, sent and expiry times, with no courier name (T-UI-04).
7. **Courier opt-out (S-15, S-17).** Given an `eligible` card whose timeline shows `COURIER_OPTED_OUT` (`dispatch`), when `/operator` renders it, then it reads as "re-offering", neutrally, with no operator action required. Given a `needs_review` card with `COURIER_OPTED_OUT_AFTER_PICKUP`, then the reason shows verbatim, only cancel/reject (with a note) are offered, and no retry or handoff buttons appear.
8. **Unmatched (D-032).** Given an `unmatched` card with `NO_ELIGIBLE_MATCH`, when `/operator` renders, then it sits in "Unmatched — needs couriers", styled neutrally (not as a safety warning), with only `retry_matching` and `cancel`.

## 8. Commands (planned at kickoff — verify first)

Run `cat package.json` first and use only scripts that actually exist. Planned names (created at kickoff): `pnpm test` (Vitest, all), `pnpm test tests/ui` (your lane; use the exact lane-filter form the captain recorded in `docs/ARCHITECTURE.md` §3 at kickoff, and check the reported file count), `pnpm typecheck`, `pnpm lint`, `pnpm build`. If a planned script is missing or behaves differently, tell the captain. Do not add or rename scripts yourself. Never report a command as passing unless you ran it in this session and saw it pass.

Lane-specific (planned — verify):

| Command | Use |
|---|---|
| `pnpm dev` / `pnpm start` | Local UI; `pnpm start` after `pnpm build` for the D-017 ladder step 2 |
| `pnpm test tests/contracts` | T-CT-01, T-CT-02 (captain) |
| `pnpm worker` | Dev 3's tick loop + relay; you run it on the demo laptop with `APP_BASE_URL` = demo URL |
| `pnpm db:migrate` / `pnpm db:seed` | Dev 2 owns these; you run them on the shared demo DB only after Dev 2 confirms |
| `pnpm dlx vercel@<pinned> deploy --prod` | Vercel CLI (deploy via CLI if Git deploys of teammates' commits are blocked; R-INF-4). The human runs `vercel link` / `login` interactively |

**Secret scan.** Before every push, run the canonical scan block in `docs/ARCHITECTURE.md` §9, copied from there, never retyped or abbreviated:

```text
Source: docs/ARCHITECTURE.md §9 "Secrets and public repo (D-023)" — SECRET_RE + staged, unpushed and .env checks.
Pass condition: each grep prints nothing. Sun 9:00 AM: the same SECRET_RE over the full history (git log -p).
```

## 9. Workflow (identical for all four lanes)

**Understand → Plan → RED/GREEN → Review → Verify → Handoff.** Use **one** tool per phase. Do not run duplicate ECC and Superpowers ceremonies for the same phase. Pick ECC or Superpowers once for the whole event and stay consistent.

| Phase | Use exactly one of | Output |
|---|---|---|
| Understand | The §2 read-first list; only the code your slice touches | A 3-line restatement of the slice and the AC/test IDs it serves |
| Plan | Superpowers `writing-plans` **or** ECC `/ecc:plan` | `docs/plans/active/dev-4-<topic>.md`, ≤ 15 lines: files, tests, done criteria |
| RED/GREEN/REFACTOR | Superpowers `test-driven-development` **or** ECC `tdd-workflow` | A failing test first for every rule, parser, timer, claim or auth behavior; then minimal code; then tidy |
| Review | Optionally ECC `/code-review` (or `typescript-reviewer`) as a pre-check in your own session, **then** the human cross-lane reviewer named in `docs/OWNERSHIP.md` §6 | Comments resolved. No self-approval. |
| Verify | Superpowers `verification-before-completion` **or** ECC `verification-loop` | Real command output pasted into the PR. Anything not run is marked **UNVERIFIED**. |
| Handoff | A small PR to `main` plus an entry appended to `docs/handoffs/dev-4.md` | The §15 block |

Commit small, coherent slices on your own branch. When the captain announces a contract or shared-config merge, run `git fetch origin && git rebase origin/main` (or merge `main`) and re-run your tests. If a skill tries to start a long brainstorm or approval loop for a bounded slice, skip it: the design is already approved in `docs/`.

## 10. Missing keys and mock mode

- **Your lane needs no provider keys.** Slice 1 runs on `src/contracts/fixtures`. Slice 2 runs against the integrated app with `VISION_PROVIDER=fake`, `MESSAGING_PROVIDER=fake`, `STORE=pglite` (PGlite-backed store, zero setup) or `STORE=postgres` (shared demo DB).
- **Captain-held secrets:** `SESSION_SECRET`, `DEMO_PASSCODE`, `APP_BASE_URL`, `ANNONA_DEMO_MODE`. Set them in `.env.local` and the Vercel dashboard only. `DATABASE_URL`, `DEMO_COURIER_A_HANDLE`, `DEMO_COURIER_B_HANDLE` (Dev 2), `GEMINI_API_KEY` (Dev 1), `PHOTON_*`, `ANNONA_INTERNAL_SECRET`, `TICK_INTERVAL_MS` (Dev 3) belong to their lanes; collect them privately for the demo deployment, never in git, chat logs or screenshots. Real courier handles are personal data: env only, never committed (D-024).
- **Mode is always visible:** the banner reads `GET /api/health`; each card's `ai_suggestion.mode` and each offer's `provider_mode` render as labels. A real provider selected without its key reports `status: misconfigured`, and its calls return `PROVIDER_UNAVAILABLE`; the UI shows both and never hides them or swaps in fake data. Switching to fake is an env change + restart, announced in chat.
- **Evidence before you call anything "real":**

| Claim | Required evidence |
|---|---|
| Real Gemini draft | `ai_suggestion.mode = "real"`, `model` recorded, T-IN-10 run by Dev 1 |
| Real Photon offer/claim | `provider_message_id` on the offer + T-MS-13 by Dev 3 + phone screenshots (T-E2E-04) |
| Deployed demo | T-E2E-05 against the URL in this session |
| Handoff steps | Always labeled **Simulated** (`simulated: true`); never "delivered" as real food movement |

Hosting fallback ladder (D-017; the judge demo runs from your laptop browser in every case):

1. Vercel + Supabase, with `pnpm worker` on the demo laptop.
2. `pnpm build && pnpm start` + worker locally against Supabase (cloudflared quick tunnel only if webhooks are needed).
3. Fully local with fake providers, clearly labeled. Backup: the recorded video.

## 11. Cross-lane integration points

| With | You consume | You provide | Via | When |
|---|---|---|---|---|
| Dev 1 | Intake components (`src/features/intake/components`, incl. `LinkVerification`); draft, verification and `/api/verify/*` handlers; video script text | `src/components/ui` primitives (UI-kit PR right after CP0b); `/donor/new` and `/v` pages that mount them; thin routes; `getActor`; `fixtures/intake/images` file tracing | `POST /api/intake/drafts`, `POST /api/donations/:id/verification`, `POST /api/verify/*` | `/donor/new` after Dev 1's wiring PR (after 2(a)); `/v` after 2(d) (~7:00 PM) |
| Dev 2 | `DashboardSnapshot`, `DonationCard` projections, operator/handoff/image/reset handlers, deterministic seed on `DEMO_ACTORS` UUIDs, `getSystemStatus()` | Container wiring of `createDispatchStore`; shared Supabase project + `DATABASE_URL`; courier handles via DM; T-E2E evidence | `GET /api/dashboard`, `GET /api/donations/:id`, `POST …/operator-actions`, `POST …/handoff`, `GET /api/images/:id`, `POST /api/demo/reset` | Early schema/seed PR by CP1; read models in sub-PR 2(c); stay on fixtures until then |
| Dev 3 | Dispatch, tick, simulated inbound/thread handlers; `pnpm worker` | Phone page; demo controls; worker host on demo laptop; `APP_BASE_URL` | `POST …/dispatch`, `POST /api/internal/tick`, `POST /api/messaging/simulated/inbound`, `GET /api/messaging/simulated/thread` | After Dev 3's wiring PR (after 2(b)) |
| All | Handoffs in `docs/handoffs/dev-N.md`; requests in `docs/requests/` | Contract decisions; merges; `docs/PROJECT_STATE.md` | Team chat + PRs | Continuous |

Merge order (OWNERSHIP §7, D-027): baseline (tag `baseline`) → lane slice 1 in any order (Dev 2 also ships the early schema + migrations + seed + PGlite store PR) → Dev 2 sub-PRs 2(a) intake-facing, 2(b) dispatch-facing, 2(c) read models; Dev 1, Dev 3 and Dev 4 each wire as soon as their sub-PR merges → shared demo DB (`STORE=postgres`) → real providers (Dev 1 Gemini = VEYZL evidence PR; Dev 3 Photon) → hardening (edge tests, VEYZL fix commit, polish, deploy).

Checkpoints: **CP0a** Sat 1:15 PM captain push + smoke · **CP0b** 1:30 PM all machines · **CP1** 4:00 PM slice PRs · **CP1.5** 5:15 PM 2(a)+2(b) merged · **CP2** 6:30 PM fake end-to-end · **CP3** 9:00 PM real providers recorded · **CP4** target 9:30 PM (latest 10:15 PM) Devpost draft submitted · **CP5** Sun 7:30 AM freeze + video · **CP6** Sun 9:30 AM final locked.

## 12. Acceptance checklist

- [ ] **CP0a/CP0b:** tag `baseline` pushed, `BASELINE_SHA` posted; T-CT-01 and T-CT-02 pass; `/api/health`, `/api/session`, `/api/session/actors` work; all four lanes on their branches with the smoke passing.
- [ ] **AC-14** Dashboard shows server truth, no client-side safety logic, `unmatched` separate and neutral: T-UI-01, T-UI-02, T-UI-03, T-UI-05, T-UI-07 pass.
- [ ] **AC-15** Truthful labeling: T-UI-04 passes (fake + `misconfigured` banner, masked JOIN status); T-E2E-01 shows banner, "Synthetic data", "DEMO: accelerated timers", "Simulated" handoff and phone; simulated phone posts `{ identity_id, text, fixture_id? }` through the same `handleInbound`.
- [ ] **AC-16** Demo readiness: T-UI-06 screenshots; T-E2E-01 (by message), T-E2E-06 (web fallback), T-E2E-02, T-E2E-03 on `main`; T-E2E-05 on the demo URL; T-E2E-04 run or **UNVERIFIED**; video recorded; Devpost draft (CP4) and final (CP6) submitted.
- [ ] Release-gate rows 1–9 (MVP_SCOPE §3) walked on integrated `main` (row 3 with the policy-eligible demo facts, `scene1_eligible_facts`) and recorded in `docs/PROJECT_STATE.md`.
- [ ] Sponsor claims match evidence (Photon: T-MS-13, and T-MS-19 before showing real photo intake; VEYZL: finding changed code on the D-022 evidence PR; Gemini: real call), else dropped. No race-safety claim without T-CO-17 (D-033).
- [ ] Canonical secret scan (ARCHITECTURE §9) clean before every push and in the Sun 9:00 AM full-history run; no `.env*` except `.env.example` committed.
- [ ] Handoff written in `docs/handoffs/dev-4.md`; Dev 1 approved your UI PRs; Dev 2 (or Dev 3, 4:00–6:30 PM) approved contract/shared PRs.
- [ ] UNVERIFIED items listed in the handoff and `docs/PROJECT_STATE.md`.

## 13. Stop and escalate when

- The baseline SHA is missing, contracts don't compile, or a contract is ambiguous or contradictory → file a request. Don't improvise a new shape.
- A safety-policy question comes up (what counts as eligible, a threshold, a new food category, an override) → stop. Policy changes go through the captain and `docs/DECISIONS.md`.
- A step would cost money, need a credit card, contact anyone who is not an opted-in teammate, or use real personal data.
- You need to touch another lane's files, add a dependency, or change a route or contract.
- `/status` shows your Pro usage is nearly exhausted → write your handoff now, so another human can continue your lane.
- You've been stuck for more than 20 minutes on the same error → post the exact error and what you tried in the team chat.
- A page needs data the read models don't provide → file `docs/requests/dashboard-<topic>.md`; never compute status, eligibility, deadlines or allergen conclusions client-side.
- Vercel, Supabase, Photon or VEYZL asks for payment, a plan upgrade or a card → stop; use the D-017 fallback ladder.
- The secret scan finds a match, or a key may have been pushed → stop pushing, rotate the key immediately, tell the owner; never rely on history rewriting.
- An integration failure or merge conflict lands in another lane's files → send it to the owner with the exact failing command and output; do not fix it.
- Deadline risk → cut scope in `docs/ROADMAP.md` order (P1 items, polish, VEYZL, then real providers to labeled fake). Never cut labeling, the refusal scene or the Devpost draft.

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
