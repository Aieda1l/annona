# Annona — "Good food finds its way" (DubHacks 2026 codename)

> **Status (2026-10-15): pre-event planning package. There is no application code yet.**
> DubHacks Rule 10 says "no coding or building before 12:30 PM on Saturday; you can ideate beforehand" (`docs/RESEARCH.md` R-DH-3). Everything here is markdown ideation: research, design, contracts-as-spec, and four developer prompts. Code begins at the kickoff baseline, at or after **Sat Oct 17, 12:30 PM PDT** (`docs/plans/active/kickoff-baseline.md`).

## What Annona is

Annona is a **messaging-native coordination prototype** for last-minute surplus food from licensed kitchens.

1. A donor **texts a food photo** to Annona over iMessage (Photon). Web upload is the fallback.
2. AI drafts an **uncertain, editable** description and replies with it plus a one-time checklist link.
3. The donor verifies ingredients, all nine major allergens and handling facts on that **structured checklist**.
4. A **deterministic, fail-closed gate** decides `eligible` / `needs_review` / `rejected`, with plain-language reasons. If no courier is available, an eligible lot is `unmatched`, which is a dispatch state, not a safety one.
5. An approved recipient's cold-capable courier receives a **time-limited iMessage offer via Photon 2.0**.
6. **Exactly one valid claim wins**, atomically.
7. The operator dashboard shows server truth, including simulated, labeled handoffs.

**AI describes, humans verify, the backend enforces.** "Eligible" means eligible for dispatch under a prototype operator policy. It never means safe, allergen-free or compliant. All data is synthetic.

## Repository map

| Path | What it is | Owner |
|---|---|---|
| `PROJECT_IDEA.md` | Original seed brief (historical; superseded where the docs below differ) | — |
| `docs/KICKOFF.md` | **Read this first.** One page: architecture, statuses, lanes, P0 checklist, checkpoints, first actions | captain |
| `CLAUDE.md` | Operating contract for every Claude Code session | captain |
| `BOOTSTRAP_MASTER.md` | The master planning prompt that produced this package | captain |
| `docs/RESEARCH.md` | Dated evidence ledger (rules, sponsors, Photon, Gemini, infra, WA/King County food donation, competition, tooling) | captain |
| `docs/PRODUCT_BRIEF.md` | Users, pitch, alternatives scored, non-goals, business hypotheses | captain |
| `docs/MVP_SCOPE.md` | P0 acceptance criteria (one owner and one test owner each), release gate, demo scenes | captain |
| `docs/ARCHITECTURE.md` | Stack, trust boundaries, sequences, schema, timers, failure ladder | captain |
| `docs/CONTRACTS.md` | **Shared contracts spec** (enums, payloads, state machine, gate rules, claim semantics, routes) | captain |
| `docs/DECISIONS.md` | Append-only decision log | captain |
| `docs/OWNERSHIP.md` | Four lanes, owned paths, PR/review/merge rules, checkpoints | captain |
| `docs/TEST_PLAN.md` | Test catalog and coverage matrix (planned) | captain |
| `docs/PROMPT_EVAL.md` | AI intake prompt registry, few-shot set, eval cases | Dev 1 |
| `docs/ROADMAP.md`, `docs/BACKLOG.md` | Timeline with owners; deferred ideas | captain |
| `docs/PROJECT_STATE.md` | Captain's live checkpoint (baseline SHA, blockers, evidence) | captain |
| `docs/plans/active/kickoff-baseline.md` | The captain's kickoff plan (about 45 minutes, minimal baseline) | captain |
| `docs/handoffs/`, `docs/requests/` | Per-lane handoffs; contract-change requests | each lane (own files) |
| `prompts/dev-0N-*.md` | The four standalone developer prompts | captain |

## Before Saturday 12:30 PM (each human; ideation-safe)

1. **Update Claude Code** to v2.1.284 or later and sign in with **your own Claude Pro account**: run `claude update`, then `claude --version`. In a session, run `/status`.
2. **Unset `ANTHROPIC_API_KEY`.** If it is set, Claude Code bills the API instead of your subscription (R-TOOL-5). Annona needs no Anthropic key.
3. **ECC comes with the repo (D-030).** The committed `.claude/settings.json` registers the official `affaan-m/ECC` marketplace, enables `ecc@ecc`, and sets `ECC_HOOK_PROFILE=minimal`. After you clone, run `claude` in the repo and **accept the workspace trust dialog**. ECC loads at the start of that session or the next one; nothing else needs installing. Verify with `claude plugin list` (it must show `ecc@ecc`, enabled). Requires `git` on your PATH.
   - Already installed ECC at user scope? Leave it; it's the same plugin.
   - **Don't** run `/plugin install` or `uninstall` with `--scope project`, or ECC's setup with project scope. All of them rewrite the shared file. Personal overrides (e.g. a different hook profile) go in the gitignored `.claude/settings.local.json`.
   - If `/plugin` shows `ecc@ecc` as enabled but not installed, run `claude plugin install ecc@ecc --scope local` once.

4. **Optionally install Superpowers** at user scope:

   ```text
   /plugin install superpowers@claude-plugins-official
   ```

   With both plugins installed, use **one workflow per phase** (`docs/ARCHITECTURE.md` §14).

5. **Read `docs/KICKOFF.md` (about 10 minutes), then your own prompt in `prompts/`.** Everything else is reference: open the section your current task needs.
6. **Team logistics:**
   - Decide who is Dev 1–4. Dev 4 is the integration captain.
   - Confirm **three distinct iMessage handles**: the donor phone and couriers A and B (a Mac signed in to Messages can stand in for one). Each must text **JOIN** before Annona can message it (R-PH-4, R-PH-5).
   - Every member needs a Devpost account and a Discord handle (required on the Saturday draft, R-DH-4) and must meet eligibility (18+, college student; R-DH-11).
   - Ask organizers in `#ask-dh`: (a) may pre-event planning docs live in the submission repo? (b) may sponsor accounts (Photon Beta, Gemini key, Supabase, VEYZL) be created before 12:30 PM? Until they answer, do both at or after 12:30 PM.

## Five-minute launch at kickoff (at or after Sat Oct 17, 12:30 PM PDT)

**Captain (Dev 4), about 45 minutes (CP0a 1:15 PM; lanes branch by CP0b 1:30 PM):** in your own Claude Code session, open `docs/plans/active/kickoff-baseline.md` and execute it. The output is:

- a **public** GitHub repo (D-023);
- a passing smoke check;
- a commit tagged **`baseline`**.

Post `BASELINE_SHA` (`git rev-parse 'baseline^{commit}'`), the contracts version from the `docs/CONTRACTS.md` header and the repo URL in the team chat, and record the SHA in `docs/PROJECT_STATE.md`. Share secrets (e.g. `DATABASE_URL`, `DEMO_DONOR_HANDLE`, `DEMO_COURIER_*_HANDLE`) only through a private channel, never in git.

**Meanwhile (12:30–1:15), outside the repo:** Dev 1 and Dev 3 run the provider spikes, including **SP-14**: the donor phone texts a photo through Photon and Dev 1 sends the downloaded bytes to Gemini. Post the go/no-go in chat. If it fails, everyone builds the web-upload path first.

**Each developer, 5 minutes once the tag is posted.** Lanes branch from the **`baseline` tag**. Prompts are not edited; just confirm the SHA matches.

```bash
# Option A: your own clone
git clone <repo-url> annona-<lane> && cd annona-<lane>
git fetch --tags origin && git switch -c feat/<lane> baseline       # intake | dispatch | messaging | dashboard
# Option B: a worktree from an existing clone (same machine, separate folder)
#   git fetch --tags origin && git worktree add ../annona-<lane> -b feat/<lane> baseline && cd ../annona-<lane>

git rev-parse 'baseline^{commit}'                            # must equal the BASELINE_SHA the captain posted
pnpm install
cp .env.example .env.local                                   # leave provider keys empty unless you own them; fakes are the default
cat package.json                                             # confirm the scripts exist before running them
pnpm typecheck && pnpm test                                  # should pass on the baseline
claude                                                       # accept workspace trust → /status → /model sonnet → /effort medium
```

Then paste **only your own prompt** (everything below its horizontal rule). `BASELINE_SHA` in the prompt means the commit the `baseline` tag points to:

| Lane | Branch | Prompt | Owns |
|---|---|---|---|
| Dev 1 — Vision + donor intake (checklist page, web fallback) | `feat/intake` | `prompts/dev-01-vision-intake.md` | `src/features/intake/**`, `src/lib/ai/**`, `tests/intake/**`, `fixtures/intake/**`, `docs/PROMPT_EVAL.md` |
| Dev 2 — Safety gate + matching + state + DB | `feat/dispatch` | `prompts/dev-02-safety-dispatch.md` | `src/core/**`, `src/db/**`, `tests/core/**` |
| Dev 3 — Photon messaging (offers + donor photos) + timed workflows | `feat/messaging` | `prompts/dev-03-photon-workflows.md` | `src/integrations/photon/**`, `src/workflows/**`, `tests/messaging/**` |
| Dev 4 — UI + deployment + integration captain | `feat/dashboard` | `prompts/dev-04-dashboard-integration.md` | `src/app/**`, `src/components/**`, `src/styles/**`, `public/**`, `tests/ui/**`, deployment files, `docs/demo/**`, `docs/submission/**` (+ captain shared surfaces) |

## Non-negotiables (short form of `CLAUDE.md`)

- **Lanes and code ownership:**
  - Four humans, four sessions, four clones or worktrees, four branches, one baseline commit.
  - Never edit another lane's paths. File a request in `docs/requests/` instead.
  - Shared contracts change only through the captain.
- **Safety and evidence:**
  - A photo or LLM never establishes safety or allergen absence. Unknown never becomes eligible. No "dispatch anyway".
  - Never present fake results as real. A simulated-phone message is not Photon, and a fake draft is not Gemini. Unrun tests are **UNVERIFIED**.
  - Never call claims race-safe until T-CO-17 has passed on real Postgres (D-033).
- **Data and contact:** Synthetic data only. Message only opted-in teammates. No secrets in git. No spending without human approval.

## Deadlines (`docs/RESEARCH.md` R-DH-1..5)

| When (PDT) | What |
|---|---|
| Sat 12:30 PM | Hacking begins. Kickoff baseline (CP0a 1:15 PM, CP0b 1:30 PM). |
| Sat 9:30 PM internal / **10:30 PM hard** | Devpost draft: overview, **all contributors + Discord handles**, declared tracks. No draft means no judging. |
| Sun 7:30 AM | Feature freeze; record the video (≤ 3:00) |
| Sun 9:30 AM internal / **10:00 AM hard** | Final Devpost submission, including the video and the public repo link |
| Sun 10:20 AM | Whole team at the HUB Ballroom (judging workshop at 10:30) |

Tracks (`docs/DECISIONS.md` D-001):

- **Title:** Community Kitchen.
- **Sponsored:** Photon, VEYZL, SideShift. Each is claimed only with real evidence.
- **Non-sponsored:** MLH Best Use of Gemini API, DubHacks NEXT. MLH Commit Fellowship is optional.

## How this package was produced (transparency)

These planning documents were created **before** the event as ideation: research, design and prompts, with no product code. They were made by one teammate's Claude Code session (master bootstrap), using:

- Superpowers brainstorming, bounded per the bootstrap's rules.
- A research workflow: 8 researchers plus 8 adversarial fact-checkers against official sources, accessed 2026-10-15.
- A drafting and cross-document review workflow.

AI-assisted development is used throughout and will be disclosed in the Devpost "How we built it" section. Official references are listed in `docs/RESEARCH.md`.

## Kickoff baseline

The planning documents and prompts in this repository were written **before the event as ideation** (Rule 10, R-DH-3) and committed at kickoff. **All code was written during the event, after hacking began** (Saturday, October 17, 2026; see `CLAUDE.md` for the start-time note). The scaffold came from `create-next-app@16.4.2`; shadcn/ui is added after the baseline. AI-assisted development (Claude Code) is disclosed. The repository is public from kickoff, and every profile and donation in it is synthetic.
