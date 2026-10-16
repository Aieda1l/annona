# KICKOFF.md — read this first (Annona, DubHacks 2026)

> **Status:** PROPOSED, written 2026-10-16 before the event (ideation only, D-002). Nothing is built. **No code before Sat Oct 17, 12:30 PM PDT.**
> **Why this file exists (D-034):** it is the one document every developer reads at kickoff. Everything else is reference: open only the section your task needs (§8). The contracts version is in the `docs/CONTRACTS.md` header and nowhere else.

## 1. What we ship

One working donation lifecycle, end to end:

1. An approved synthetic kitchen **texts a food photo** to Annona over iMessage (Photon 2.0). *Fallback: web upload, same code.*
2. Gemini drafts an **uncertain** summary. Annona replies with it and a **one-time link** to a mobile checklist.
3. The donor confirms ingredients, all nine allergens, servings and handling on that **structured checklist**. Nothing safety-relevant is read from chat text.
4. A deterministic gate returns `eligible`, `needs_review` or `rejected`, with plain-language reasons.
5. The next tick offers the lot to one cold-capable courier by iMessage, with a deadline.
6. **First valid `YES <code>` wins**, atomically. Late or duplicate replies lose cleanly.
7. The operator dashboard shows server truth. Pickup and delivery are simulated and labeled.

**AI describes, humans verify, the backend enforces.** "Eligible" never means safe, allergen-free or compliant. All data is synthetic.

## 2. Architecture in one paragraph

Next.js (App Router) on Vercel, with a Supabase Postgres database through one Drizzle repository (PGlite for tests and local dev). Gemini sits behind a `VisionProvider` port and Photon behind a `MessagingGateway` port, and each has a labeled `fake`. Correctness never waits on a timer: claim and decline check deadlines inside their transactions. An idempotent `tick` (worker every 5 s, or "Run tick now") only keeps things moving. Inbound messages are de-duplicated by provider message ID. Every lane talks to another lane only through its barrel (`@/core`, `@/workflows`, …).

```text
photo ─► Photon ─► handleInbound(photo) ─► createDraftFromImage ─► issueVerificationLink ─► "AI guess … <link>"
link ─► /v checklist ─► submitVerification (consume link + gate, one txn) ─► eligible
tick ─► createNextOffers ─► offer by iMessage ─► "YES K7M3" ─► claimOffer (row lock) ─► claimed ─► dashboard
```

## 3. Names you must use exactly

**DonationStatus:** `draft` → `needs_review` | `eligible` | `rejected`; `eligible` → `offered` | `unmatched`; `offered` → `claimed` → `collected` → `delivered`; also `canceled`, `expired`.

- `needs_review` = **safety or human review** (unknown facts, review rules, food with a courier who texted STOP after pickup).
- `unmatched` = **dispatch outcome**: eligible, but no courier or recipient is available. Neutral styling, `retry_matching` or `cancel` only.

**Courier STOP:** before pickup, the assignment is released and the lot is re-offered (S-15). After pickup, the lot goes to `needs_review` and is **never** reassigned automatically (S-17).

**Reason severities:** `reject`, `review` (from the gate), `dispatch` (matching only, never a safety finding).

**Cross-lane types** (`@/contracts`; never redefine): `VisionSuggestion`/`VisionModelOutput`, `VerifiedFacts`, `EligibilityDecision`, `DonationCard`, `ClaimCommand`/`ClaimResult`, `InboundMessage`/`InboundResult`, `OutboundMessage`/`SendResult`, `OfferMessageView`, `DraftReadyView`, `VerificationLinkView`, `SystemModes`, `DashboardSnapshot`.

**Verification link (CONTRACTS §8.4):** 32-byte random token, only its hash stored, carried in the URL fragment (`/v#<token>`), expires at `min(30 min, cutoff)`. Opening it never consumes it; a successful submit consumes it atomically; every failure returns one uniform 403.

## 4. Lanes

| Lane | Branch | Owns | Delivers |
|---|---|---|---|
| **Dev 1** Vision + intake | `feat/intake` | `src/features/intake/**`, `src/lib/ai/**`, `tests/intake/**`, `fixtures/intake/**` | Draft from a photo (both sources), the checklist (`VerificationForm`, `LinkVerification`), `/api/verify/*` and intake handlers, Gemini adapter |
| **Dev 2** Gate + matching + state + DB | `feat/dispatch` | `src/core/**`, `src/db/**`, `tests/core/**` | Gate, matching, S-01..S-18, claim transaction, links, read models, migrations + seed |
| **Dev 3** Photon + workflows | `feat/messaging` | `src/integrations/photon/**`, `src/workflows/**`, `tests/messaging/**` | Grammar incl. `photo`, `handleInbound`, offer and draft-ready texts, tick, worker, real Photon |
| **Dev 4** UI + deploy + **captain** | `feat/dashboard`, `chore/integration-*` | `src/app/**` (pages incl. `/v`, thin routes), `src/components/**`, `tests/ui/**`, deployment | Dashboard, demo controls, simulated phone page, deployment, Devpost, video; owns `src/contracts/**`, `src/server/**`, configs |

Never edit another lane's paths. Blocked? Write a local test double in your own `tests/<lane>/` and file `docs/requests/<lane>-<topic>.md`. Contracts change only through the captain.

## 5. P0 checklist (the release gate)

| # | Must be demonstrable on `main` | Evidence |
|---|---|---|
| 1 | Photo → uncertain draft, **by message and by web upload** | T-E2E-01, T-E2E-06 |
| 2 | Human verification on the checklist | T-IN-12, T-IN-13, T-CO-30 |
| 3 | Policy-eligible demo facts pass the gate | T-CO-11, T-E2E-01 |
| 4 | Eligible recipient + courier selected; none → `unmatched` | T-CO-12, T-CO-14 |
| 5 | Time-bound Photon offer, or a labeled fake | T-MS-06, T-MS-10 |
| 6 | First valid claim wins | T-CO-16 + **T-CO-17 on real Postgres** |
| 7 | Timeout or stale claim loses | T-CO-19, T-CO-21, T-E2E-02 |
| 8 | Dashboard shows server truth | T-E2E-01..03 |
| 9 | Unsafe or unknown inputs blocked | T-CO-02, T-CO-04, T-CO-09, T-E2E-03 |

The **28 must-run tests** are listed in `docs/TEST_PLAN.md` §5.0. Write them first. Everything else is optional.

**Two honesty rules:** (1) Until T-CO-17 passes on real Postgres (independent connections, demo pooler mode), nobody calls claims race-safe (D-033). (2) A simulated phone is not Photon, a fake draft is not Gemini, and an unrun test is **UNVERIFIED**.

## 6. Timeline (PDT)

| Time | What |
|---|---|
| Sat 12:30–1:15 | Captain builds the **minimal baseline**. Dev 1 + Dev 3 run spikes outside the repo, including **SP-14** (photo by iMessage → download → Gemini, HEIC check). Dev 2 drafts the must-run case list. Everyone reads this file. |
| **1:15 CP0a** | `baseline` tag pushed; `BASELINE_SHA` + contracts version + SP-14 go/no-go posted |
| **1:30 CP0b** | All four on their branches; install/typecheck/test/build green |
| 2:30 | Captain merges `chore/integration-contracts-2` (remaining fixtures, function/route types, env names) |
| **4:00 CP1** | Slice-1 PRs merged or reviewable |
| **5:15 CP1.5** | Dev 2 sub-PRs 2(a) intake + 2(b) dispatch merged |
| **6:30 CP2** | Scenes 1–3 in fake mode on `main`; scene 1 via **web upload** at minimum |
| ~7:00 | Dev 2 sub-PR 2(d) verification links |
| **9:00 CP3** | Scene 1 **by message** (fake); real Gemini, Photon and photo intake attempted; T-CO-17 run |
| **9:30 CP4** | Devpost draft (hard 10:30 PM) |
| Sun 7:30 CP5 / 9:30 CP6 | Freeze and video / final submission (hard 10:00 AM) |

**If SP-14 fails or photo intake is shaky:** build and demo web upload first, and add photo intake only after CP2 is green. Couriers stay on Photon either way. Photon intake never blocks the demo (ROADMAP rung 6a).

## 7. Rules at the keyboard

- Session start: `git status`, then read this file and your prompt. Run `/model sonnet` and `/effort medium`.
- RED first for gate, claims, timers, parsing, links and STOP handling.
- Small PRs titled `[Dev N] <slice>`, reviewed by another lane (OWNERSHIP §6), ending with the handoff block.
- Server time only (`Clock`); no client timestamps; no "dispatch anyway" control; no "safe" wording anywhere.
- No secrets, handles or `.env*` in git. Run the ARCHITECTURE §9 scan before every push.
- One workflow per phase (ECC or Superpowers, not both).
- Running low on `/status`? Write your handoff now.

## 8. Where to look (reference, not reading homework)

| Need | Section |
|---|---|
| Exact field, enum, route or function | `docs/CONTRACTS.md` (§2 enums, §3 entities, §4 states, §8 claims and links, §9 functions, §10 routes) |
| Acceptance criteria | `docs/MVP_SCOPE.md` §2 |
| Test case details | `docs/TEST_PLAN.md` §5 |
| Why a decision was made | `docs/DECISIONS.md` (D-031..D-034 are the latest) |
| Paths, PR rules, checkpoints | `docs/OWNERSHIP.md` |
| Sources and spikes | `docs/RESEARCH.md` §5 |

## 9. Your first action at kickoff

| Who | 12:30 (outside the repo) | After CP0b (1:30) |
|---|---|---|
| **Dev 1** | Create your AI Studio key; one real Gemini image call (SP-4); then SP-14 with Dev 3: send the downloaded photo bytes, HEIC included, to Gemini and record accepted/rejected | Branch `feat/intake`; paste your prompt; RED tests for `VisionModelOutput` parsing and the fake provider (T-IN-01, T-IN-02) |
| **Dev 2** | Write the must-run T-CO case list in prose (TEST_PLAN §5.0) | Branch `feat/dispatch`; paste your prompt; RED gate tests (T-CO-01..T-CO-11), then the early schema + seed PR |
| **Dev 3** | Photon Beta project, key, assignments for the three phones; JOIN round trip (SP-1); then SP-14: donor phone texts a photo, download it, record MIME, size and retries; post go/no-go by 1:15 | Branch `feat/messaging`; paste your prompt; RED grammar test incl. `photo` (T-MS-01) and `normalizePhotonEvent` (T-MS-14) |
| **Dev 4** | Execute `docs/plans/active/kickoff-baseline.md` (minimal baseline) | Post CP0b results; open your `feat/dashboard` worktree; UI kit PR; dashboard on fixtures (T-UI-01) |
