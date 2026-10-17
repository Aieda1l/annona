# PROJECT_STATE.md — captain's checkpoint

> **Owner:** integration captain (Dev 4) only. Lanes report through `docs/handoffs/dev-N.md` and PR descriptions, never by editing this file (OWNERSHIP §9).
> **As of:** 2026-10-15, pre-event ideation. Written by the master bootstrap planning session; updated 2026-10-16 for D-029, for the kickoff review D-031..D-034, and for the Q-1 answer (D-035), the Dev 4 assignment and the judging/video re-check (R-DH-5, R-DH-14).
> **Status:** **Nothing is implemented. No build, test, deployment or provider call has happened.** Every claim below is labeled.

## 1. Checkpoint summary

| Item | Value |
|---|---|
| Phase | Pre-event ideation (D-002). Code is allowed from Sat Oct 17, 12:30 PM PDT (R-DH-1, R-DH-3). |
| Last known passing build | **None.** No code exists. |
| Baseline | **Pending.** The captain creates it at kickoff (at or after 12:30 PM Sat) via `docs/plans/active/kickoff-baseline.md`, tags it **`baseline`**, and posts `BASELINE_SHA` = `git rev-parse 'baseline^{commit}'` (D-023). Lanes branch from the tag; prompts are never edited. |
| Contracts version | See the `docs/CONTRACTS.md` header (the only place the number is stated, D-034); generated into `src/contracts` at kickoff |
| Decisions | D-001..D-017, D-019, D-021..D-034 PROPOSED (D-002's commit clause refined by D-035; D-008's donor path superseded by D-031; D-014's scope clause by D-030; D-025/D-029 STOP behavior by D-032); D-018 SUPERSEDED by D-022; D-020 and D-035 ACCEPTED (`docs/DECISIONS.md`) |
| Entry doc | `docs/KICKOFF.md` (D-034) |
| Next checkpoint | **CP0a Baseline push, Sat 1:15 PM** |

| Checkpoint | Target (PDT) | State | Evidence |
|---|---|---|---|
| CP0a Baseline (captain push + smoke, tag `baseline`, SHA posted) | Sat 1:15 PM | NOT REACHED | — |
| CP0b Baseline (all four machines on their branches, install/typecheck/test/build pass) | Sat 1:30 PM | NOT REACHED | — |
| CP1 Lane slices | Sat 4:00 PM | NOT REACHED | — |
| CP1.5 Core unblocked (Dev 2 sub-PRs 2(a) + 2(b) merged, D-027) | Sat 5:15 PM | NOT REACHED | — |
| CP2 Fake end-to-end (web fallback at minimum) | Sat 6:30 PM | NOT REACHED | — |
| CP3 Real providers + scene 1 by message + T-CO-17 | Sat 9:00 PM | NOT REACHED | — |
| CP4 Draft submitted | Target Sat 9:30 PM; latest 10:15 PM (hard 10:30 PM) | NOT REACHED | — |
| CP5 Freeze | Sun 7:30 AM | NOT REACHED | — |
| CP6 Final | Sun 9:30 AM (hard 10:00 AM) | NOT REACHED | — |

## 2. Repository facts (observed 2026-10-15 with `git status` / `git branch` / `git remote -v`)

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

**Does not exist yet:** any `src/`, `tests/`, `package.json`, lockfile, migrations, `.env*`, GitHub repo, Supabase project, Vercel project, Photon project, AI Studio key or VEYZL install.

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
| Gemini (`@google/genai`) | `VISION_PROVIDER=gemini`, `gemini-3.5-flash-lite` (D-012) | SHA-256-keyed fixture fake, labeled "AI: FAKE"; `misconfigured` (never silently fake) if the key is missing | **NOT STARTED / UNVERIFIED** | T-IN-10: model ID, latency, schema-valid output on ≥ 2 synthetic fixtures | Dev 1 |
| Photon 2.0 Beta (iMessage) | `MESSAGING_PROVIDER=photon`, shared line, JOIN opt-in (D-011) | Simulated phone (fake mode only), labeled "Messaging: SIMULATED"; `misconfigured` if Photon keys are missing | **NOT STARTED / UNVERIFIED** | T-MS-13: real JOIN → offer → YES → claimed with `provider_message_id`s | Dev 3 |
| Supabase Postgres | `STORE=postgres`, transaction pooler 6543, `prepare: false` (R-INF-7) | `STORE=pglite` | **NOT STARTED / UNVERIFIED** | T-CO-23 migrations + **T-CO-17 (required, D-033)** independent-connection race through the pooler on `TEST_DATABASE_URL`. Until it passes, no race-safety claim anywhere. | Dev 2 (migrations); Dev 4 (project) |
| Photo intake by message (D-031) | Donor iPhone → Photon attachment → Gemini → `draft_ready` link | Simulated phone with `fixture_id` (fake mode); web upload fallback | **NOT STARTED / UNVERIFIED** | SP-14 (MIME, size, retries, HEIC accepted?) then T-MS-19 with `provider_message_id`s | Dev 3 + Dev 1 |
| Vercel Hobby | Deployed `main` (D-017 step 1) | `next start` locally (step 2), fully local fake (step 3) | **NOT STARTED / UNVERIFIED** | T-E2E-05: deployed `/api/health` shows modes; dashboard loads; reset works | Dev 4 |
| VEYZL | GitHub App on the public repo; evidence PR = first intake/AI PR after CP2 (D-022) | None. Track dropped, not swapped. | **NOT STARTED / UNVERIFIED** | Check visible on that PR + a follow-up commit on it fixing a cited finding (R-SP-3) | Dev 4 + Dev 1 (the finding's lane) |

## 5. Integration blockers (current)

| # | Blocker | Unblocks when | Owner |
|---|---|---|---|
| IB-0 | **RESOLVED 2026-10-16:** the package has been shared with teammates (N-0). | — | organizer / Dev 4 |
| IB-1 | No baseline. All lanes are blocked from branching. | Tag `baseline` pushed and `BASELINE_SHA` posted (CP0a) | Dev 4 |
| IB-2 | **Partly resolved (D-035):** pre-event docs may be in the repo and committed now. Still unanswered: sponsor accounts before 12:30 PM (default: at or after 12:30). | `#ask-dh` reply recorded in §6. If unanswered at 12:30, apply the kickoff-baseline §0 defaults and proceed; the baseline never waits on a reply. VEYZL waits for an explicit organizer OK. | Dev 4 |
| IB-3 | Lanes assigned 2026-10-17 (Colin, Rui, Ronnie, Cyrus). Still open: holders of the three iMessage handles (donor + couriers A/B) | Team decision recorded in §6 | team |
| IB-4 | Photon Beta access and behavior unverified: unprompted offer after JOIN, how long send permission lasts, webhook signature scheme, inbound photo attachments (format, readiness) | Dev 3 kickoff spikes SP-1..SP-3 and SP-14 | Dev 3 |
| IB-5 | PGlite inside `next dev` untested (ARCHITECTURE §16) | Dev 2 spike SP-6; fallback is a personal Supabase project | Dev 2 |

## 6. Human decisions and questions (open)

| # | Question | Default until answered | Asked of | Answer |
|---|---|---|---|---|
| Q-1 | May pre-event planning docs be committed to the submission repo? May sponsor accounts be created before 12:30 PM Sat? | Docs committed **at or after 12:30**, labeled pre-event ideation. **All accounts at or after 12:30.** If docs are forbidden in the repo, use kickoff-baseline Step 2-ALT. | Organizers, `#ask-dh` | **Docs: yes.** They may be in the repo and committed now (organizer answer relayed by Dev 4, 2026-10-16; D-035). **Accounts before 12:30: no answer**, so the default stands. |
| Q-2 | Who is Dev 1, Dev 2, Dev 3 and Dev 4 (captain)? Which teammates hold the three iMessage handles (donor phone, couriers A and B)? | No real phone without an iMessage handle. Use the labeled simulated phone; with only two handles, keep couriers real and run intake by web upload. Anyone below about 50% weekly Claude usage does not take the captain or Dev 2 lane. | Team | **Assigned 2026-10-17:** Dev 1 Colin, Dev 2 Rui, Dev 3 Ronnie, Dev 4 Cyrus (organizer). Phone holders (donor, courier A, courier B) still to name; handles by DM only |
| Q-3 | Spend approval for any paid fallback (Gemini billing, Photon paid plan, Railway, usage credits) | **None. No spending.** Fall back to labeled fakes. | Team (all four) | `<pending>` |

## 7. Next actions

| # | Action | Owner | By |
|---|---|---|---|
| N-0 | Share a **read-only copy** of the markdown package (OneDrive view link or a zip in team chat; not a git repo; no code) so each teammate can read before Saturday. After the kickoff commit, the repo replaces the copy as source of truth. | organizer / Dev 4 | **Done** 2026-10-16 |
| N-0b | Organizer's machine: confirm `claude plugin list` shows `ecc@ecc` enabled (no uninstall; D-030) and lower the Opus/`xhigh` override; stop non-essential Claude use until kickoff (R-TOOL-10, D-014) | organizer | ECC **done** 2026-10-16: `claude plugin list` shows `ecc@ecc` 2.2.3 enabled (user scope + Annona project scope). Opus/`xhigh` override not re-checked. |
| N-1 | Post the `#ask-dh` questions (Q-1) and record the answer here | Dev 4 | Docs half **done** (D-035); accounts half open |
| N-2 | Assign Dev 1–4, confirm iPhone holders (Q-2), and apply the weekly-quota rule (ROADMAP §3 P-02b) | team | Fri Oct 16 |
| N-3 | Complete the pre-event checklist (ROADMAP §3). **Dev 4 P-01/P-03/P-07 checked 2026-10-16:** Claude Code 2.1.302, `ANTHROPIC_API_KEY` unset (Git Bash and PowerShell), Node v22.23.2, pnpm 10.33.3 (a stale 9.7.0 `pnpm.exe` that shadowed it in PowerShell was renamed), gh 2.100.0 logged in, git 2.55.0 | each | Sat 12:30 PM |
| N-4 | Handles: the donor-phone and courier-phone holders DM their handles to Dev 2, Dev 3 and the captain only (Dev 3 needs them for the Photon assignments, R-PH-4; env `DEMO_DONOR_HANDLE`, `DEMO_COURIER_A_HANDLE`, `DEMO_COURIER_B_HANDLE`; never git, D-024). Dev 3 creates matching Photon assignments after kickoff. | handle holders; Dev 3 | DM Fri; assignments Sat after 12:30 |
| N-5 | Execute `docs/plans/active/kickoff-baseline.md` (minimal baseline); push the `baseline` tag; post `BASELINE_SHA` and the contracts version; record them and the smoke exit codes here | Dev 4 | CP0a Sat 1:15 PM |
| N-6 | Each lane branches from the tag and passes install/typecheck/test/build | each | CP0b Sat 1:30 PM |
| N-7 | Lane spikes: Gemini call (Dev 1, SP-4), Photon round trip and send-permission test (Dev 3, SP-1..SP-3), **photo intake SP-14 (Dev 3 + Dev 1) by 1:15 PM**; record VERIFIED/UNVERIFIED in handoffs; post the SP-14 go/no-go in chat | Dev 1, Dev 3 | SP-14 by 1:15 PM; others by 2:00 PM |
| N-8 | Create the Devpost project shell: all 4 contributors, Discord handles, Community Kitchen + SideShift + DubHacks NEXT only. First test whether a track can be removed; add Photon / Gemini / VEYZL at the 9:30 PM draft only if removable or their evidence exists. | Dev 4 | Sat ~2:00 PM |
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

| # | PR | Lane | Merged SHA | Checks (real output summary) | Real vs fake | Reviewer |
|---|---|---|---|---|---|---|
| — | *(none yet)* | | | | | |

## 10. Environment and accounts

| Account / resource | Owner | When | Status | Secret handling |
|---|---|---|---|---|
| Claude Code + own Pro account (≥ v2.1.284); ECC via the committed project settings after folder trust (D-030) | each | Pre-event | UNVERIFIED per teammate | Never set `ANTHROPIC_API_KEY` (R-TOOL-5) |
| Devpost account + Discord handle | each → Dev 4 | Pre-event | NOT STARTED | — |
| GitHub repo (**public from kickoff**, D-023) | Dev 4 | Kickoff, ≥ 12:30 Sat | NOT CREATED | No secrets in git; canonical scan (ARCHITECTURE §9) before every push |
| Supabase project (Free), created fresh | Dev 4 | Right after baseline | NOT CREATED | `DATABASE_URL` to Dev 2 via a private channel only (CLAUDE.md: never commit secrets; project created fresh per R-INF-1) |
| Disposable Postgres for gated tests (`TEST_DATABASE_URL`) | Dev 2 | Before CP3 | NOT CREATED | Never the shared demo DB (CONTRACTS §12) |
| Vercel Hobby project | Dev 4 | Right after baseline | NOT CREATED | Env vars in Vercel only; captain deploys via CLI if needed (R-INF-4) |
| Photon Beta org/project, API key, shared-line assignments, webhook destination | Dev 3 | Kickoff spike, ≥ 12:30 (unless Q-1 allows earlier) | NOT CREATED | `PHOTON_*` server-only; API key shown once (R-PH-2); webhook secret shown once (R-PH-6) |
| Demo handles (`DEMO_DONOR_HANDLE`, `DEMO_COURIER_A_HANDLE`, `DEMO_COURIER_B_HANDLE`) | Handle holders → Dev 2 + captain; Dev 3 mirrors them as Photon assignments | DM pre-event; env at kickoff | NOT STARTED | DM only; local env / Vercel env; never in git; `.env.example` leaves them empty; unset means synthetic `@example.invalid` handles for fake mode only (D-024) |
| Google AI Studio key (own, per dev) + a separate demo project key | each; demo key Dev 1 | Kickoff, ≥ 12:30 (unless Q-1 allows earlier) | NOT CREATED | Server-only `GEMINI_API_KEY`; synthetic photos only (R-AI-5) |
| VEYZL GitHub App | Dev 4 | After explicit organizer OK; repo already public | NOT INSTALLED | — |
| MLH Commit form | Dev 3 | Sun, only if entering | NOT STARTED | — |

## 11. Update protocol

- The captain updates this file after each checkpoint and each merge, in a `chore/integration-*` PR. The `BASELINE_SHA` record is a later commit on `main`; lanes do not need it to branch (they use the tag).
- Paste real command output summaries. Mark anything not run as **UNVERIFIED**.
- Record each lane's verified handoff (by link to `docs/handoffs/dev-N.md`) in §9 and §4.
