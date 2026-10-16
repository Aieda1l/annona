# OWNERSHIP.md — four human lanes, shared surfaces, and PR rules

> **Status:** PROPOSED, 2026-10-15. Takes effect when the shared baseline is pushed at kickoff (`docs/plans/active/kickoff-baseline.md`). Per `CLAUDE.md`, this file and the four `prompts/dev-0N-*.md` files **override the illustrative paths in `CLAUDE.md`** once the team approves them. The main path difference: migrations live in `src/db/migrations/`, not `supabase/migrations/` (D-005).

## 1. Lanes

Each human runs **their own Claude Code session on their own Claude Pro account**, in **their own clone or `git worktree`**, on **their own branch**, starting from the **same baseline commit**: the git tag `baseline` (`BASELINE_SHA = git rev-parse 'baseline^{commit}'`, posted in chat; recorded later in `docs/PROJECT_STATE.md` via a chore PR; D-023). Four Claude sessions must never share one working tree.

| Lane | Human | Branch | Exclusively owned paths | Delivers (P0 acceptance criteria in `docs/MVP_SCOPE.md`) |
|---|---|---|---|---|
| **Dev 1 — Vision + donor intake** | `<name>` | `feat/intake` | `src/features/intake/**` (incl. `components/` with `LinkVerification`, `http/` with `verify`), `src/lib/ai/**` (incl. `prompts/`), `tests/intake/**`, `fixtures/intake/**`, `docs/PROMPT_EVAL.md` | AC-01, AC-02, AC-03 |
| **Dev 2 — Safety gate + matching + state + DB** | `<name>` | `feat/dispatch` | `src/core/**` (incl. `http/`), `src/db/**` (incl. `migrations/`, `seed/`), `tests/core/**` | AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-17 |
| **Dev 3 — Photon messaging + timed workflows** | `<name>` | `feat/messaging` | `src/integrations/photon/**` (incl. `http/`), `src/workflows/**` (incl. `http/`, ticker, optional listener), `tests/messaging/**` | AC-10, AC-11, AC-12, AC-13, AC-18 |
| **Dev 4 — UI + deployment + integration captain** | `<name>` | `feat/dashboard` (UI), `chore/integration-*` (captain work) | `src/app/**` (pages incl. `/v`, layouts, thin route files), `src/components/**` (incl. `ui/` design system), `src/styles/**`, `public/**`, `tests/ui/**`, deployment files (`Dockerfile`, `railway.json` / `vercel.json`, `Procfile`), `docs/demo/**`, `docs/submission/**` | AC-14, AC-15, AC-16 |

Dev 4 is a developer **and** the integration captain, not a fifth resource. The captain role adds merge, contract and shared-surface duties (§3). It does not grant permission to edit other lanes' code.

## 2. Captain-controlled shared surfaces

The captain creates these in the baseline commit. Afterwards they change **only** via an approved contract-change request (§4), committed by the captain on a `chore/integration-*` branch and reviewed by one other human.

- `src/contracts/**`: types, Zod schemas, ports, typed fixtures (generated from `docs/CONTRACTS.md` at kickoff), plus `tests/contracts/**`, the schema tests for them
- `drizzle.config.ts`: created at baseline and pointed at `src/db/schema.ts` and `src/db/migrations/`. Dev 2 may request changes.
- `src/server/**`: composition root (`getServices()` in `container`), `getEnv()`, the session/actor helper `getActor(request)`, and the `health` handler. **`/api/health` and `/api/session` (+ `/api/session/actors`) ship working in the baseline**, using `DEMO_ACTORS` (D-024). Health adds Dev 2's `getSystemStatus()` once it lands.
- Lane barrels (`src/lib/ai/index.ts`, `src/features/intake/index.ts`, `src/core/index.ts`, `src/db/index.ts`, `src/integrations/photon/index.ts`, `src/workflows/index.ts`) are **created** by the captain at baseline as typed stubs. Each barrel is then **owned by its lane**, which must keep the exported names stable (CONTRACTS §9.0).
- Root config: `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `next.config.*`, `eslint.config.*`, `vitest.config.*`, `postcss.config.*`, `components.json`, `.env.example`, `.gitignore`
- `.claude/**`, `CLAUDE.md`, `README.md`, `prompts/**`
- Shared docs: `docs/ARCHITECTURE.md`, `docs/CONTRACTS.md`, `docs/DECISIONS.md`, `docs/MVP_SCOPE.md`, `docs/OWNERSHIP.md`, `docs/PRODUCT_BRIEF.md`, `docs/RESEARCH.md`, `docs/TEST_PLAN.md`, `docs/ROADMAP.md`, `docs/BACKLOG.md`, `docs/PROJECT_STATE.md`

Every lane may write these, but only its own files:

- `docs/handoffs/dev-N.md`: your lane's verified handoffs, append-only
- `docs/requests/<lane-slug>-<topic>.md`: your contract-change requests. `<lane-slug>` is `intake` (Dev 1), `dispatch` (Dev 2), `messaging` (Dev 3) or `dashboard` (Dev 4), e.g. `docs/requests/dashboard-simulated-phone.md`.
- `docs/plans/active/dev-N-<topic>.md`: your short executable plans (move to `docs/plans/completed/` when done)

**Thin route files.** `src/app/api/**/route.ts` files contain only a re-export, e.g. `export { POST } from "@/core/http/operator"`. Dev 4 owns the file. The lane named in `docs/CONTRACTS.md` §10 owns the handler module it points to. All route files are created at baseline. Each lane handler module returns `NOT_IMPLEMENTED` (501) until its lane replaces the stub; the captain's `health` and `session` handlers work from the start. Adding or renaming a route is a contract change.

**Composition root.** `src/server/container` calls exactly one factory per lane through its barrel, passing a config object built from `getEnv()`:

- `createVisionProvider` from `@/lib/ai` (Dev 1)
- `createDispatchStore` from `@/db` (Dev 2)
- `createMessagingGateway` from `@/integrations/photon` (Dev 3)

Each lane owns its factory's switch between `real`, `fake` and `misconfigured`. The container itself does not change when a lane adds its real adapter.

**Video script.** Dev 1 writes the video script text and hands it over in `docs/handoffs/dev-1.md`. Dev 4 commits it to `docs/demo/`.

## 3. Forbidden edits

| You are | Do not edit (open a request instead) |
|---|---|
| Dev 1 | `src/core/**`, `src/db/**`, `src/integrations/**`, `src/workflows/**`, `src/app/**`, `src/components/**`, `src/contracts/**`, `src/server/**`, root config |
| Dev 2 | `src/features/**`, `src/lib/**`, `src/integrations/**`, `src/workflows/**`, `src/app/**`, `src/components/**`, `src/contracts/**`, `src/server/**`, root config |
| Dev 3 | `src/features/**`, `src/lib/**`, `src/core/**`, `src/db/**`, `src/app/**`, `src/components/**`, `src/contracts/**`, `src/server/**`, root config |
| Dev 4 (as developer) | `src/features/**`, `src/lib/**`, `src/core/**`, `src/db/**`, `src/integrations/**`, `src/workflows/**`. Shared surfaces only through the captain process (§4). |

**If something outside your lane blocks you:** write a local test double inside your own `tests/<lane>/` that implements the contract interface. Keep working, and file a request. Never patch another lane's file "just to make it compile".

## 4. Contract-change requests

1. Create `docs/requests/<lane-slug>-<topic>.md` on your branch (slugs in §2):

   ```text
   REQUEST: <one line>
   LANE: Dev N
   CONTRACT SECTION: docs/CONTRACTS.md §x / src/contracts/<file>
   CHANGE: <exact field/enum/signature diff>
   WHY (which acceptance criterion needs it): AC-xx
   COMPATIBILITY: additive | breaking (who must rebase)
   TESTS AFFECTED:
   ```

2. Message the captain in the team chat with the file path. The captain answers within ~20 minutes: approve, modify or reject.
3. If approved, the captain commits the change to `src/contracts/**` and `docs/CONTRACTS.md` (version bump, §15) on `chore/integration-contract-vX`. One other human reviews it. The captain merges to `main` and posts "contracts vX merged at <sha>; rebase".
4. Prefer **additive** changes (new optional field, new enum member handled by a default branch). A breaking change requires all four humans to acknowledge in chat before merge.

## 5. Dependencies

- The baseline pre-installs every dependency the design needs (`docs/ARCHITECTURE.md` §3), so lanes never race on `package.json` / `pnpm-lock.yaml`.
- A new dependency is a contract-change request (package, version, why, size). The captain adds it on main, and lanes rebase.
- Never commit a lockfile change from a lane branch. If one appears, drop it (`git checkout main -- pnpm-lock.yaml`) and request the dependency.

## 6. Branches, PRs and review

- `main` is protected by convention. No direct pushes except the captain's kickoff baseline push (commits made before CP0, ending at the `baseline` tag, D-023). No `--force` ever. Merges only via PR.
- **Small PRs** (one vertical slice, ideally < 400 changed lines excluding fixtures). Title: `[Dev N] <slice>`. The body ends with the handoff block from `CLAUDE.md` / `docs/CONTRACTS.md` §14.
- **Required before merge:** `pnpm typecheck`, `pnpm lint`, `pnpm test` (your lane's tests plus the full suite if fast) pass locally. Paste the command output summary in the PR. If a check cannot run, the PR says **UNVERIFIED** and why.
- **Reviewer ≠ author**, and safety-critical code gets a human from another lane:

  | Author | Primary reviewer | Safety-critical items that need this reviewer's explicit OK |
  |---|---|---|
  | Dev 1 | Dev 4 | AI output parsing / fail-closed, literal `false` flags, no AI → verified leakage |
  | Dev 2 | Dev 3 | Gate rules G-01..G-13, claim transaction (CONTRACTS §8.1), expiry, authorization |
  | Dev 3 | Dev 2 | Inbound idempotency, JOIN/STOP identity handling, sender authorization, tick idempotency, real-vs-fake labeling |
  | Dev 4 | Dev 1 | No client-side safety logic, mode banners, disclosure rules (§11 of CONTRACTS) |
  | Captain (contracts/shared) | Dev 2 (Dev 3 between 4:00 and 6:30 PM Sat, while Dev 2 is the integration bottleneck; D-027) | Contract diffs, env/secret handling |

  A fresh-context Claude review (e.g. ECC `code-reviewer` / `typescript-reviewer` in the author's own session) is encouraged as a **pre-check**. It does not replace the human reviewer for safety-critical items.
- The captain merges with **squash** after review. After every contract or shared-config merge, each lane runs `git fetch && git rebase origin/main` (or merges main) and re-runs its tests.

## 7. Merge order (practical)

1. **Baseline** (captain, kickoff; minimal by default, D-034): the contract slice, `DEMO_ACTORS`, scenes and 3 card fixtures, barrels and stub handlers, route files, a working session + health, container, scripts. Tag `baseline` (D-023). Then, not blocking lanes: `chore/integration-contracts-2` by 2:30 PM and `chore/integration-ui-kit`.
2. **Lane slice 1** (any order; each uses fakes and local test doubles):
   - Dev 2: pure gate + matching, **plus an early PR with the Drizzle schema + migrations + deterministic seed + PGlite store**.
   - Dev 1: fake vision + intake parsing.
   - Dev 3: fake gateway + inbound parser.
   - Dev 4: dashboard on typed fixtures.
3. **Integration, unblocked per sub-PR (D-027):**
   - Dev 2 ships core in four sub-PRs: **2(a)** intake-facing (`storeDonationImage`, `createDraft` incl. `source_ref` idempotency, `attachAiResult`, `submitVerification` session path, `getDonationCard`); **2(b)** dispatch-facing (`createNextOffers` incl. `unmatched`, `openOfferForSend`, claim/decline, `expireDue`, identities incl. STOP S-15/S-17, inbound/outbound/status recording, `recordIgnoredInbound`); **2(c)** read models (`getDashboardSnapshot`, `getSystemStatus`; `getDonationCard` already landed in 2(a)); **2(d)** verification links (`issueVerificationLink`, `getVerificationLinkView`, `getVerificationLinkImage`, the link path of `submitVerification`) by about 7:00 PM, after CP2.
   - Dev 1 wires as soon as 2(a) merges, Dev 3 as soon as 2(b) merges, and Dev 4 as soon as 2(c) merges. These consumer PRs may merge in any order. The photo-by-message layer (Dev 3 `photo` command, Dev 1 link page) wires to 2(d).
   - **CP1.5 (5:15 PM):** 2(a) and 2(b) are merged.
   - **Build order for intake (D-031):** the web path lands first because it shares every piece of code with the messaging path; the messaging layer is thin on top. If SP-14 failed, the messaging layer starts only after CP2 is green.
4. **Shared demo DB:** the same migrations and seed are applied to the captain's Supabase project through the postgres.js driver of the *same* Drizzle repository. The demo switches to `STORE=postgres`. **T-CO-17 (required, D-033)** and the Postgres half of T-CO-23 run against `TEST_DATABASE_URL`, a disposable database reached through the same pooler mode as the demo.
5. **Real providers:** Dev 1 Gemini adapter (the VEYZL evidence PR, D-022) and Dev 3 Photon 2.0 adapter. Each lands behind its env switch and is labeled.
6. **Hardening:** edge tests, VEYZL fix commit, polish, deployment.

## 8. Integration checkpoints (captain runs; all four attend, about 5 minutes each)

| Checkpoint | Target time (PDT) | Pass condition |
|---|---|---|
| CP0 Baseline | **CP0a** Sat 1:15 PM (captain push); **CP0b** 1:30 PM (all machines) | CP0a: tag `baseline` pushed, captain's smoke passes, `BASELINE_SHA` and the contracts version posted. CP0b: all four on their branches, and `pnpm install && pnpm typecheck && pnpm test && pnpm build` passes on each machine. From about 12:50 PM lanes read `docs/KICKOFF.md` and plan in their sessions, but write no code before branching from the tag. SP-14 (photo intake spike) result posted. |
| CP1 Lane slices | Sat 4:00 PM | Each lane's slice-1 PR merged or reviewable |
| CP1.5 Core unblocked | Sat 5:15 PM | Dev 2 sub-PRs 2(a) and 2(b) merged (D-027) |
| CP2 Fake end-to-end | Sat 6:30 PM | Demo scenes 1–3 run end to end with fake providers on the integrated main, scene 1 at least through the **web fallback** (T-E2E-06, T-E2E-02, T-E2E-03) |
| CP3 Real providers + messaging intake | Sat 9:00 PM | Scene 1 **by message** passes in fake mode (T-E2E-01); real Gemini call, real Photon courier round trip and real photo intake (T-MS-19) attempted; T-CO-17 run; each recorded as VERIFIED or UNVERIFIED |
| CP4 Draft submitted | Target Sat 9:30 PM (D-003); latest acceptable 10:15 PM | Devpost draft submitted with all contributors + Discord handles + tracks (hard deadline 10:30 PM) |
| CP5 Freeze | Sun 7:30 AM | Feature freeze; only demo-blocking fixes; video recording starts |
| CP6 Final | Sun 9:30 AM | Final Devpost submission locked (hard cap 10:00 AM) |

## 9. Handoffs

After each merged slice, append to `docs/handoffs/dev-N.md`:

```text
LANE / BRANCH / COMMIT:
DELIVERED:
EVIDENCE (commands, passed/failed, real vs mock):
CONTRACT CHANGES OR REQUESTS:
BLOCKERS + SAFETY RISKS:
INTEGRATION STEPS:
NEXT SMALLEST ACTION:
```

The captain folds verified handoffs into `docs/PROJECT_STATE.md`. Lanes do not edit `PROJECT_STATE.md`.
