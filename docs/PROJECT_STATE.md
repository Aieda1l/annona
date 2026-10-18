# PROJECT_STATE.md — captain's checkpoint

> **Owner:** integration captain (Dev 4) only. Lanes report through `docs/handoffs/dev-N.md` and PR descriptions, never by editing this file (OWNERSHIP §9).
> **As of:** 2026-10-18 02:16 PDT (build measured at `main` b153488, after #71) (updated by the captain after the CP0a/CP0b work and the first integration round; earlier history: written 2026-10-15 pre-event, revised 2026-10-16 for D-029, D-031..D-035). Observed facts are labeled with how they were observed; anything not run is UNVERIFIED.
> **Status:** Code exists and is merged on `main` (lanes 1 to 4 slice PRs, contracts, UI kit, env schema). **Nothing has been verified end to end:** the read models behind `/api/dashboard`, the donor checklist component, real Gemini and real Photon are not wired or proven. Every claim below is labeled.

## 1. Checkpoint summary

| Item | Value |
|---|---|
| Phase | Event: build window (code allowed since Sat Oct 17, 12:00 PM PDT per the organizers' early start; CLAUDE.md note). |
| Last known passing build | `main` at **b153488** (after #71), measured 2026-10-18 02:16 PDT in the captain worktree: `pnpm lint`, `pnpm typecheck`, `pnpm build` exit 0; `pnpm test` exit 0 with **2576 passed, 33 skipped (gated real-Postgres tests)** (102 test files passed, 2 files skipped). PGlite and fakes in the suite. **Deployed:** https://annona-mauve.vercel.app (Vercel Hobby, deployed from `main` by the captain with the CLI) on Supabase Postgres, real Gemini vision and real Photon (iMessage) messaging, three opted-in teammate phones, worker on a teammate's laptop. Synthetic data only. |
| Baseline | **Done.** Annotated tag `baseline` (object 2d7215e) points to **BASELINE_SHA `f750162953dbe37b89111071976c8fd247e96f57`** (commit 2026-10-17 12:12 PDT, contracts v0.4). Repo https://github.com/Aieda1l/annona is **public** (verified with `gh repo view`). |
| Contracts version | See the `docs/CONTRACTS.md` header (the only place the number is stated, D-034). v0.5 (spec, PR #9, fd2ffe7) and its types (PR #10, f50a0ce) are merged on `main`. |
| Decisions | D-036, D-038 and D-039 ACCEPTED by the captain 2026-10-17. PR #9 (contracts v0.5) is merged with Dev 3's approval; D-039 was narrowed the same day and its earlier-word blocklist dropped (spec PR #26; code change requested on #16). D-037 PROPOSED. Earlier decisions as in `docs/DECISIONS.md`. |
| Entry doc | `docs/KICKOFF.md` (D-034) |
| Next checkpoint | **CP1 Lane slices, Sat 4:00 PM** (partly reached, see below) |

| Checkpoint | Target (PDT) | State | Evidence |
|---|---|---|---|
| CP0a Baseline (captain push + smoke, tag `baseline`, SHA posted) | Sat 1:15 PM | **REACHED** | Tag and public repo above. Dev 4 smoke on the baseline (observed 12:20 PDT): typecheck, lint, test (47 passed), build all exit 0. Time the tag was pushed was not recorded. |
| CP0b Baseline (all four machines on their branches, install/typecheck/test/build pass) | Sat 1:30 PM | **REACHED (Dev 4 verified; others by branch evidence)** | Dev 4: `feat/dashboard` from the tag, install/typecheck/lint/test/build exit 0. Dev 1/2/3 branches (`feat/intake`, `feat/dispatch`, `feat/messaging`) exist and merged PRs; their own install results are in their handoffs and were not re-run by the captain. |
| CP1 Lane slices | Sat 4:00 PM | **PARTLY REACHED** | Slice PRs merged for all four lanes (see §9). Open: Dev 2 follow-up #21 (review fixes, awaiting Dev 3), Dev 3 #16 and #19, contracts #9 and #10. Dev 3's explicit gate-rule sign-off (OWNERSHIP §6) is not recorded. |
| CP1.5 Core unblocked (Dev 2 sub-PRs 2(a) + 2(b) merged, D-027) | Sat 5:15 PM | NOT REACHED | Only Dev 2's PR 1a (gate, matching, state) and PR 1b (persistence skeleton) are merged; the intake-facing, dispatch-facing and read-model functions are still `NOT_IMPLEMENTED` stubs on `main`. |
| CP2 Fake end-to-end (web fallback at minimum) | Sat 6:30 PM | NOT REACHED | — |
| CP3 Real providers + scene 1 by message + T-CO-17 | Sat 9:00 PM | NOT REACHED | — |
| CP4 Draft submitted | Target Sat 9:30 PM; latest 10:15 PM (hard 10:30 PM) | NOT REACHED | — |
| CP5 Freeze | Sun 7:30 AM | NOT REACHED | — |
| CP6 Final | Sun 9:30 AM (hard 10:00 AM) | NOT REACHED | — |

## 2. Repository facts

**Current (observed 2026-10-17 with `git`, `gh`):**
- Default branch `main`; remote `origin` = https://github.com/Aieda1l/annona, **public**. Tag `baseline` (annotated) at `f750162`.
- Squash-merged PRs so far are listed in section 9 (the source of truth for what is merged; this bullet does not list open PRs, because they change faster than this file). Approved and waiting for their authors to merge when this was written: #50 (Dev 1, real-HEIC evidence) and #51 (Dev 3, delivery receipts in poll mode); they have no log rows yet. Issue #27 is closed.
- `next dev` writes an untracked `AGENTS.md` at the repo root; it must not be committed (CLAUDE.md).

**Historical (observed 2026-10-15, before kickoff):**

- Branch: `master`, with **zero commits**. The contract expects `main`; kickoff renames it.
- Remote: **none**. Teammates cannot read the package until N-0 shares a read-only copy.
- Untracked: `.claude/`, `BOOTSTRAP_MASTER.md`, `CLAUDE.md`, `PROJECT_IDEA.md`, `README.md`, `docs/`, `prompts/`.
- **Nothing has been committed by the bootstrap**, by design (D-002). The first commit happens at or after 12:30 PM Sat.
- `.claude/settings.json` = `autoMemoryEnabled: false` (R-TOOL-9) plus the team default `model: sonnet`, Sonnet `medium` / Opus `high` effort (D-028), plus the ECC marketplace, `enabledPlugins: ecc@ecc` and `env.ECC_HOOK_PROFILE=minimal` (D-030; UNVERIFIED on a teammate's machine until one fresh clone shows `ecc@ecc` in `claude plugin list`).
- Organizer's machine (R-TOOL-10; LOCAL OBSERVATION, not true for teammates by default):
  - Claude Code 2.1.301, git 2.55.0, Node 22.23.2, pnpm 10.33.3, gh 2.100.0.
  - ECC 2.2.3 recorded at project scope with no `enabledPlugins` entry. ECC is now also enabled at user scope (hook profile `minimal`, verified 2026-10-16; a live hook blocked a `--no-verify` command). Its earlier project-scope record now matches the committed settings (D-030); leave it. **Do not** run `claude plugin uninstall ecc@ecc --scope project`, which would remove ECC from the shared file.
  - User settings pin Opus + `xhigh`, which burns quota fastest. **Lower that override before kickoff (N-0b)** and use `/model sonnet` + `/effort medium` for lane work (D-014).
- `claude --worktree` probably cannot create a worktree until a commit exists (INFERENCE, R-TOOL-8: the docs only describe a fallback to local HEAD). The baseline commit removes the question.

## 3. What exists (planning package; markdown only)

| Path | Purpose | State |
|---|---|---|
| `CLAUDE.md` | Operating contract for all Claude sessions | Present |
| `README.md` | Team launch steps (tag-based); pre-event ideation label | Present |
| `PROJECT_IDEA.md` | Seed brief (historical) | Present |
| `BOOTSTRAP_MASTER.md` | Master planning prompt | Present |
| `.claude/settings.json` | Disables auto memory | Present |
| `docs/KICKOFF.md` | One-page entry doc for every developer (D-034) | Present (PROPOSED) |
| `docs/PRODUCT_BRIEF.md`, `docs/MVP_SCOPE.md`, `docs/ARCHITECTURE.md`, `docs/CONTRACTS.md`, `docs/DECISIONS.md`, `docs/OWNERSHIP.md`, `docs/PROMPTING_GUIDE.md`, `docs/TEST_PLAN.md` | Spine docs | Present (PROPOSED) |
| `docs/ROADMAP.md`, `docs/BACKLOG.md`, `docs/PROJECT_STATE.md` | Timeline, deferred ideas, this checkpoint | Present (PROPOSED) |
| `docs/plans/active/kickoff-baseline.md` | Captain's kickoff plan | Present (PROPOSED) |
| `docs/handoffs/README.md`, `docs/requests/README.md` | Handoff and contract-request process | Present |
| `docs/RESEARCH.md`, `docs/PROMPT_EVAL.md` | Evidence ledger; Dev 1 prompt registry | Present (PROPOSED) |
| `prompts/dev-01-vision-intake.md` … `prompts/dev-04-dashboard-integration.md` | Four lane prompts, v1.3 (D-031..D-034; they read the contracts version from the CONTRACTS.md header) | Present. Never edited at kickoff: each lane checks that `git rev-parse 'baseline^{commit}'` equals the posted `BASELINE_SHA` (D-023). |

**Exists now:** `src/` (contracts, server, core, db, features, lib/ai, integrations, workflows, app, components), `tests/`, `package.json`, lockfile, migrations, the public GitHub repo, the UI kit. **Does not exist / not recorded here:** a Vercel project, a deployed URL, the VEYZL install, a Supabase project (none recorded), and any real Photon or Gemini evidence.

### 3.1 Decisions added by the v0.2 cross-document review (all PROPOSED)

| ID | Short form |
|---|---|
| D-021 | No post-verification dispatch hook. The next `tick` (≤ `TICK_INTERVAL_MS`, 5 s) dispatches newly `eligible` donations; the operator's "Dispatch now" calls `dispatchDonation`. Demo needs `pnpm worker` or "Run tick now". |
| D-022 | VEYZL evidence PR = the first intake/AI PR opened after CP2 (normally Dev 1's Gemini-adapter PR); fix by a follow-up commit on that open PR before merge. Dropped (not swapped) at Sun 3:00 AM without a finding. Supersedes D-018's timing. |
| D-023 | Baseline is the tag `baseline`; `BASELINE_SHA` = `git rev-parse 'baseline^{commit}'`; lanes run `git fetch --tags origin && git switch -c feat/<lane> baseline`; no prompt editing. Repo **public from kickoff**; canonical secret scan (ARCHITECTURE §9) before every push, full-history scan Sun 9:00 AM. |
| D-024 | `DEMO_ACTORS` fixture (fixed UUIDs, no handles) drives the picker; `/api/session`, `/api/session/actors` and `/api/health` work at baseline. Real courier handles only from env `DEMO_COURIER_A_HANDLE` / `DEMO_COURIER_B_HANDLE`, never git. |
| D-025 | Time and consent re-checked after the claim: S-09 (`now < effective_cutoff_at` since D-029), S-10 (`now < discard_by`), S-16 no-show at `effective_cutoff_at` → `expired` (`PICKUP_NOT_COLLECTED`), S-15 courier STOP while `claimed` → `needs_review` (`COURIER_OPTED_OUT`) *(STOP behavior superseded by D-032: release and re-offer before pickup, operator review after pickup)*. Only `joined` identities get messages, except `stop_ack`. |
| D-026 | Short codes unique across all offers until `resetDemo`; a stale code resolves to its own expired offer → `offer_expired`. |
| D-027 | Dev 2 early PR (schema + migrations + seed + PGlite store) by CP1, then sub-PRs 2(a)/2(b)/2(c); consumers wire as their sub-PR merges. CP1.5 at 5:15 PM. Dev 3 is the contract-change reviewer 4:00–6:30 PM. |

### 3.1a Decision added by the v0.3 claim/assignment review (PROPOSED)

| ID | Short form |
|---|---|
| D-029 | One active assignment per donation (index with `close_reason IS NULL`; S-15 clears `claimed_offer_id`); S-09/S-16 use `effective_cutoff_at`; claim re-checks capacity + pair feasibility under a recipient lock; incomplete inbound rows reprocessed after 30 s; derived capacity; one live offer per courier. |

### 3.1b Decisions added by the kickoff review A–E (PROPOSED)

| ID | Short form |
|---|---|
| D-031 | Messaging-first donor intake: donor phone JOINs, texts a photo, gets an AI-guess summary + one-time checklist link (CONTRACTS §8.4); verification only on the structured form; web upload is the fully supported fallback; SP-14 time-boxes the risk. |
| D-032 | New `unmatched` status (dispatch outcome) separate from `needs_review` (safety outcome); courier STOP before pickup releases and re-offers, after pickup goes to operator review with no reassignment. |
| D-033 | T-CO-17 on real Postgres (independent connections, demo pooler mode) is required before anyone calls claims race-safe. |
| D-034 | Lean kickoff: `docs/KICKOFF.md`; minimal baseline by default; CP0a 1:15 / CP0b 1:30; 28 must-run tests; contracts version only in the CONTRACTS.md header; minimal prompt edits. |

### 3.1c Decisions added during the event (2026-10-17)

| ID | Short form |
|---|---|
| D-036 | G-01 as written: a `pending` donor is `needs_review` whether or not licensed; any other non-approved donor is `rejected`. ACCEPTED (captain). Dev 3 approved PR #9 at 64ac044. |
| D-037 | `findCandidates` takes `busy_courier_ids`, `committed_servings`, `active_provider`, `donor_location`; malformed top-level input returns `[]`. PROPOSED. Only `busy_courier_ids` and `donor_location` are implemented. |
| D-038 | One cutoff resolution rule for S-06/S-08/S-09/S-14/S-15/S-16 and claim step 6: stored cutoff, else `min(donor_pickup_by, discard_by)`, else reached. ACCEPTED (captain). Dev 3 approved PR #9 at 64ac044. |
| D-039 | Opt-out words honored narrowly in short messages (`STOP`, `STOPALL`, `UNSUBSCRIBE`; `END`/`QUIT`/`CANCEL` only as the whole message; image captions never). ACCEPTED, narrowed the same day, then the earlier-word blocklist (YES/NO/DECLINE/ACCEPT/JOIN) was dropped on Dev 3's suggestion because it made "No, stop texting me" a decline. Spec merged (#26, 00369d8); the grammar code is on `main` via #19 and was verified by the captain with a 20-message probe. Not verified: the `stop_ack` rejoin wording. |

### 3.2 Resolved in contracts v0.2 (no longer open)

- Env var names: `TICK_INTERVAL_MS`, `TEST_DATABASE_URL`, `DEMO_COURIER_A_HANDLE`, `DEMO_COURIER_B_HANDLE` are in CONTRACTS §12.
- Request naming: `docs/requests/<lane-slug>-<topic>.md` with slugs `intake` / `dispatch` / `messaging` / `dashboard` (OWNERSHIP §2).
- Session owner: the captain, working at baseline from `DEMO_ACTORS` (D-024); `getActor(request)` in `@/server/session`.
- Dispatch after verification: no hook (D-021).
- Simulated-phone identities: simulated routes take `{ identity_id, text }` and return 403 unless `MESSAGING_PROVIDER=fake` (CONTRACTS v0.2).
- Baseline-push exception: the captain's kickoff commits up to the `baseline` tag (OWNERSHIP §6).

## 4. Real-vs-fake evidence

| Provider / surface | Planned real path | Fake / fallback | Status | Evidence required to mark VERIFIED | Owner |
|---|---|---|---|---|---|
| Gemini (`@google/genai`) | `VISION_PROVIDER=gemini`, `gemini-3.5-flash-lite` (D-012) | SHA-256-keyed fixture fake, labeled "AI: FAKE"; `misconfigured` (never silently fake) if the key is missing | **ADAPTER NOT BUILT / UNVERIFIED.** The fake provider and strict parser are merged (#5). Dev 1's spike notes (`docs/handoffs/dev-1.md`) say Vertex with ADC worked at location `global`; the AI Studio key path in D-012 is undecided. | T-IN-10: model ID, latency, schema-valid output on ≥ 2 synthetic fixtures | Dev 1 |
| Photon 2.0 Beta (iMessage) | `MESSAGING_PROVIDER=photon`, shared line, JOIN opt-in (D-011) | Simulated phone (fake mode only), labeled "Messaging: SIMULATED"; `misconfigured` if Photon keys are missing | **CODE MERGED, NOTHING REAL VERIFIED.** The fake gateway and parser (#7) and the real send, tick, relay worker and routes (#12) are merged, tested only with stubbed `fetch`. Dev 2's reviews say none of it is Photon evidence. The real gateway must report a non-ok status while sends are not implemented (#7 review item 3; confirm). | T-MS-13: real JOIN → offer → YES → claimed with `provider_message_id`s | Dev 3 |
| Supabase Postgres | `STORE=postgres`, transaction pooler 6543, `prepare: false` (R-INF-7) | `STORE=pglite` | **PGlite STORE MERGED; Postgres half UNVERIFIED.** Schema, migrations, seed and the PGlite store are merged (#11); the 26 gated Postgres tests (T-CO-23 half, T-CO-17) are skipped for lack of `TEST_DATABASE_URL`. No Supabase project is recorded here. | T-CO-23 migrations + **T-CO-17 (required, D-033)** independent-connection race through the pooler on `TEST_DATABASE_URL`. Until it passes, no race-safety claim anywhere. | Dev 2 (migrations); Dev 4 (project) |
| Photo intake by message (D-031) | Donor iPhone → Photon attachment → Gemini → `draft_ready` link | Simulated phone with `fixture_id` (fake mode); web upload fallback | **NOT VERIFIED.** Dev 3's photo path is PR #19 (open); the SP-14 result is in the lane handoffs. | SP-14 (MIME, size, retries, HEIC accepted?) then T-MS-19 with `provider_message_id`s | Dev 3 + Dev 1 |
| Vercel Hobby | Deployed `main` (D-017 step 1) | `next start` locally (step 2), fully local fake (step 3) | **NOT STARTED.** Needs a human for interactive `vercel login` / `vercel link` and a billing check. | T-E2E-05: deployed `/api/health` shows modes; dashboard loads; reset works | Dev 4 |
| VEYZL | GitHub App on the public repo; evidence PR = first intake/AI PR after CP2 (D-022) | None. Track dropped, not swapped. | **BLOCKED.** Creating the VEYZL project for `Aieda1l/annona` was attempted 2026-10-17 and VEYZL refused ("We don't see strong signals for dataset, API, or hybrid AI"): `main` has no real model call (the real provider is a stub; nothing imports `@google/genai`). It detected only false positives ("Food / Nutrition Tracker", low confidence). Unblocks when Dev 1's Gemini adapter is on `main` (issue #27). Updated plan: the evidence PR is the first AI-touching PR after the VEYZL project exists. Unknown: what the audit needs to reach (our AI endpoint requires a donor session) and whether only the default branch is scanned; ask VEYZL support. The organizer-OK condition in D-022 is still unanswered. | Check visible on that PR + a follow-up commit on it fixing a cited finding (R-SP-3) | Dev 4 + Dev 1 (the finding's lane) |

## 5. Integration blockers (current)

| # | Blocker | Unblocks when | Owner |
|---|---|---|---|
| IB-0 | **RESOLVED 2026-10-16:** the package has been shared with teammates (N-0). | — | organizer / Dev 4 |
| IB-1 | **RESOLVED 2026-10-17:** baseline tagged and pushed; all lanes branched. | — | Dev 4 |
| IB-2 | **Partly resolved (D-035):** pre-event docs may be in the repo and committed now. Still unanswered: sponsor accounts before 12:30 PM (default: at or after 12:30). | `#ask-dh` reply recorded in §6. If unanswered at 12:30, apply the kickoff-baseline §0 defaults and proceed; the baseline never waits on a reply. VEYZL waits for an explicit organizer OK. | Dev 4 |
| IB-3 | Lanes assigned 2026-10-17 (Colin, Rui, Ronnie, Cyrus). Still open: holders of the three iMessage handles (donor + couriers A/B) | Team decision recorded in §6 | team |
| IB-4 | Photon Beta access and behavior unverified: unprompted offer after JOIN, how long send permission lasts, webhook signature scheme, inbound photo attachments (format, readiness) | Dev 3 kickoff spikes SP-1..SP-3 and SP-14 | Dev 3 |
| IB-5 | PGlite inside `next dev` untested (ARCHITECTURE §16) | Dev 2 spike SP-6; fallback is a personal Supabase project | Dev 2 |
| IB-6 | Read models and verification links: RESOLVED on `main`. Slice 2(c) arrived with #40 and slice 2(d) with #46 (f1bc8a7; #41 itself had merged into its stacked base, not `main`), so the dashboard, detail page, operator actions, handoff, demo reset, image and `/api/verify/*` routes are real. Still to run: the dashboard, detail page and `/v` against the real handlers with a signed session; T-MS-19 against the real link flow; the dashboard snapshot cost on the Supabase pooler. | Captain runs the pages against the real handlers; Dev 3 runs T-MS-19 | captain, Dev 3 |
| IB-7 | `LinkVerification` (the `/v` checklist) is a placeholder; scene 1 by message cannot run. | Dev 1 builds it against `/api/verify/*` once Dev 2 and Dev 3 wire the links | Dev 1 |
| IB-8 | RESOLVED 2026-10-17: Dev 3 reviewed #21 and gave the explicit OK on the three gate-rule changes (OWNERSHIP section 6); #21 merged (ce37893). Their MEDIUM follow-ups (missing .data parent folder; seed handle normalization) are with Dev 2 for the next PR, (#16 and #19 are merged; see the log for how). | (done) | Dev 3 |
| IB-9 | Deployment (Vercel) and the Devpost project shell need a human: interactive logins, billing check, the Devpost form. | A human does them; the Devpost text is drafted in PR #24 | captain + team |
| IB-10 | Real providers. **Gemini: verified on the deployed stack** (23:13 PDT on 2026-10-17: a real draft, `AI: REAL (gemini-3.5-flash-lite)`, audit event `ai.suggestion_attached`; observed by the captain from the user's screenshot; one photo, not an accuracy result; the two earlier ~8 s failures were fixed by #62/#63 and their cause is inferred, not proven). **Photon: a real round trip on the deployed stack, read back from Photon's own message list by Dev 3** (`docs/handoffs/dev-3-photon-evidence.md`, #76, addendum #78): 49 messages, all 24 sent by Annona delivered within 2 s; JOIN x3, donor photo, checklist link opened and completed on the donor's phone, offer, expiry, re-offer, first claim, late and repeated claims, STOP. **Dev 3's reading, not reproduced by the captain**; the user (Cyrus) ran the smoke test with Dev 3 and reported it working except STOP, whose confirmation was dropped until #73 (a STOP confirmation retest on a phone is not yet confirmed to the captain). **T-CO-17 on real Postgres: reported PASSED by Dev 2 on a disposable Supabase database** (issue #66: 4 of 4 tests, 422 s, 6 connections, 20 rounds, exactly one `claimed` per round; a first rerun failed only because of a test bug that #69 fixes). It supports first-claim-wins on the **claim path** on Supabase's pooler; it does not cover the verification-link lock order (by reading only) and about 29 gated tests are still skipped; the captain did not reproduce it. Do not claim more than that. | One captain-watched repeat of the STOP confirmation and of the claim path | Dev 3, captain |
| IB-11 | VEYZL: **DROPPED (D-041, 2026-10-17 23:40 PDT).** Its hosted audit needs a chat-style text inference route; Annona's AI route takes an image, and its analysis profile misdescribes the system. No audit ran, so no VEYZL claim. The `VEYZL Audit` required check stays removed from `main`. | — | — |
| IB-12 | Real Gemini in a shared environment: the `fixture_id` gate and upload dedupe (#38), core magic bytes incl. HEIC/HEIF (#44), metadata stripping incl. JPEG orientation (#42, #53) and the shape-independent secret scan (#57) are on `main`; `GEMINI_API_KEY` and `ANNONA_DEMO_MODE=1` are set in Vercel production (values never in git or chat). **The donor form now starts from the AI draft (D-042, #77) and is shorter (D-043):** dish name, the lower servings bound, the ingredients text (with an explicit "I checked this list" tick) and the allergens the AI flagged (pre-selected Present); never "not in my listed ingredients", cross-contact, handling, preparation, temperatures or times. jsdom-tested only, **not yet tried in a real browser**; follow-ups in #79 (contracts v0.7). Still open: HEIC arriving through Photon (content type may not be `image/*`, `photo.ts`); free-tier Gemini inputs may be used by Google, so food-only photos; the quota of the free key is unknown. | Dev 3; captain | Dev 3, captain |
| IB-13 | Dev 3's core-addition requests (`docs/requests/messaging-core-idempotency-lookup.md`) have no decision yet. | Captain decides with Dev 2 | captain + Dev 2 |
| IB-14 | RESOLVED (reported): the checklist link on the deployed URL (`APP_BASE_URL`) was opened and completed on the donor's phone in the live run (Dev 3's evidence, #76). | — | — |
| IB-15 | Opt-out grammar: "yes, please opt me out" is not an opt-out under D-039 (STOP, STOPALL, UNSUBSCRIBE anywhere in a short message; END, QUIT, CANCEL only as the whole message). Missing an opt-out is worse than a false one, but D-039 narrowed the grammar after "stop by" false positives. | Team decision recorded in DECISIONS (see Q-4) | team |
| IB-16 | Open PRs when this was written: #79 (Dev 1's follow-ups to #77, contracts v0.7), #78 (Dev 3's JOIN evidence addendum, approved), #68 (Dev 1's demo deck: slide 9 says "Fast when it is safe" which implies a safety judgement, slide 3 says servings start unknown, slide 7 must list only what was seen on a phone). Issue #61 (Gemini timeout) is fixed by #63 and still open. | Reviews and wording fixes | Dev 1, Dev 3, captain |

## 6. Human decisions and questions (open)

| # | Question | Default until answered | Asked of | Answer |
|---|---|---|---|---|
| Q-1 | May pre-event planning docs be committed to the submission repo? May sponsor accounts be created before 12:30 PM Sat? | Docs committed **at or after 12:30**, labeled pre-event ideation. **All accounts at or after 12:30.** If docs are forbidden in the repo, use kickoff-baseline Step 2-ALT. | Organizers, `#ask-dh` | **Docs: yes.** They may be in the repo and committed now (organizer answer relayed by Dev 4, 2026-10-16; D-035). **Accounts before 12:30: no answer**, so the default stands. |
| Q-2 | Who is Dev 1, Dev 2, Dev 3 and Dev 4 (captain)? Which teammates hold the three iMessage handles (donor phone, couriers A and B)? | No real phone without an iMessage handle. Use the labeled simulated phone; with only two handles, keep couriers real and run intake by web upload. Anyone below about 50% weekly Claude usage does not take the captain or Dev 2 lane. | Team | **Assigned 2026-10-17:** Dev 1 Colin, Dev 2 Rui, Dev 3 Ronnie, Dev 4 Cyrus (organizer). Phone holders (donor, courier A, courier B) still to name; handles by DM only |
| Q-3 | Spend approval for any paid fallback (Gemini billing, Photon paid plan, Railway, usage credits) | **None. No spending.** Fall back to labeled fakes. | Team (all four) | `<pending>` |
| Q-4 | Should whole-message phrases such as "opt out" and "opt me out" count as STOP (D-039)? | **No change**: the grammar stays as D-039 until the team decides. A user can still send STOP. | Team (Dev 2, Dev 3, captain) | `<pending>` |

## 7. Next actions

| # | Action | Owner | By |
|---|---|---|---|
| N-0 | Share a **read-only copy** of the markdown package (OneDrive view link or a zip in team chat; not a git repo; no code) so each teammate can read before Saturday. After the kickoff commit, the repo replaces the copy as source of truth. | organizer / Dev 4 | **Done** 2026-10-16 |
| N-0b | Organizer's machine: confirm `claude plugin list` shows `ecc@ecc` enabled (no uninstall; D-030) and lower the Opus/`xhigh` override; stop non-essential Claude use until kickoff (R-TOOL-10, D-014) | organizer | ECC **done** 2026-10-16: `claude plugin list` shows `ecc@ecc` 2.2.3 enabled (user scope + Annona project scope). Opus/`xhigh` override not re-checked. |
| N-1 | Post the `#ask-dh` questions (Q-1) and record the answer here | Dev 4 | Docs half **done** (D-035); accounts half open |
| N-2 | Assign Dev 1–4, confirm iPhone holders (Q-2), and apply the weekly-quota rule (ROADMAP §3 P-02b) | team | Fri Oct 16 |
| N-3 | Complete the pre-event checklist (ROADMAP §3). **Dev 4 P-01/P-03/P-07 checked 2026-10-16:** Claude Code 2.1.302, `ANTHROPIC_API_KEY` unset (Git Bash and PowerShell), Node v22.23.2, pnpm 10.33.3 (a stale 9.7.0 `pnpm.exe` that shadowed it in PowerShell was renamed), gh 2.100.0 logged in, git 2.55.0 | each | Sat 12:30 PM |
| N-4 | Handles: the donor-phone and courier-phone holders DM their handles to Dev 2, Dev 3 and the captain only (Dev 3 needs them for the Photon assignments, R-PH-4; env `DEMO_DONOR_HANDLE`, `DEMO_COURIER_A_HANDLE`, `DEMO_COURIER_B_HANDLE`; never git, D-024). Dev 3 creates matching Photon assignments after kickoff. | handle holders; Dev 3 | DM Fri; assignments Sat after 12:30 |
| N-5 | Execute `docs/plans/active/kickoff-baseline.md` (minimal baseline); push the `baseline` tag; post `BASELINE_SHA` and the contracts version; record them and the smoke exit codes here | Dev 4 | CP0a Sat 1:15 PM. **DONE** 2026-10-17 (baseline commit 12:12 PDT) |
| N-6 | Each lane branches from the tag and passes install/typecheck/test/build | each | CP0b Sat 1:30 PM. **Done for Dev 4**; others by branch evidence |
| N-7 | Lane spikes: Gemini call (Dev 1, SP-4), Photon round trip and send-permission test (Dev 3, SP-1..SP-3), **photo intake SP-14 (Dev 3 + Dev 1) by 1:15 PM**; record VERIFIED/UNVERIFIED in handoffs; post the SP-14 go/no-go in chat | Dev 1, Dev 3 | SP-14 by 1:15 PM; others by 2:00 PM |
| N-8 | Create the Devpost project shell: all 4 contributors, Discord handles, Community Kitchen + SideShift + DubHacks NEXT only. First test whether a track can be removed; add Photon / Gemini / VEYZL at the 9:30 PM draft only if removable or their evidence exists. | Dev 4 | Sat ~2:00 PM. **NOT DONE** (needs a human at the form; text drafted in PR #24) |
| N-9 | Judging: whole team at all three rounds; outside the assigned round at least Dev 3 (iPhones) + one presenter stay. Before each judge: each courier phone sends a fresh JOIN, then demo reset; backup video on a second device. | Dev 3 + Dev 4 | Sun from 10:20 AM |

## 8. Risk register (top risks)

| # | Risk | Likelihood / impact | Mitigation | Trigger → response | Owner |
|---|---|---|---|---|---|
| R1 | Photon Beta blocked or behaves differently (no unsolicited send, webhook unverifiable, send permission lapses after JOIN) | Med / High | Kickoff spikes SP-1..SP-3; JOIN opt-in; relay worker with cursor checkpoint; labeled simulated phone; fresh JOIN from each courier phone before each judge demo | Spike fails by 2:00 PM → simulated phone; Photon track not declared (ROADMAP §9) | Dev 3 |
| R2 | Kickoff baseline overruns CP0a 1:15 PM; lanes idle | Med / High | Minimal baseline by default (D-034); typings, fixtures, env names and the UI kit go to follow-up PRs by 2:30 PM; lanes read KICKOFF.md and plan from ~12:50 PM | `entities.ts` not done at 12:58 → ship the cross-lane subset only; not green at 1:15 → re-run at 1:30, CP0b 1:45 | Dev 4 |
| R12 | Photo intake by message is unreliable (HEIC, `ATTACHMENT_NOT_READY`, size, donor send window) | Med / Med | SP-14 at kickoff; web upload built first and kept demonstrable; simulated-phone `fixture_id` path; no conversion library | SP-14 fails → web path first, photo intake only after CP2; T-MS-19 fails by CP3 → ROADMAP rung 6a | Dev 3 + Dev 1 |
| R3 | A human hits a Pro five-hour or **weekly** limit mid-event | High / Med | `sonnet` + `medium`; no swarms; quota rule P-02b; handoffs (R-TOOL-6) | `/status` < 20% → write a handoff now. Weekly limit hit Sat night → that lane continues by hand on tests and fixes; the captain re-scopes with ROADMAP §9 rungs; no cross-lane takeover without reassigning ownership in chat. | each |
| R4 | Devpost draft missed, which forfeits judging | Low / Critical | Shell by ~2:00 PM; CP4 target 9:30 PM, latest 10:15 PM | Not submitted by 10:15 PM → Dev 2 submits as backup | Dev 4 |
| R5 | Double assignment from a concurrency or dedupe bug | Med / Critical | CONTRACTS §8 transaction; short codes never reused before reset (D-026); T-CO-16/17/18/25/26; T-MS-03/11/15; cross-lane review | Any race test fails → stop merges to that path | Dev 2 + Dev 3 |
| R6 | Unsafe wording in UI or messages ("safe", "allergen-free") | Med / High | T-IN-11 claim-word guard; T-MS-05 template checks; T-UI-02 scan; fixture and scene names never contain "safe"; Dev 1 reviews Dev 4 PRs; no "dispatch anyway" (T-UI-03) | Found → fix before merge | Dev 4 + Dev 1 |
| R7 | Organizer ruling forces planning docs out of the repo | Low / Med | Ask early (Q-1); docs are separable from code | Ruling "no" → kickoff-baseline Step 2-ALT | Dev 4 |
| R8 | PGlite in Next or the Supabase pooler misbehaves | Med / Med | Same Drizzle code on both drivers; personal Supabase fallback | Smoke fails → `STORE=postgres` on a personal project | Dev 2 |
| R9 | Venue Wi-Fi, laptop sleep or relocation at 11 PM breaks the live demo | Med / High | Hotspot; backup video Sat ~11 PM; lazy expiry; "Run tick now"; relay resumes from the checkpointed cursor | Network down → hotspot, then the recorded video | Dev 4 |
| R10 | Secret pushed to the public repo (public from kickoff, D-023) | Low / High | `.gitignore` from baseline; canonical secret scan in ARCHITECTURE §9 before every push; full-history scan Sun 9:00 AM; handles only in env | Hit → rotate the key immediately; history rewriting does not un-leak a public push | Dev 4 + Dev 2 |
| R11 | Dev 2 core is the integration bottleneck before CP2 | Med / High | D-027 early PR by CP1 and sub-PRs 2(a)/2(b)/2(c); CP1.5 at 5:15 PM; Dev 3 reviews contract changes 4:00–6:30 PM | Core not merged by 5:30 PM → Dev 1/Dev 3 integrate against local test doubles; CP2 moves to 7:30 PM; P1 frozen (ROADMAP §9) | Dev 2 + Dev 4 |

## 9. Merged-PR log

| # | PR | Merged by | Merged SHA | Checks (real output summary) | Real vs fake | Reviewer |
|---|---|---|---|---|---|---|
| 1 | #1 shadcn/ui kit (Dev 4) | captain | afce238 | author-reported typecheck/lint/test/build 0 | n/a | Dev 1 approved |
| 2 | #2 dashboard on fixtures (Dev 4) | Dev 4 | 88ceb13 | author-reported pass | fixtures | Dev 1 approved (pushed fix commit) |
| 3 | #3 gate + matching + state, PR 1a (Dev 2) | Dev 2 | 953d539 | author-reported pass | pure functions | **No approval recorded; self-merged. Dev 3's gate sign-off (OWNERSHIP section 6) outstanding** |
| 4 | #4 demo controls (Dev 4) | Dev 4 | 6624dbf | captain re-ran: typecheck/lint/build 0, 127 tests | mocked fetch | Dev 1 pushed review fixes; no formal approval recorded |
| 5 | #5 fake vision + intake parsing (Dev 1) | Dev 1 | 6484786 | captain re-ran head: typecheck/lint/build 0, 492 passed | fake provider | Dev 4 safety review (comment, ECC reviewer); no formal approval; Dev 1 applied the fixes |
| 6 | #6 simulated phone (Dev 4) | Dev 4 | f4e73b7 | captain trial-merge: 947 passed, lint/typecheck/build 0 | mocked fetch | Dev 1 pushed review fixes; no formal approval recorded |
| 7 | #7 fake gateway + inbound parser (Dev 3) | Dev 3 | 00f2c67 | author-reported pass | fake gateway | **Self-merged with no review; Dev 2 post-merge review (comment) lists follow-ups** |
| 8 | #8 reset without a body (Dev 4) | Dev 4 | 2673503 | captain re-ran: 394 passed, lint/typecheck/build 0 | mocked fetch | Dev 1 fix commit; no formal approval |
| 9 | #11 persistence skeleton, PR 1b (Dev 2) | captain | 8fb9b8a | captain trial-merge: 1189 passed, 26 skipped, lint/typecheck/build 0 | PGlite only | Dev 3 approved at 4acd5ff. **Captain merged without reading Dev 3's review comment; its fixes are in follow-up PR #21, not in this merge** |
| 10 | #12 tick, delivery, real Photon send, routes, worker (Dev 3) | Dev 3 | 95db97c | Dev 2 ran head: typecheck/lint/test 0 (1043 passed) | stubbed fetch only, no real Photon | Dev 2 review (comment, approve with comments); Dev 3 applied fixes and merged |
| 11 | #14 env names (Dev 4) | Dev 1 | 846b2b3 | captain: lint/typecheck/build 0, 940 passed | n/a | **No human review recorded; merged by Dev 1** |
| 12 | #15 operator detail page (Dev 4) | Dev 1 | 832a76e | captain: 986 passed; Dev 1 re-ran | mocked fetch | Dev 1 approved (pushed fixes) |
| 13 | #17 /v donor page (Dev 4) | Dev 1 | c9ea7fa | captain: 952 passed | placeholder component | Dev 1 approved (pushed a comment fix) |
| 14 | #20 donor web upload + status (Dev 4) | Dev 1 | 0225ac8 | captain trial-merge: 1280 passed, lint/typecheck/build 0 | mocked fetch | Dev 1 approved (pushed fixes) |
| 15 | #18 /v response headers (Dev 4) | captain | 3c43862 | captain: 1283 passed on merged result; production `next start` shows `/v` dynamic with `Referrer-Policy: no-referrer` and `Cache-Control: no-store` | real local server | Dev 2 review comment "approve-ready after one production check" (check done) |
| 16 | #9 contracts v0.5 spec + D-036..D-039 (captain) | captain | fd2ffe7 | contract tests 47 passed before merge (docs only) | n/a | Dev 2 approved f2cc4c7; Dev 3 approved 64ac044 (bare approval, after saying earlier rechecks were not the sign-off) |
| 17 | #10 contracts-2: typed profiles, Offer, routes, function types, 11 card fixtures (captain) | captain | f50a0ce | captain, merged result: lint/typecheck/build 0, 1327 passed, 26 skipped, 1 todo (55 files); net diff = the 12 reviewed files | types and fixtures | Dev 3 approved 3037d13; Dev 2 comment "approval stands" (no formal approval). Merge of main pushed after retarget (docs conflicts resolved with main's versions) |
| 18 | #24 Devpost draft (Dev 4) | Dev 1 | 04b7196 | docs only | n/a | Dev 1 approved |
| 19 | #23 handoff for slice 2d (Dev 4) | Dev 1 | 7838540 | docs only | n/a | Dev 1 approved |
| 20 | #22 demo script, draft (Dev 4) | Dev 1 | 48969b4 | docs only | n/a | Dev 1 approved |
| 21 | #19 donor photo path (Dev 3) | Dev 3 | c853af0 | captain, main after all three merges: lint/typecheck/build 0, 1451 passed, 26 skipped, 1 todo (58 files) | fake/stubbed Photon, no real download | Dev 2 approved b1a379b; **merged at abf8aaa with two later commits** (the grammar merge and a photo-download hardening, ~30 source lines). Captain read them afterwards: fail-closed hardening, nothing risky |
| 22 | #16 opt-out words anywhere in a short message (Dev 3) | Dev 3 (via #19) | 155a754 | captain probe on `main`: 12 of 12 messages as specified; head checks typecheck/lint 0, 1008 passed | n/a | **Never merged on its own**: it shows as merged because #19's branch contained its commits. Dev 2's last review was a comment on an older head (30a941f); captain verified 155a754 |
| 23 | #26 D-039 spec without the earlier-word blocklist (captain) | Dev 1 | 00369d8 | docs only; contract tests passed before merge | n/a | **No reviewer approval recorded** (Dev 3 and Dev 2 were requested); merged by Dev 1 75 seconds after #19, so the code was on `main` just before its spec |
| 24 | #25 PROJECT_STATE update (captain) | captain | 8241b52 | docs only | n/a | Dev 2 approved 28c4174; merged at that head |
| 25 | #28 read internal secret and tick interval through getEnv (Dev 3) | Dev 3 | b5face5 | author-reported pass | n/a | Dev 2 approved |
| 26 | #21 PR 1b follow-up: review fixes + hardening (Dev 2) | captain | ce37893 | captain, head and head merged with main: lint/typecheck/build 0, 1585 passed, 26 skipped, 1 todo (62 files); net-diff secret scan clean | PGlite only | Dev 3 review (APPROVE with comments, explicit gate OK); Dev 3's non-blocking follow-ups posted on the PR for Dev 2 |
| 27 | #29 slice 2(a)+(b) core: intake, dispatch, claim, STOP (Dev 2) | Dev 3 (APPROVED on e14cd30, 2026-10-17 17:00) | 1c32f75 | captain, after the merge only: lint/typecheck/build 0, 1911 passed, 30 skipped, 1 todo (72 files) | PGlite only | **Merged by Dev 2 at 17:12 before the captain gate ran.** Dev 3 gave the explicit OK on the final head, which OWNERSHIP section 6 requires. Claims are tested on PGlite only; no race-safety claim until T-CO-17 passes on real Postgres (D-033) |
| 28 | #30 Gemini adapter, prompt versions, eval runner (Dev 1) | none recorded | 3c0960a (merge afce959) | captain on a trial merge at 3c0960a: typecheck/lint 0, 1897 passed, 28 skipped; ECC re-review: no blocker in fake mode | fake provider; a real Gemini smoke test is recorded by Dev 1 (T-IN-10) and is not re-run by the captain | **Merged by Dev 1 at 17:19 with only a captain comment (no approval).** D-040 applied: web-sourced eval photos removed from the tree, but they remain in the PR's commits and GitHub's PR refs |
| 29 | #34 intake hardening (Dev 1) | Cyrus (APPROVED on 0c20a57) | 5648e68 | captain trial merge: typecheck/lint 0, 1603 passed | stubs only for canvas/ImageBitmap | Medium follow-up: the file input is re-enabled after the `onDraft` error |
| 30 | #36 real-core intake tests (Dev 1) | none recorded (Dev 2 requested) | 5137640 | captain trial merge: typecheck/lint 0, 1923 passed, 12 of 12 real-core | real core on PGlite, fake vision | **Merged with only a captain comment.** Three medium test-strength follow-ups posted |
| 31 | #33 HEIC accepted from messaging (Dev 1) | Cyrus (APPROVED on d3f2132) | bebd7a2 | earlier captain run: 1590 passed | none | Merged at 7c72633, a later head than the approval; the later commits only merged `main`. Core still refuses HEIC until the `intake-heic-core-allowlist` request is done |
| 32 | #37 messaging core adapter and barrel wiring (Dev 3) | Dev 2 (37537bf), Cyrus (72bb3a4) | d7c49a0 | captain trial merge: typecheck/lint/build 0, 2273 passed, 32 skipped | PGlite core, fake Photon | Findings 1 to 4 (no real-core YES/NO/STOP test; vacuous tick test; unparseable identity ignores STOP silently; post-commit throw reply) are for Dev 3 before T-MS-13/T-MS-19 |
| 33 | #38 gate `fixture_id`, dedupe repeated uploads (Dev 1) | Cyrus (APPROVED on f34c826) | 685eed6 | captain trial merge at f34c826: typecheck/lint/build 0, 2263 passed | fake/PGlite | **Merged at fef597b, a later head than the approval.** The later commit removes the post-success reuse (my medium finding: a stale card for 10 s after verify or reset); the captain has not re-run that commit on its own |
| 34 | #32 vision file tracing, `GEMINI_ESCALATION_MODEL`, D-040 (captain) | Dev 1 (APPROVED on cc74394) | 9ca984d | captain trial merge with d7c49a0: typecheck/lint/build 0, 2282 passed | n/a | Dev 2 was requested and did not review; one other human reviewed, as OWNERSHIP section 3 requires. The real Vercel bundle (T-E2E-05) is not run |
| 35 | #35 PhotoPreview fallback for photos the browser cannot decode (Dev 4) | Dev 1 (APPROVED on 0542dc4) | 0f95ae9 | captain trial merge: typecheck/lint/build 0, 2304 passed | n/a | UI fallback only; no claim about the food. Not checked in a browser with a real HEIC file |
| 36 | #43 photo handler answers a refused checklist link (Dev 3) | Dev 2 (APPROVED on e561f36) | eb88bad | captain trial merge: typecheck/lint/build 0, 2307 passed | test double for the link function | The captain's review was a comment only; the merge had one human approval (Dev 2). Fixes a relay wedge raised in the #37 review |
| 37 | #40 slice 2(c): read models, handoff, operator actions, demo reset, six HTTP handlers (Dev 2) | Cyrus (APPROVED on 4f78bbf and c5b7de2) | cd68939 | captain trial merge at c5b7de2: typecheck/lint/build 0, 2361 passed, 32 skipped | PGlite only | **No race-safety claim (D-033).** Open follow-ups: reset `actor` should be required; reset re-joins opted-out `fake` identities without checking the handle is synthetic; party card shows both parties' names; dashboard not yet run against the real handlers with a session |
| 38 | #42 strip Exif/GPS and other metadata from accepted photos (Dev 1) | Cyrus (APPROVED on b53bbb3) | 2c7fd47 | captain trial merge: typecheck/lint/build 0, 2342 passed, 33 skipped; captain probes: trailing JPEG data and hostile HEIC `iloc` counts fixed | synthetic images only | **UNVERIFIED on a real iPhone HEIC.** The first review found GPS surviving in a second JPEG after EOI; fixed before merge. PNG and WebP are drop-lists, so unknown chunks (e.g. C2PA) pass; JPEG orientation is lost |
| 39 | #44 core accepts HEIC/HEIF with a brand check (Dev 2) | Dev 1 (APPROVED on e99418d) | 60cbc80 | captain trial merge: typecheck/lint 0, 2327 passed | n/a | 12 source lines; MP4/MOV/AVIF labelled as HEIC are refused. Stored bytes stay HEIC; preview relies on #35's fallback |
| 40 | #39 audit guard accepts real Photon ids (Dev 2) | Dev 3 (comment review approving from the messaging side on 2349ab7) | 875e125 | captain trial merge at 5863324: typecheck/lint 0, 2310 passed | real Photon id shapes measured by Dev 3 (read-only) | Requires a letter in the id body, so a prefixed all-digit string is still refused (captain's LOW, fixed before merge). No formal APPROVED review state |
| — | #41 slice 2(d) verification links (Dev 2) | Cyrus (comment), Dev 3 (APPROVED on e4615b7) | merged into its stacked base `feat/dispatch-slice2c` (4fb9054), **not `main`**; carried to `main` by #46 | captain trial merge at 6f0f896: typecheck/lint/build 0, 2364 passed | PGlite only | Kept as a row because GitHub shows it as merged; see #46 |
| 41 | #45 rate-limit `/api/verify/*` (Dev 1) | Cyrus (APPROVED on 471df7e) | 4d5c6f4 | captain trial merge: typecheck/lint/build 0, 2423 passed | n/a | Per-process, 60 per minute per client across view/image/submit, checked before core. The client key is the first `x-forwarded-for` value: whether Vercel overwrites a client-supplied one is **unverified** (check on the first deploy) |
| 42 | #46 carry slice 2(d) verification links to `main` (Dev 3 opened; Dev 2's code from #41) | Cyrus (APPROVED on 4fb9054) | f1bc8a7 | captain trial merge: typecheck/lint/build 0, 2446 passed, `db:generate` no change; ECC review of e4615b7 | PGlite only | **No race-safety claim (D-033).** Follow-ups: a STOP racing a submit can miss the new resubmit link; the donation row is locked before the token is checked; the 10-link cap counts used and revoked links; unknown donation now returns NOT_AUTHORIZED on the session path |
| 43 | #31 PROJECT_STATE rounds 5 to 10 (captain) | Dev 2 (APPROVED on f996903) | 8f028c2 | docs only | n/a | Merged on the approved head; its IB-6 line about 2(d) was overtaken by #46 four minutes after approval and is corrected in round 11 |
| 44 | #47 `/api/health` reports last tick and policy version from `getSystemStatus` (captain) | Dev 2 (APPROVED on eb1f94f) | 21eb966 | captain trial merge: typecheck/lint/build 0, 2450 passed; live `next start` on PGlite: `unavailable` when unmigrated, `2026-10-17.1` when seeded | PGlite, fake providers | If the status read fails, the banner gets `last_tick_at: null` and `policy_version: "unavailable"` and only the error class is logged. Follow-up: call core's `systemModes()` instead of building the object twice |
| 45 | #48 link-path and HEIC/GPS integration tests against the real core (Dev 1) | Cyrus (APPROVED on 7b13588) | 1a16e73 | captain trial merge: typecheck/lint/build 0, 2462 passed; link tests 15 of 15 on three runs | real core on PGlite, fake vision | The simultaneous-submit test is logic only on single-connection PGlite (no race evidence, D-033). Merged by Dev 1 at 21:09 |
| 46 | #49 PROJECT_STATE round 11 (captain) | Dev 2 (APPROVED on 2da286e) | b449add | docs only | n/a | Merged on the approved head |
| 47 | #50 first real iPhone HEIC through the stripper and Gemini; stronger local real-file check (Dev 1) | Cyrus (APPROVED on a9387ac) | 50303e4 | captain trial merge: typecheck/lint/build 0, 2450 passed | one real file and one real Gemini call, reported by Dev 1, not reproduced by the captain | Test and docs only |
| 48 | #51 delivery receipts in poll mode (Dev 3) | Dev 2 (APPROVED on 85d649b), Cyrus (APPROVED on 85d649b) | eb79236 | captain trial merge: typecheck/lint/build 0, 2457 passed; ECC read | stubbed fetch; real runs reported by Dev 3 | Open follow-ups: only the failure code (not the whole `failure` object) should cross to the inbound route; one page of 50 messages is read per scan; a receipt after 5 minutes is lost |
| 49 | #53 keep JPEG orientation when stripping Exif (Dev 1) | Cyrus (APPROVED on d603ad6) | 459e161 | captain trial merge: typecheck/lint/build 0, 2491 passed; hostile-Exif and 4000-mutation fuzz probes (same GPS-survival count as `main`) | synthetic JPEGs; no real rotated photo | The kept segment is 36 bytes built from constants plus one validated byte |
| 50 | #54 handoff for the real Gemini photo runs; request to widen the secret scan (Dev 3) | Dev 2 (APPROVED), Cyrus (APPROVED on 0fb5c41) | 53a98e6 | docs only; canonical scan clean | real runs reported by Dev 3 | The request led to #57 |
| 51 | #55 Annona logo asset (Dev 3) | none (captain comment only) | f8f35a2 | PNG structure checked by the captain (1536x1024, CRCs ok, no metadata chunks) | n/a | **Merged by Dev 3 with no approval.** Logo generated with ChatGPT during the event; the organizers allow AI-generated assets (per the team); disclose on Devpost |
| 52 | #56 take a signed-in operator or donor to their page (Dev 4) | Dev 2 and Dev 1 (APPROVED on 3bd0987) | 851c2d1 | captain: typecheck/lint/build 0, 2496 passed | router mocked | Found live: the sign-in stopped at "Signed in as operator" |
| 53 | #57 SECRET_RE catches a key of any shape assigned to a secret-named variable (captain) | Dev 2 and Dev 3 (APPROVED on 70bda39) | 7e35a6f | captain: typecheck/lint/build 0, 2505 passed; real `grep -E` over the tree: 7 hits, all fake test fixtures | n/a | A bare key with no variable name is not caught: read the Sunday full-history scan by eye |
| 54 | #52 PROJECT_STATE round 12 (captain) | Dev 1 (APPROVED on de44cd3) | e712d9c | docs only | n/a | |
| 55 | #58 Annona icon, favicon and header logo (Dev 4) | Dev 1 (APPROVED on 4000582) | 771d6d8 | captain trial merge: typecheck/lint/build 0, 2515 passed | local production build served the icon routes | A first favicon failed `next build` (not RGBA); a test now covers it. Not checked in a dark tab or on an iPhone |
| 56 | #62 maxDuration 30 s on the routes that wait on the vision model (captain) | Dev 3 and Dev 1 (APPROVED on 5942394) | df1c5a6 | captain: typecheck/lint/build 0, 2519 passed | n/a | Does not change the adapter's own timeout |
| 57 | #60 Sign out button (Dev 4) | Dev 3 (APPROVED on ea9f927); Dev 1 (APPROVED on da60563) | 3c3d502 | captain trial merge: typecheck/lint/build 0, 2524 passed; real sign-in and sign-out cycle on a local production build (cookie cleared, dashboard 403 afterwards) | router and fetch mocked in the unit tests | Hidden on `/` and on `/v` (the donor's checklist link has no session). Dev 1 fixed a stuck-disabled state |
| 58 | #63 record why vision failed; 9 s per attempt inside a 14 s total (Dev 1) | Cyrus (APPROVED on 06d57ee, re-approved on b8d030d after reading the delta) | 8a28343 | captain trial merge: typecheck/lint/build 0, 2538 passed (first full run had 1 failure, name not captured, second run clean; the known flake is #59) | n/a | Part of #61. The reason (`timeout`, `network`, `http_<status>`, `blocked`) is stored in the failure event; no text, image or key |
| 59 | #64 PROJECT_STATE round 13; D-041 drops VEYZL (captain) | Dev 2 (APPROVED on d89a4ae) | f901c13 | docs only | n/a | |
| 60 | #65 the worker waits 35 s for the inbound route (Dev 3) | Cyrus (APPROVED on 3d72207) | ac8edf8 | captain trial merge: typecheck/lint/build 0, 2540 passed | stubbed fetch | One line of source; the relay is sequential, so one slow photo can hold the next message for up to 35 s |
| 61 | #69 issue #66 follow-ups: flaky #59, reset needs an operator actor, reset re-joins only synthetic identities, bad token no longer takes the donation lock, STOP vs submit race, link cap (Dev 2) | Cyrus and Dev 3 (APPROVED on c187eb9) | 5891d40 | captain trial merge: typecheck/lint/build 0, 2544 passed; ECC read the lock order (no cycle) | PGlite only; T-CO-17 on real Postgres is Dev 2's report (see IB-10) | The two lock-ordering changes are proven by reading only |
| 62 | #70 Dev 1's fixes for #69 (request-doc path in a comment) | none recorded | b129941 | not run by the captain | n/a | **Merged by its author with no approval**; a comment-path fix |
| 63 | #73 the STOP confirmation was dropped by the real Photon gateway (Dev 3) | Cyrus (APPROVED on 9d9ef22) | d20e012 | captain trial merge: typecheck/lint/build 0, 2549 passed | stubbed network; real STOP retest not yet confirmed to the captain | Opted-out identities are reachable for `stop_ack` only |
| 64 | #74 a repeated JOIN says "you're already opted in" (Dev 3) | Cyrus (APPROVED on 9569c0a) | 47774fa | captain trial merge: typecheck/lint/build 0, 2551 passed | checked live after the redeploy (Dev 3, #78) | |
| 65 | #76 Photon track evidence from the live run (Dev 3) | Dev 1 (APPROVED on 9b4ccb3) | 6adf8e6 | docs only; canonical scan clean | Photon's own message list, read by Dev 3 | Not reproduced by the captain; states what it does not prove |
| 66 | #77 the donor form starts from the AI draft (D-042) and is shorter (D-043) (captain, in Dev 1's lane) | Dev 1 (APPROVED on bcefbd6) | 0ff2e42 | captain: typecheck/lint/build 0, 2575 passed in three full runs; 24 new tests, 13 of them failed first | jsdom only | Dev 1's follow-ups are in #79 |
| 67 | #71 contracts v0.6: `ResetDemoFn` requires the caller's actor (captain) | Dev 2 (APPROVED on a2fb84e) | b153488 | captain: typecheck/lint/build 0, 2541 passed; compile-time test failed first | n/a | |

## 10. Environment and accounts

| Account / resource | Owner | When | Status | Secret handling |
|---|---|---|---|---|
| Claude Code + own Pro account (≥ v2.1.284); ECC via the committed project settings after folder trust (D-030) | each | Pre-event | UNVERIFIED per teammate | Never set `ANTHROPIC_API_KEY` (R-TOOL-5) |
| Devpost account + Discord handle | each → Dev 4 | Pre-event | NOT STARTED | — |
| GitHub repo (**public from kickoff**, D-023) | Dev 4 | Kickoff, ≥ 12:30 Sat | CREATED, public (https://github.com/Aieda1l/annona) | No secrets in git; canonical scan (ARCHITECTURE §9) before every push |
| Supabase project (Free), created fresh | Dev 4 | Right after baseline | **CREATED** 2026-10-17 (free plan; transaction pooler, us-east-1); migrated and seeded by the captain; the database password was rotated after it appeared in a chat | `DATABASE_URL` only in the Vercel project and a gitignored `.env.local`; never in git or chat (R-INF-1) |
| Disposable Postgres for gated tests (`TEST_DATABASE_URL`) | Dev 2 | Before CP3 | NOT CREATED | Never the shared demo DB (CONTRACTS §12) |
| Vercel Hobby project | Dev 4 | Right after baseline | **CREATED** 2026-10-17: project `annona` under the captain's Hobby account; production alias https://annona-mauve.vercel.app; Git auto-deploy disconnected (deploys by the CLI from a clean checkout of `main`) | Env vars in Vercel only (sensitive); production vars set: `STORE`, `DATABASE_URL`, `SESSION_SECRET`, `DEMO_PASSCODE`, `ANNONA_INTERNAL_SECRET`, `ANNONA_DEMO_MODE`, `APP_BASE_URL`, `VISION_PROVIDER`, `GEMINI_API_KEY`, `MESSAGING_PROVIDER=fake`; the Photon variables are not set |
| Photon Beta org/project, API key, shared-line assignments, webhook destination | Dev 3 | Kickoff spike, ≥ 12:30 (unless Q-1 allows earlier) | NOT CREATED | `PHOTON_*` server-only; API key shown once (R-PH-2); webhook secret shown once (R-PH-6) |
| Demo handles (`DEMO_DONOR_HANDLE`, `DEMO_COURIER_A_HANDLE`, `DEMO_COURIER_B_HANDLE`) | Handle holders → Dev 2 + captain; Dev 3 mirrors them as Photon assignments | DM pre-event; env at kickoff | NOT STARTED | DM only; local env / Vercel env; never in git; `.env.example` leaves them empty; unset means synthetic `@example.invalid` handles for fake mode only (D-024) |
| Google AI Studio key (own, per dev) + a separate demo project key | each; demo key Dev 1 | Kickoff, ≥ 12:30 (unless Q-1 allows earlier) | **A key is set in Vercel production** (free tier); Dev 1 and Dev 3 report their own keys work locally | Server-only `GEMINI_API_KEY`; synthetic, food-only photos (R-AI-5) |
| VEYZL GitHub App | Dev 4 | After explicit organizer OK; repo already public | **NOT INSTALLED; track dropped (D-041).** The VEYZL project exists and is dormant | — |
| MLH Commit form | Dev 3 | Sun, only if entering | NOT STARTED | — |

## 11. Update protocol

- The captain updates this file after each checkpoint and each merge, in a `chore/integration-*` PR. The `BASELINE_SHA` record is a later commit on `main`; lanes do not need it to branch (they use the tag).
- Paste real command output summaries. Mark anything not run as **UNVERIFIED**.
- Record each lane's verified handoff (by link to `docs/handoffs/dev-N.md`) in §9 and §4.
