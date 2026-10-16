# CLAUDE.md — Annona | DubHacks 2026 | Four-Developer Operating Contract

## Authority and purpose

This is the Claude Code project contract for **Annona**, a safety-aware surplus-food coordination prototype built by four humans with separate Claude Pro accounts. Read it as operational policy, not as evidence that a feature exists. Do not import `AGENTS.md`; it may contain unrelated Codex-specific routing. The **code and tests** establish implemented behavior; `docs/` records agreed intent and decisions; this file governs Claude behavior.

**Mission:** In the October 17–18, 2026 DubHacks build window, ship one demonstrable flow: an approved donor shares a surplus-food photo, AI drafts food metadata, a human confirms it and relevant handling facts, a deterministic safety/eligibility gate permits or blocks the listing, an eligible recipient/courier is offered a time-limited pickup by messaging, and an atomic claim updates the operator dashboard. Unanswered or stale offers are handled correctly. **A photo or LLM output never establishes food safety or allergen freedom.**

## Initial context and authority

Read root `PROJECT_IDEA.md` when starting master research, brainstorming, designing a new capability, or resolving intent questions. It is the **original seed brief**, preserving the team's discussion and proposals; it does **not** override subsequently approved `docs/PRODUCT_BRIEF.md`, `docs/MVP_SCOPE.md`, `docs/CONTRACTS.md`, safety constraints in this file, or implemented code/tests. After initial design approval, follow the narrower task-specific docs rather than rereading the full idea for every small change.

## Event and judging constraints

- Title track: **Community Kitchen** (exactly one title track). Provisional sponsored tracks: **Photon**, **VEYZL**, **SideShift** (maximum three); replace only on deliberate team decision. Relevant non-sponsored tracks: Gemini API, DubHacks NEXT, and Commit Fellowship if criteria are met.
- Source of truth for final event times: organizer announcements / Devpost. **Conservative internal submission target: Sunday Oct 18, 2026, 9:30 AM PDT**; supplied hacker guide says hard deadline **10:00 AM**, despite Devpost schedule ending 10:30 AM. Required Devpost **draft by Sat Oct 17, 10:30 PM**; team/contributor/Discord/track data must be entered. An actual demo video is mandatory per provided guide.
- **Competition rule:** Submitted software must be started and completed during the event. Before hacking begins Saturday Oct 17 at 12:30 PM PDT, do only clearly permitted preparation (research, prompts, architecture discussions); confirm organizer rules before committing any source code or project implementation. Do not backdate work or claim pre-event implementation as event work.
- Prioritize functionality (30%), track applicability (30%), creativity (20%), design (20%). Demo reliability beats extra integrations.

## Runtime, subscription, and tool usage

- Each human uses **their own authenticated Claude Code session and Claude Pro account**. Pro has shared Claude/Claude Code five-hour and weekly usage limits. Check `/status`; avoid deep nested agent trees and redundant broad-context review cycles. No assumption of infinite Opus access or API credits.
- Use an available model selected with `/model`. Default to **`sonnet` or account default for bounded implementation**; use **`opus` only when available and worthwhile** for architecture or intricate debugging. Confirm locally; never hardcode a model identifier inaccessible to a teammate. A model name is not a quality guarantee.
- Effort: prefer `medium` for routine code, `high` for tricky logic, `xhigh` for a genuinely consequential design/security decision **if supported**. **Ultracode**, if the local Claude Code supports it, is an orchestration mode, not a model. Activate selectively; do not assume it is available for everyone. Do not force all four humans into expensive autonomous swarms.
- **ECC** is the primary collection of engineering capabilities. Install from the *official* `affaan-m/ECC` source using one supported installation method per human. Verify `ecc@ecc` appears in `/plugin list`. The installer is not run by reading this file.
- **Superpowers is optional and complementary**: when installed, prefer its brainstorming, planning, TDD, systematic debugging, and verification skills on complex tasks. **One workflow per phase:** do not independently rerun duplicate ECC + Superpowers brainstorm/planning/review pipelines. Choose whichever relevant skill is installed and invoke only where it improves outcomes.
- Do not invent ECC command/agent names, `ultracode` settings, agent definitions, or custom skills. Inspect installed plugin/skill catalogs before invoking. If a custom agent uses `omitClaudeMd: true`, its delegated prompt must restate task-relevant safety and ownership rules. Do not override plugin-managed hooks or globally modify a teammate's settings without consent.
- `.claude/settings.json` in this starter disables Claude Code *auto memory* for this project so agreed facts remain in versioned `docs/`; it does **not** disable ECC's hooks or agent abilities. Keep credentials in local ignored `.env` files / secure provider stores.

## Four humans, four isolated branches

One teammate is the **integration captain** (normally Dev 4), but they are also a developer, not a fifth resource. The organizer/master bootstrap owner prepares an initial, **committed and pushed** shared baseline first, including contracts and the four role prompts. Only then launch all four individual Claude Code sessions, one per human, from that **same commit**.

| Human | Lane | Exclusive code ownership (unless a contract-approved PR changes it) |
|---|---|---|
| Dev 1 | Vision + donor intake | `src/features/intake/**`, `src/lib/ai/**`, `tests/intake/**`, intake-specific prompts |
| Dev 2 | Safety + matching + state | `src/core/**`, `src/db/**`, `supabase/migrations/**`, `tests/core/**` |
| Dev 3 | Photon messaging + scheduled offers | `src/integrations/photon/**`, `src/workflows/**`, `tests/messaging/**` |
| Dev 4 | Dashboard + deployment + integration | `src/app/**`, `src/components/**`, `src/styles/**`, `tests/ui/**`, deployment files |

- `src/contracts/**`, top-level `package.json`, `.claude/**`, shared configs, and `docs/ARCHITECTURE.md` are **integration-captain-controlled shared surfaces**, introduced on baseline and changed only through an explicit contract-change request. If the master chooses a different framework or repository layout, the **generated four role prompts and `docs/OWNERSHIP.md` override these illustrative paths** after team approval.
- Each teammate clones independently or uses a separate `git worktree`, **never four independent Claude sessions modifying the same working tree**. Branches: `feat/intake`, `feat/dispatch`, `feat/messaging`, `feat/dashboard` (or master-documented equivalent). Never commit secrets, `.env`, service credentials, or real recipient/volunteer data.
- Each lane may propose interface changes via `docs/requests/<lane>-<topic>.md` in its own branch; only integration captain approves contract changes and communicates them to the others. Shared docs updates flow through captain. Keep lane status in `docs/handoffs/dev-N.md` or PR descriptions rather than racing on `docs/PROJECT_STATE.md`.
- Merge **small PRs** into `main` with task-focused tests and a handoff message; synchronize/rebase after interfaces change. Never overwrite another lane's edits, use `--force` on shared main, or bypass review because integration is inconvenient.

## Durable shared context and startup protocol

Shared docs are deliberate, versioned and concise:

- `docs/PRODUCT_BRIEF.md` — user and value proposition; `docs/MVP_SCOPE.md` — in/out and acceptance criteria.
- `docs/RESEARCH.md` — sourced findings, last-checked dates, facts vs hypotheses.
- `docs/ARCHITECTURE.md` — approved boundaries, implemented behavior distinguished from proposed behavior.
- `docs/CONTRACTS.md` + `src/contracts/**` — API types, events, statuses and error formats.
- `docs/OWNERSHIP.md` — four lanes, paths, PR rules; `docs/DECISIONS.md` — append-only choices/tradeoffs.
- `docs/TEST_PLAN.md` — cases and real commands; `docs/PROMPT_EVAL.md` — few-shot datasets, prompt version/metrics.
- `docs/ROADMAP.md` / `docs/BACKLOG.md` — current steps / deferred ideas.
- `docs/PROJECT_STATE.md` — captain-owned checkpoint: last known passing build, integration blockers, next actions.
- `docs/plans/active/` and `docs/plans/completed/` — minimal executable plans; `docs/handoffs/` — per-lane verified handoffs.

At session start: (1) `git status` and current branch; (2) read this contract, `docs/PROJECT_STATE.md`, `docs/MVP_SCOPE.md`, `docs/OWNERSHIP.md`, `docs/CONTRACTS.md`, and your own role prompt; (3) inspect actual build/test commands, dependencies and reachable credentials, never fabricate; (4) locate only task-relevant code; (5) state one measurable outcome and next action, then execute without routine permission-seeking. If documentation disagrees with code, report that gap and repair via the owning lane.

## Safety boundaries (non-negotiable)

1. **AI describes, humans verify, backend enforces.** Vision output is an editable *hypothesis*, never a source of verified ingredients, allergen absence, temperatures, regulatory compliance, pickup cutoff or food safety.
2. Explicit data states distinguish `suggested`, `donor_verified`, `unknown`, `rejected`, and `needs_review`. Unknown allergens/handling never silently default to absent/safe. Include the US nine major allergens in the donor-review UX; don't claim images detect hidden ingredients or cross-contact.
3. For MVP, onboarded, **synthetic** donor/recipient/courier profiles only; authorized commercial food sources and compatible receiving organizations. If the group chooses perishable prepared food, require explicit operator-approved storage/temperature history and handling prerequisites. Never use an AI-generated universal shelf-life countdown.
4. Safety and donor cutoff are separate concepts. Reject stale or ineligible claims. If temperature history, suitability, recipient acceptance, courier capability or cutoff is unclear, **fail closed and surface review**, not autonomous dispatch.
5. Donor, recipient, courier, and operator roles must be explicitly authorized. Minimize contact and location disclosure; don't send personal details to unmatched recipients. Use fake data for live demos unless all parties are opted in and operations are approved.
6. Offers require idempotent incoming events and **transactional first-claim-wins**. A delayed job or repeated SMS must not create a second assignment. Re-evaluate eligibility and time at acceptance/handoff.
7. Never publicly represent this weekend prototype as legally certified or production food-safety compliance. Seek actual local food-safety and recipient-partner review before any real deployments.

## Workflow — consistent for all four

**Understand → scope → plan → test → implement → independent review → verify → handoff.** Use ECC capabilities or Superpowers when useful, not as duplicate rituals.

1. **Understand:** Read the task's signed-off contracts, relevant code and facts. For a new feature, quickly clarify operational invariants and the *smallest testable* behavior. Ask a human only for consequential ambiguity, credentials, real-world safety, cost or destructive action.
2. **Plan proportionally:** For a nontrivial task, write a short plan with exact paths, expected outputs, tests and dependencies to a lane-owned file. Do not spend the hackathon in planning loops. Prefer reversible changes and YAGNI.
3. **RED/GREEN/REFACTOR:** For safety, matching, timers, parsing and concurrency write focused tests first when practical; for UI run component/smoke checks. Implement within owned files only.
4. **Review:** Have a fresh-context reviewer or a *different human* inspect the diff for (a) spec/contract conformance and (b) edge cases, concurrency, security and maintainability. Reviewer does not approve their own implementation. At minimum, review critical flows across lanes before merge.
5. **Verify:** Run the exact available tests, lint, typecheck/build and relevant end-to-end scenario. Record command, exit status and factual result. Mark unavailable external tests as **UNVERIFIED** with a deterministic mock fallback.
6. **Handoff:** Commit/push only verified bounded code on your lane branch; open PR or hand integration captain commit SHA plus changed files, interface changes, passing checks, demo steps and blockers. Captain updates the shared `PROJECT_STATE.md` after integration.

**No false claims.** Do not report an API as working without a successful real call; do not call a mocked phone screenshot real Photon integration; do not mark tests passing if not run. Don't modify working paths owned by another developer just to silence an error: open a coordination request.

## Engineering constraints and fallback ladder

- Choose one coherent stack; recommended starting point to evaluate: TypeScript + Next.js + a Postgres-backed store + Gemini for vision suggestions + Photon 2.0 for messaging. Evaluate durable timers vs an ordinary persisted deadline/worker based on the deadline and actual provider behavior. Minimal infrastructure wins.
- Every external provider gets an adapter with `real` and deterministic `fake` implementations. Never hide failures behind silent mocks; UI and logs must expose whether demo mode is active.
- Time-sensitive workflow depends on **persisted UTC timestamps and server-side checks**, not client-side countdown timers alone. UI may display a countdown but has no authority to dispatch.
- Never block all four lanes on one provider: show mock-compatible integrated behavior while someone works on credentials. Keep a real Photon claim and a real AI image call as target demo evidence.
- Use feature flags only when needed for explicit fake-provider selection. No automatic billing, unsafe account changes, production outreach, live donor contact or real food dispatch from agent sessions without prior human approval.
- Sponsor claims must be honest: Photon requires genuine Photon 2.0 usage; VEYZL needs an actual audit connected to a PR **and evidence the finding changed code**; Gemini prize requires actual Gemini API; do not list a sponsor merely for installing a package.
- Per-principle gate for abstractions/services: which MVP acceptance criterion requires it, what is simpler, what fails without it? Put anything speculative in `docs/BACKLOG.md`.

## MVP release gate and completion format

The demo passes only if a reviewer can execute: (1) photo → uncertain structured draft, (2) human verification, (3) a *known-safe-for-demo* scenario that passes deterministic policy, (4) eligible recipient/courier selection, (5) time-bound Photon message or explicitly labeled fake mode, (6) first valid claim wins, (7) timeout or stale claim loses, (8) operator dashboard reflects server truth, and (9) unsafe/unknown inputs are blocked. For live transport/delivery in judging, simulated handoff states must be labeled simulation.

Required edge tests: ambiguous image; unknown allergen; missing holding history; non-approved donor; ineligible recipient; no response; simultaneous claims; duplicate inbound event; late claim; cutoff reached; failed provider delivery; authorization. Record what was *actually* run.

Finish every substantive Claude session with:

```text
LANE / BRANCH / COMMIT:
DELIVERED:
EVIDENCE (commands, passed/failed, real vs mock):
CONTRACT CHANGES OR REQUESTS:
BLOCKERS + SAFETY RISKS:
INTEGRATION STEPS:
NEXT SMALLEST ACTION:
```
