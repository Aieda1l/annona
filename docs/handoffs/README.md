# docs/handoffs/ — per-lane verified handoffs

> **Status:** process doc, written 2026-10-15 (pre-event). No handoff exists yet.

## Purpose

- **One append-only log per lane.** It records what was actually delivered and how it was verified.
- **The captain's input** for `docs/PROJECT_STATE.md` (OWNERSHIP §9). Lanes never edit `PROJECT_STATE.md`.
- **A restart point.** If a human hits a Pro usage limit or goes on break, a teammate can continue from the last entry (ARCHITECTURE §16; R-TOOL-6).
- **The source for the PR body.** Every PR body ends with the same block (OWNERSHIP §6).

## Files

| File | Lane | Created by |
|---|---|---|
| `dev-1.md` | Dev 1 — Vision + donor intake (`feat/intake`) | Dev 1, on the first handoff |
| `dev-2.md` | Dev 2 — Gate + matching + state + DB (`feat/dispatch`) | Dev 2, on the first handoff |
| `dev-3.md` | Dev 3 — Photon messaging + timed workflows (`feat/messaging`) | Dev 3, on the first handoff |
| `dev-4.md` | Dev 4 — UI + deployment + integration captain (`feat/dashboard`) | Dev 4, on the first handoff |

Only the owning lane writes its file, on its own branch. It reaches `main` with that lane's PRs.

**Video script hand-over.** Dev 1 writes the demo-video script text and hands it over in a `dev-1.md` entry. Dev 4 commits it to `docs/demo/` (OWNERSHIP §2). Dev 4 never edits `dev-1.md`.

## When to append

- After each merged slice, or when opening its PR.
- After each provider spike (Gemini call, Photon round trip), even a failed one.
- Before a break, a usage-limit pause, or the end of a session.
- At each checkpoint the lane contributes to (CP1–CP6).

## The block (exact; `CLAUDE.md`, CONTRACTS §14)

Start each entry with a heading `## <YYYY-MM-DD HH:MM PDT> — <slice or topic>`, then:

```text
LANE / BRANCH / COMMIT:
DELIVERED:
EVIDENCE (commands, passed/failed, real vs mock):
CONTRACT CHANGES OR REQUESTS:
BLOCKERS + SAFETY RISKS:
INTEGRATION STEPS:
NEXT SMALLEST ACTION:
```

| Field | Write |
|---|---|
| LANE / BRANCH / COMMIT | `Dev N / feat/<lane> / <full or 7+ char SHA>`, plus the PR link if one exists |
| DELIVERED | Functions, routes and files, and the AC and test IDs covered (e.g. AC-04; T-CO-01..T-CO-11) |
| EVIDENCE | The exact command, its exit code and the real summary line (e.g. the test count). Say whether each provider was **real** or **fake**. Real calls need IDs: Gemini `model`, Photon `provider_message_id`. Anything not run is **UNVERIFIED** with the reason. |
| CONTRACT CHANGES OR REQUESTS | `docs/requests/<file>` paths and their status, or "none" |
| BLOCKERS + SAFETY RISKS | What stops you; any path where unknown could become eligible, any disclosure leak, any race |
| INTEGRATION STEPS | What the captain or other lanes must do: env vars by name only, migrations, rebase order |
| NEXT SMALLEST ACTION | One concrete step and its owner |

## Rules

1. **Append-only.** Never rewrite a past entry. Correct it with a new entry that cites the old heading.
2. **Real output only.** Paste summaries of commands you actually ran. Never write "tests pass" without the command and exit code.
3. **Label every provider result** `real` or `fake`. A simulated-phone message is not Photon, and a fake draft is not Gemini (CLAUDE.md "No false claims").
4. **UNVERIFIED** is required for anything not run: external tests without credentials, T-CO-17 without `TEST_DATABASE_URL`, T-MS-13 before a real round trip.
5. **No secrets, real contact data, or full handles.** Env var names only. Mask handles to the last 4 characters.
6. **Safety wording.** "Eligible" means eligible for dispatch under the prototype policy. Never write safe, allergen-free, compliant or certified.

## Example entry (EXAMPLE ONLY: fictional, not evidence; nothing below has happened)

```text
## 2026-10-17 15:40 PDT — EXAMPLE — slice 1: pure gate
LANE / BRANCH / COMMIT: Dev 2 / feat/dispatch / <sha> (PR <link>)
DELIVERED: evaluateEligibility (G-01..G-13), findCandidates (M-01..M-10), transition guard S-01..S-18, createTestClock. AC-04, AC-05 (partial).
EVIDENCE (commands, passed/failed, real vs mock):
  pnpm test tests/core  -> exit 0, "<n> passed" (T-CO-01..T-CO-15); pure functions, no providers (n/a real/fake)
  pnpm typecheck        -> exit 0
  pnpm lint             -> exit 0
  T-CO-16..T-CO-28      -> UNVERIFIED (store not built yet)
CONTRACT CHANGES OR REQUESTS: docs/requests/dispatch-<topic>.md (open)
BLOCKERS + SAFETY RISKS: none blocking; T-CO-11 confirms single-field unknowns never yield eligible
INTEGRATION STEPS: none (pure code); Dev 1/Dev 3 keep using local test doubles until sub-PRs 2(a)/2(b) merge (D-027)
NEXT SMALLEST ACTION: Dev 2 — early PR: Drizzle schema + migrations + seed + PGlite store (D-027)
```
