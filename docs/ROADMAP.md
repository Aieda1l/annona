# ROADMAP.md — Annona timeline, owners and checkpoints

> **Status:** PROPOSED, 2026-10-15 (pre-event ideation), revised 2026-10-16 for D-031..D-034 (current contracts: see the `docs/CONTRACTS.md` header). **Nothing is built.** No code, scaffold, build, test run, deployment or provider call exists.
> **Times** are Pacific (PDT). **Owners** are lanes. Humans (assigned 2026-10-17): Dev 1 Colin, Dev 2 Rui, Dev 3 Ronnie, Dev 4 Cyrus (`docs/PROJECT_STATE.md` §6).
> **Checkpoints** CP0a/CP0b–CP6 are copied from `docs/OWNERSHIP.md` §8. If the two files ever differ, OWNERSHIP wins and the captain fixes this file.
> **Labels:** VERIFIED SOURCE (R-*), DESIGN DECISION (D-*), ASSUMPTION, OPEN RISK. "Eligible" means eligible for dispatch under the prototype operator policy, based on donor-attested records. It never means safe or compliant.

## 1. Fixed times

| When (PDT) | What | Label |
|---|---|---|
| Thu Oct 15 → Sat Oct 17, 12:30 PM | **Ideation only.** Markdown research, design, contracts-as-spec and prompts. No code, scaffolds, package manifests, migrations, or commits to the submission repo. | VERIFIED SOURCE R-DH-3; DESIGN DECISION D-002 |
| Sat 12:30 PM | Hacking begins. This is the earliest moment for any code or commit. | VERIFIED SOURCE R-DH-1 |
| Sat 10:30 PM | **Hard deadline for the Devpost draft:** overview, all members as contributors with Discord handles, and declared tracks. **No draft means no judging.** | VERIFIED SOURCE R-DH-4 |
| Sat ~11:00 PM | There is no overnight space at the HUB. Gates Center CSE G01 opens at 11:00 PM, and sleeping there is not permitted. | VERIFIED SOURCE R-DH-13 |
| Sun 10:00 AM | **Hard deadline for the final submission.** The Devpost platform shows 10:30 AM; do not use that time. | VERIFIED SOURCE R-DH-2; DESIGN DECISION D-003 |
| Sun 10:20 AM | Whole team at the HUB Ballroom. The judging workshop is at 10:30 AM, then three 50-minute rounds; each team gets one randomly assigned round, and side-track judges may visit at any time. | VERIFIED SOURCE R-DH-9 |
| Build window | Sat 12:30 PM → Sun 10:00 AM = **21.5 build hours** | Derived |

## 2. Owners

| Lane | Human | Roadmap duties beyond lane code |
|---|---|---|
| Dev 1 — Vision + donor intake (`feat/intake`) | Colin | **Video script author** (≤ 3:00): writes the text and hands it over in `docs/handoffs/dev-1.md`. Author of the VEYZL evidence PR (Gemini adapter, D-022). Shows AI intake to judges. |
| Dev 2 — Gate + matching + state + DB (`feat/dispatch`) | Rui | **Backup final submitter.** Checks the Sun 9:00 AM full-history secret scan. Answers judges' safety and concurrency questions. |
| Dev 3 — Photon messaging + timed workflows (`feat/messaging`) | Ronnie | Runs the courier iPhones and **stays at the table for all three judging rounds**. Contract-change reviewer 4:00–6:30 PM Sat (D-027). Owns the **MLH Commit form, only if entering** (D-001). |
| Dev 4 — UI + deployment + integration captain (`feat/dashboard`, `chore/integration-*`) | Cyrus (organizer) | Runs the kickoff baseline and the checkpoints. Creates the **public** repo at kickoff (D-023). **Owns the Devpost draft and final submission.** Commits the video script to `docs/demo/` and **records the video.** Drives the dashboard for judges. |

Contract-change requests from any lane: `docs/requests/<lane-slug>-<topic>.md`, with slugs `intake`, `dispatch`, `messaging`, `dashboard` (e.g. `docs/requests/dashboard-simulated-phone.md`; OWNERSHIP §4).

## 3. Pre-event checklist (Thu Oct 15 – Sat 12:30 PM; ideation-safe)

| # | Item | Owner | By | Done when | Source |
|---|---|---|---|---|---|
| P-00 | Share a **read-only copy** of the markdown package (OneDrive view link or a zip; **not** a git repo; no code) so teammates can do the reading before Saturday. | organizer / Dev 4 | Thu night | **Done** 2026-10-16 | D-002 |
| P-01 | Run `claude update`. `claude --version` must show **≥ v2.1.284**. | each | Fri | Version posted in team chat | R-TOOL-7 |
| P-02 | Sign in with **your own Pro account**. Run `/status` and note the remaining 5-hour and weekly usage. | each | Fri | Posted in chat | R-TOOL-6 |
| P-02b | **Quota rule:** anyone below about 50% of weekly Claude usage does not take the captain or the Dev 2 lane. The organizer stops non-essential Claude use until kickoff. | team; organizer | Fri | Lane assignment respects it | R-TOOL-6 |
| P-03 | Confirm **no `ANTHROPIC_API_KEY`** in any shell: Git Bash `echo "${ANTHROPIC_API_KEY:-unset}"`, PowerShell `$env:ANTHROPIC_API_KEY`. | each | Fri | Prints `unset` / empty | R-TOOL-5 |
| P-04 | ECC arrives via the committed `.claude/settings.json` (D-030): open the repo in `claude`, accept the trust dialog, then `claude plugin list` must show `ecc@ecc` enabled (hook profile `minimal` comes from the committed `env`). No separate install; never install at project scope by command. Never run a project-scope install or uninstall command; both rewrite the shared file. Organizer: lower the opus/xhigh user override. | each | Fri | Plugin list line posted | R-TOOL-1, R-TOOL-2, R-TOOL-3, R-TOOL-10; D-014 |
| P-05 | Optional: Superpowers at user scope, official marketplace only. | each | Fri | — | R-TOOL-4 |
| P-06 | Plan to start each session with `/model sonnet` and `/effort medium`. On Pro, `default` resolves to Opus. | each | Sat | — | R-TOOL-7; D-014 |
| P-07 | Install Node 22 LTS, pnpm 10, git and gh. Captain: `gh auth status` succeeds. | each | Fri | Versions posted | ARCHITECTURE §3 |
| P-08 | Create a Devpost account and send your Discord handle to Dev 4. | each | Fri | Dev 4 holds 4 accounts + 4 handles | R-DH-4 |
| P-09 | Confirm eligibility: 18+ and a college student. | each | Thu | Confirmed in chat | R-DH-11 |
| P-10 | Assign Dev 1–4. Confirm **three distinct iMessage handles**: the donor phone (D-031) and couriers A and B. A Mac signed in to Messages can stand in for one. Handles go **by DM to Dev 2, Dev 3 and the captain only** (never git or group chat); Dev 3 needs them to create matching Photon assignments at kickoff. | team | Fri | Names in `PROJECT_STATE.md` §6 | R-PH-5; D-011; D-024; D-031 |
| P-11 | Ask in `#ask-dh`: (a) may pre-event planning docs be committed to the submission repo? (b) may sponsor accounts (Photon Beta, AI Studio, Supabase, Vercel, VEYZL) be created before 12:30 PM? **Until answered:** do both at or after 12:30. **Never block the baseline on the reply** (kickoff plan §0 defaults); VEYZL waits for an explicit OK. | Dev 4 | Fri | **(a) yes, commit now (D-035); (b) unanswered**, default stands. Recorded in `PROJECT_STATE.md` §6 | R-DH-3; D-002; D-035 |
| P-12 | Read Devpost rules and dates in a real browser. Note any video-length cap, required fields or IP terms. | Dev 4 | Fri | Notes for `docs/RESEARCH.md` | R-DH-5, R-DH-12 |
| P-13 | Read `docs/KICKOFF.md` (about 10 min), then your own prompt. Other docs are reference: open the section your task needs. | each | Sat AM | — | README; D-034 |
| P-14 | Review D-001..D-035 (PROPOSED; KICKOFF.md lists the ones that matter at the keyboard). Raise objections before kickoff. | each | Sat 12:30 | Objections in chat | DECISIONS |
| P-15 | Plan synthetic photos to be **taken at the event**: no faces, brands, labels or addresses. Use synthetic photos only. | Dev 1 | Sat | Shot list in chat | R-AI-5; D-012 |
| P-16 | Plan a phone hotspot as the venue Wi-Fi fallback. | Dev 4 | Sat | — | ARCHITECTURE §13 |

## 4. Saturday timeline

| Time (PDT) | Dev 1 | Dev 2 | Dev 3 | Dev 4 (captain) | Checkpoint |
|---|---|---|---|---|---|
| ≤ 12:30 | Check in per the organizer schedule (times UNVERIFIED here). No code. | same | same | Confirm the `#ask-dh` answers | — |
| 12:30–1:15 **Kickoff** | Create your AI Studio key. Spike one real Gemini call **outside the repo** (SP-4, ≤ 15 min); then **SP-14** with Dev 3: send the photo bytes Dev 3 downloads (HEIC or JPEG) to Gemini. From ~12:50 read `docs/KICKOFF.md` and plan; no repo code before branching. | Prepare the must-run T-CO case list (TEST_PLAN §5.0) in prose from CONTRACTS §4–§8. Read and plan. | Photon Beta spike outside the repo (SP-1..SP-3, 20–30 min): org/project, key, assignments for the three phones, JOIN in, reply out. Then **SP-14** (≤ 15 min): donor phone texts a photo; download it; record MIME, size, retries. | Execute `docs/plans/active/kickoff-baseline.md` (minimal baseline, D-034) | **CP0a 1:15 PM** (tag pushed, smoke passed, `BASELINE_SHA` + contracts version posted; SP-14 result posted) |
| 1:15–1:30 | `git fetch --tags origin && git switch -c feat/intake baseline`. Check the SHA, paste your prompt, record the spikes in `docs/handoffs/dev-1.md`. | Branch `feat/dispatch` from the tag + prompt | Branch `feat/messaging` + prompt. Record the spikes in `dev-3.md`. | Own worktree on `feat/dashboard`. Then shadcn UI kit (`chore/integration-ui-kit`), Supabase project, Vercel link, **Devpost shell by ~2:00 PM** (§6). | **CP0b 1:30 PM** (all four on branches; install/typecheck/test/build pass) |
| 1:30–4:00 **Slice 1** (fakes, no network) | Fake VisionProvider; strict `VisionModelOutput` parse, then adapter-stamped provenance; `parseVerifiedFacts`; `edited_from_ai` per CONTRACTS §3.2; intake service with `deps` (both `web_upload` and `messaging` sources). Tests: T-IN-01..T-IN-04, T-IN-06..T-IN-09, T-IN-11 | Pure gate (G-01..G-13), `findCandidates` (M-01..M-10), transitions S-01..S-18 (incl. `unmatched`), `createTestClock`. Tests: T-CO-01..T-CO-15. **Plus the early PR: Drizzle schema (incl. `source_ref`, `collected_at`, `verification_links`) + migrations + deterministic seed (`DEMO_ACTORS` UUIDs, donor identity) + PGlite store, by CP1.** | Grammar (incl. `photo`), `normalizePhotonEvent` (incl. attachments), fake gateway, `handleInbound` with `deps`, `formatOfferMessage(view)`, `formatDraftReadyMessage(view)`. Tests: T-MS-01..T-MS-05, T-MS-14, T-MS-15. Start T-MS-06..T-MS-11 and T-MS-18 RED. | Dashboard on typed fixtures (incl. the neutral `unmatched` group), profile picker on `DEMO_ACTORS` + the working session, layout, mode banner (incl. `misconfigured`). Tests: T-UI-01..T-UI-05. Captain: `chore/integration-contracts-2` by 2:30 PM. | **CP1 4:00 PM** |
| 4:00–5:15 **Core sub-PRs** (OWNERSHIP §7.3, D-027) | Wire the draft and verification handlers as soon as 2(a) merges. `PhotoUpload`, `DraftReview`, `VerificationForm` (web fallback first); T-IN-12. | **2(a)** intake-facing by ~5:00; **2(b)** dispatch/claim/messaging-facing (incl. STOP S-15/S-17, `unmatched`) by 5:15 | T-MS-06..T-MS-11 RED. Wire `tick`, `dispatchDonation`, `handleInbound` as soon as 2(b) merges. Simulated-phone handlers: `{ identity_id, text, fixture_id? }`, 403 unless `MESSAGING_PROVIDER=fake`. **Contract reviewer until 6:30.** | Pages on the lane handlers (`/donor/new` first); `/operator/phone` shell | **CP1.5 5:15 PM** (2(a) + 2(b) merged) |
| 5:15–6:30 **Integration** | Handlers + `PhotoUpload` / `DraftReview` / `VerificationForm` merged by CP2. Then `LinkVerification` + `/api/verify/*` handlers against a core double; T-IN-13. | **2(c)** read models + `getSystemStatus` by 6:15 | T-MS-06..T-MS-11 green; T-MS-16. `photo` command against doubles (T-MS-18), **only if SP-14 passed**. | Wire the dashboard as soon as 2(c) merges; captain PR adds `getSystemStatus()` to health; demo controls (reset, Run tick now, Dispatch now). Run T-E2E-06, T-E2E-02, T-E2E-03 on main. | **CP2 6:30 PM** (scenes 1–3 in fake mode; scene 1 via the web fallback at minimum) |
| 6:30–9:00 **Messaging intake + persistence + real providers** | Wire the link page to 2(d). Gemini adapter (**the VEYZL evidence PR**, D-022), prompt v1, eval T-PE-01..T-PE-08, T-IN-10 | **2(d)** verification links by ~7:00 (T-CO-30, T-CO-31). Switch the demo to Supabase (`STORE=postgres`, same migrations + seed). **T-CO-17 (required)** and the Postgres half of T-CO-23 on `TEST_DATABASE_URL`. T-CO-16..T-CO-31 complete. | Wire `photo` to 2(d); T-MS-18 green. Real Photon gateway, inbound route (webhook or relay worker with the `.data/photon-cursor` checkpoint), worker, T-MS-12. **Attempt T-MS-13 and T-MS-19.** | `/v` page (T-UI-07); run T-E2E-01 (scene 1 by message, fake). Deploy (D-017 ladder; `APP_BASE_URL` must open on the donor phone), T-E2E-05, check Vercel usage, draft `docs/demo/DEMO_SCRIPT.md` | **CP3 9:00 PM** |
| 9:00–9:30 **Devpost draft** | Video script v1 text (≤ 3:00) in `docs/handoffs/dev-1.md` | Review the draft's safety wording | Review the draft's Photon claims | Submit the draft (tracks per §6 rule) | **CP4 target 9:30 PM** (latest acceptable 10:15 PM; hard 10:30 PM) |
| 9:30–11:00 | Bug fixes on owned paths. Fix the VEYZL finding by a follow-up commit on the open evidence PR, before merge. | Bug fixes | Bug fixes | Commit the script to `docs/demo/`. **Backup video recording ~11 PM** (at HUB before 11:00, or first thing in G01). Label any fake modes. | — |
| ~11:00 PM | **Relocate to Gates Center CSE G01.** Carry laptops, demo phones and chargers. Check the worker or tick driver after the move. | | | | R-DH-13 |

## 5. Sunday timeline

| Time (PDT) | Work | Owner | Gate |
|---|---|---|---|
| 11:30 PM–3:00 AM **Hardening** | Edge tests from the MVP_SCOPE §4 map. VEYZL: the evidence PR's finding fixed by a follow-up commit on that PR, before/after captured (D-022). Polish. T-UI-06. | all lanes; VEYZL: Dev 1 + Dev 4 | **Sun 3:00 AM VEYZL go/no-go:** drop (not swap) if there is no actionable finding (D-022) |
| 3:00–7:15 AM **Break rotation** | Keep two humans awake and reachable at all times, and keep the captain plus one reviewer awake for any merge. Sleeping is **not permitted in G01**, so anyone sleeping goes elsewhere and returns by 7:15 AM. Do bug fixes only. Schedule Claude-heavy work so no one hits a Pro 5-hour limit during 7:30–9:30. | all | R-DH-13; R-TOOL-6 |
| **7:30 AM CP5** | **Feature freeze.** Only demo-blocking fixes. | Dev 4 | **CP5 7:30 AM** |
| 7:30–8:30 AM | **Final video recording** (≤ 3:00), using Dev 1's script. Retake once at most. | Dev 4 records; all appear | — |
| 8:00 AM | **Track evidence cutoff.** Drop (do not swap) any track whose evidence is missing (§6). | Dev 4 | D-001 |
| 8:30–9:30 AM | Upload the video (Devpost takes a video **link**: upload unlisted to YouTube; confirm the accepted hosts in the form, SP-10). Fill the final Devpost fields. Verify track checkboxes in the real form (R-SP-9). Submit. | Dev 4; Dev 2 = backup submitter | — |
| 9:00 AM | **Full-history secret scan:** the canonical scan in `docs/ARCHITECTURE.md` §9, run over `git log -p`. `git ls-files` lists only `.env.example`. A hit means **rotate the key immediately**; rewriting history does not un-leak it. | Dev 4 runs; Dev 2 checks | — |
| **9:30 AM CP6** | Final Devpost submission locked | Dev 4 (backup Dev 2) | **CP6 9:30 AM** (hard cap 10:00 AM) |
| 9:30–10:00 AM | Slack only for submission problems. Code stays frozen. | Dev 4 | Hard 10:00 AM |
| 10:00–10:20 AM | Pack up and walk to the **HUB Ballroom. Arrive 10:20 AM.** | all | R-DH-9 |
| 10:30 AM → | Judging workshop, then all three rounds at the table (§7). | all | R-DH-9 |

## 6. Submission deliverables and track evidence

| Deliverable | Owner (backup) | Internal / hard | Content and evidence rule |
|---|---|---|---|
| Devpost project shell | Dev 4 | Sat ~2:00 PM / — | All 4 contributors + Discord handles. Tracks: **Community Kitchen, SideShift, DubHacks NEXT only.** First test in the real form whether a declared track can be removed (R-SP-9). |
| **Devpost draft** | Dev 4 (Dev 2) | **Sat 9:30 PM / 10:30 PM** | Overview; all 4 contributors + Discord handles. Add Photon, MLH Best Use of Gemini API and VEYZL **only if** tracks are removable later or their evidence already exists. MLH Commit Fellowship only if continuing (D-001). |
| **Video** (≤ 3:00) | Script text: Dev 1 (via `docs/handoffs/dev-1.md`). Commit to `docs/demo/` and recording: Dev 4. | Backup **Sat ~11 PM**. Final **Sun 7:30–8:30 AM**. | Recorded presentation; mandatory for **every** team: no video means no judging (R-DH-5). It does **not** replace the live pitch: all our tracks judge in person (R-DH-14). MLH Gemini is judged from Devpost, so show the real Gemini call. Show the mode banner. Never present a simulated phone as Photon. |
| Public repo + secret scans | Dev 4; Dev 2 checks | Public since kickoff; full-history scan Sun 9:00 AM | All code uploaded and linked (R-DH-10). The repo is public from kickoff (D-023). The canonical scan in `docs/ARCHITECTURE.md` §9 runs before every push. A leaked key is rotated immediately. |
| README credits | Dev 4 | Sun 9:00 AM | Libraries, scaffold, AI-tool assistance, and the note that docs/prompts were pre-event ideation (R-DH-3) |
| **Final submission** | Dev 4 (Dev 2) | **Sun 9:30 AM / 10:00 AM** | Video link, repo link, final tracks. Gemini usage stated clearly in the write-up (R-SP-5). |
| MLH Commit form | Dev 3 | Sun 9:30 AM | **Only if entering** (R-SP-7; D-001) |

| Track | Required evidence (claim only if met) | Evidence owner | Decide by |
|---|---|---|---|
| Community Kitchen (title) | Pitch uses the track's words: sustainability, community support, coordination tools (R-DH-7) | Dev 4 | Shell |
| Photon | Real JOIN → offer → YES → claimed round trip with `provider_message_id`s recorded (T-MS-13 / T-E2E-04; R-SP-1) | Dev 3 | Sun 8:00 AM |
| VEYZL | Real audit on the evidence PR (first intake/AI PR after CP2, normally Dev 1's Gemini adapter), **and** a finding fixed by a follow-up commit on that PR before merge (R-SP-3; D-022) | Dev 1 + Dev 4 | Sun 3:00 AM |
| SideShift | Go-to-market and distribution sentence. No integration needed (R-SP-4). | Dev 4 | Shell |
| MLH Gemini API | Real Gemini call recorded with model ID (T-IN-10) | Dev 1 | Sun 8:00 AM |
| DubHacks NEXT | Target user, iteration story, drive to continue (R-SP-6) | Dev 4 | Shell |

**OPEN RISK:** it is unverified whether tracks declared on the Saturday draft can be removed before the final submission (R-SP-9). The ~2 PM shell test answers it. If tracks can't be removed, declare a track only once its evidence exists.

## 7. Judging (≤ 3 min walkthrough, then Q&A; repeat on demand)

**Presence:** the whole team attends all three rounds. Outside the assigned round, at least **Dev 3 (courier iPhones) and one presenter** stay at the table for side-track judges.

**Before each judge:**

- Press "demo reset".
- The donor phone and each courier phone send a **fresh `JOIN`**, because Photon's send-permission window after JOIN is unknown (R-PH-4). Check that the dashboard shows all three `joined`.
- Check that the mode banner is truthful and `last_tick_at` is fresh.
- Keep the backup video ready on a second device.

| Role | Who | Does |
|---|---|---|
| Drives the dashboard, gives the pitch | **Dev 4** | Opening line, mode banner, scenes 1–3 on `/operator`, reset between judges |
| Runs the iMessage phones | **Dev 3** | Courier A/B JOIN, `YES K7M3`, B's `YES H4M9` and A's late reply in scene 2. Uses the labeled simulated phone if Photon is down. |
| Shows AI intake (holds the donor phone) | **Dev 1** | Texts the platter photo, shows the AI-guess reply and opens the link on the phone, then the donor corrections (servings, nine allergens, attestations). Uses web upload if photo intake is down (state it plainly). |
| Answers safety and concurrency questions | **Dev 2** | Fail-closed gate, "eligible ≠ safe", first-claim-wins transaction, dedupe, lazy expiry, post-claim time checks |

Run order: scene 1 success (about 75 s), scene 2 no response / late reply (about 45 s), scene 3 responsible refusal (about 30 s). Scenes are defined in MVP_SCOPE §5.

## 8. Lane milestones

| Lane | By CP1 (4:00 PM) | By CP2 (6:30 PM) | By CP3 (9:00 PM) | ACs |
|---|---|---|---|---|
| Dev 1 | Fake vision, strict `VisionModelOutput` parse + provenance stamp, `parseVerifiedFacts`, `edited_from_ai`, intake service (both sources) | HTTP handlers wired to 2(a); `PhotoUpload`, `DraftReview`, `VerificationForm` (T-IN-12); `LinkVerification` on a double (T-IN-13) | Link page wired to 2(d); Gemini adapter (VEYZL evidence PR), prompt v1, eval runner, T-IN-10 | AC-01, AC-02, AC-03 |
| Dev 2 | Pure gate, matching, transitions S-01..S-18, test clock; **early PR: schema + migrations + seed + PGlite store** | 2(a) by ~5:00, 2(b) by 5:15 (CP1.5), 2(c) by 6:15; claim txn, read models, HTTP handlers | 2(d) links by ~7:00; Supabase switch; **T-CO-17 (required)** and Postgres T-CO-23 on `TEST_DATABASE_URL` | AC-04..AC-09, AC-17 |
| Dev 3 | Grammar (incl. `photo`), normalize, fake gateway, `handleInbound`, offer and draft-ready text | **T-MS-06..T-MS-11 written RED-first and green on 2(b)**; `tick` / `dispatchDonation`; simulated phone (incl. `fixture_id`); T-MS-16 | `photo` wired to 2(d) (T-MS-18); real Photon gateway, inbound route or relay worker, T-MS-12; T-MS-13 and T-MS-19 attempted | AC-10..AC-13, AC-18 |
| Dev 4 | Baseline (CP0a/CP0b); dashboard on fixtures; working session picker | Wired pages, health with `getSystemStatus()`, demo controls, `/operator/phone`; T-E2E-06, T-E2E-02, T-E2E-03 | `/v` page (T-UI-07), T-E2E-01 by message, deployment, T-E2E-05, demo script | AC-14, AC-15, AC-16 |

## 9. Scope-cut ladder (apply top-down when a checkpoint fails)

| Rung | Cut | Consequence |
|---|---|---|
| 1 | All P1 items (MVP_SCOPE §7). None may start before CP2 is green. | None for P0 |
| 1a | **Time trigger:** Dev 2 core not merged by 5:30 PM → Dev 1 and Dev 3 integrate against their local test doubles; CP2 moves to 7:30 PM; P1 frozen. | CP3 work compresses |
| 2 | Optional scene 4 (previously served → `rejected`) | Covered by T-CO-05 |
| 3 | `pg_cron` tick driver | Worker + "Run tick now" remain (D-010) |
| 4 | Donor detail and operator detail polish pages | Dashboard keeps reasons and timeline |
| 5 | VEYZL track | Dropped, not swapped (D-022) |
| 6 | Vercel deployment → D-017 step 2 (`next start` + worker locally against Supabase) | Judge demo runs from the captain's laptop anyway; the donor phone then needs a tunnel URL as `APP_BASE_URL`, or photo intake falls to rung 6a |
| 6a | **Photo intake by message → web upload opens scene 1** (also applied immediately if SP-14 fails; D-031) | Couriers stay on Photon. The pitch says "web and messaging" and never shows a simulated photo as real |
| 7 | Real Photon → labeled simulated phone | **Photon track not claimed** |
| 8 | Real Gemini → labeled fake vision | **Gemini track not claimed** |
| 9 | Supabase → `STORE=pglite` fully local (D-017 step 3) | T-CO-17 still runs against a disposable Postgres (`TEST_DATABASE_URL`) if one is reachable; otherwise it is UNVERIFIED and nobody calls claims race-safe (D-033) |

**Never cut:**

- Truthful labeling: mode banner (incl. `misconfigured`), "Synthetic data", "DEMO: accelerated timers", "Simulated" (AC-15).
- The fail-closed gate G-01..G-13 and scene 3 (release-gate row 9).
- Claim correctness, post-claim time checks and inbound dedupe (CONTRACTS §4, §8).
- The web-upload fallback (D-031): it must stay demonstrable even when photo intake works.
- The Devpost draft, the video and the public repo.

## 10. Checkpoint protocol

- The captain runs each checkpoint in about 5 minutes with all four present.
- Each checkpoint result (pass/fail, real command output, what is real vs fake) goes into `docs/PROJECT_STATE.md` through a captain `chore/integration-*` PR. Lanes report in their handoffs, never by editing that file.
- A failed checkpoint triggers the next rung of §9, chosen by the captain and announced in chat.
- No checkpoint passes on an unrun test. Unrun means **UNVERIFIED**.
