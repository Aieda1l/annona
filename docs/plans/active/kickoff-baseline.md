# kickoff-baseline.md — captain's executable kickoff plan

> **Owner:** Dev 4 (integration captain), in Dev 4's own Claude Code session (`/model sonnet`, `/effort medium`).
> **Timebox:** Sat Oct 17, **12:30–1:15 PM PDT** for the captain, ending at **CP0a** (captain push + smoke, 1:15 PM). All four machines on their branches by **CP0b** (1:30 PM) (`docs/OWNERSHIP.md` §8).
> **Minimal baseline by default (D-034).** The baseline holds only what lets four lanes start in parallel: scaffold, scripts, config, the contract slice below, `DEMO_ACTORS`, scenes, 3 card fixtures, barrels, stub handlers, route files, working session + health, T-CT-01/02. Everything marked *contracts-2* or *after CP0a* lands later in small captain PRs and never blocks a lane.
> **Status:** PROPOSED, written 2026-10-15 as ideation, revised 2026-10-16 for D-031..D-034, against the **current** contracts (version in the `docs/CONTRACTS.md` header). **Do not start any step before 12:30 PM Sat** (R-DH-1, R-DH-3; D-002), **except Steps 1–2** (branch rename and the docs-only commit), which the organizers allow now (D-035).
> **Outputs:**
> - A **public** GitHub repo on `main` (D-023).
> - Two commits: planning docs, then the baseline skeleton.
> - An annotated tag `baseline` on the skeleton commit. `BASELINE_SHA` = `git rev-parse 'baseline^{commit}'`, posted in team chat with the smoke exit codes.
> - Later (not blocking lanes): a `chore/integration-cp0-record` PR that records the SHA and smoke results in `docs/PROJECT_STATE.md`.
>
> **Shell:** Git Bash (POSIX). Record every command's real exit code. Never claim a step passed without its output. In Claude Code each Bash call starts a fresh shell, so run every fenced block below as **one** call (variables such as `SECRET_RE` do not survive between calls).
> **Prompts are never edited** (D-023). Lanes branch from the tag, and each prompt checks the tag against the posted SHA.

## 0. Preconditions (all must hold)

| # | Check | Command / evidence | If false |
|---|---|---|---|
| C1 | Clock ≥ 12:30 PM PDT Sat Oct 17 | `date` | Wait. No code before then. Steps 1–2 (docs-only commit) may already have run (D-035). |
| C2 | Organizer answers to Q-1 recorded in `docs/PROJECT_STATE.md` §6 | Read §6 | **Never block the baseline on an organizer reply.** Apply the defaults: commit the docs labeled as pre-event ideation, create accounts now (≥ 12:30). VEYZL waits for an explicit organizer OK. |
| C3 | Organizers did **not** forbid pre-event docs in the repo | §6 Q-1 | Use Step 2-ALT |
| C4 | Repo holds only the planning package; no `.env*`, no `node_modules` | `git status --short` lists only `.claude/ BOOTSTRAP_MASTER.md CLAUDE.md PROJECT_IDEA.md README.md docs/ prompts/`, or is empty with `git log --oneline` showing the one docs commit if Steps 1–2 ran early | Remove strays (ask whoever created them) |
| C5 | Tooling ready | `node --version` → v22.x; `pnpm --version` → 10.x; `gh auth status` → logged in; `echo "${ANTHROPIC_API_KEY:-unset}"` → `unset` | Fix before continuing (ROADMAP §3). `gh auth login` is interactive: the human runs it in their own terminal. The captain's repo stays under OneDrive (Dev 4 decision, 2026-10-16): **pause OneDrive sync** for the event, or file locks in `node_modules`/`.next` cause install and build failures. |
| C6 | Team acknowledged D-001..D-035 (5 min in chat; `docs/KICKOFF.md` summarizes them) | Chat | Record objections. The captain appends a new decision entry (next free ID: D-036) after the baseline. |

## 1. Timebox

| Time | Steps | Hard rule |
|---|---|---|
| 12:30–12:33 | 0, 1, 2 | — |
| 12:33–12:42 | 3, 4 | — |
| 12:42–1:05 | 10 and 11 first (scripts + config, about 5 min, so tests can run), then **5, 6, 7, 8** with Claude; write 12 (README) while Claude generates | **12:58 check:** if `entities.ts` is not done, ship only the cross-lane entities listed in Step 5 and move the rest to *contracts-2*. **Never cut:** T-CT-01, T-CT-02, `DEMO_ACTORS`, working session + health, barrels, route files. |
| 1:05–1:12 | 13 (smoke) | Fix forward. No commit 2, no tag, until the smoke is green. |
| 1:12–1:15 | 14, 15, 16 | **CP0a 1:15 PM:** tag pushed, smoke passed, `BASELINE_SHA` posted |
| 1:15–1:30 | 17 (all four machines) | **CP0b 1:30 PM:** everyone on their branch, checks pass |
| 1:30–2:30 | 9 (shadcn, in the captain's `feat/dashboard` worktree), 18, 19; `chore/integration-contracts-2` **by 2:30 PM** | Not blocking lanes |

While the captain works (12:30–1:15), the other lanes do their provider spikes **outside the repo** (curl, provider dashboards; ROADMAP §4), including **SP-14 photo intake** (Dev 3 + Dev 1, ≤ 15 min). From about 12:50 PM they read `docs/KICKOFF.md` and plan in their sessions. Nobody writes repo code before branching from the tag.

## 2. Steps

### Step 1 — rename the branch

```bash
git branch -m main || git symbolic-ref HEAD refs/heads/main   # fallback for an unborn branch
git branch --show-current                                       # expect: main
```

### Step 2 — commit 1: the planning docs as they are

> May run before 12:30 PM (D-035). If it already ran, check `git log --oneline` shows exactly that commit and continue at Step 3. Docs edited after it go in at Step 14 with the skeleton.

```bash
SECRET_RE="$(sed -n "s/^ *SECRET_RE='\(.*\)'$/\1/p" docs/ARCHITECTURE.md | head -1)"
test -n "$SECRET_RE" && echo "scan regex loaded from ARCHITECTURE §9"   # expect the echo
grep -q "pre-event" README.md && echo "README ideation label present"      # expect the echo
git add CLAUDE.md README.md PROJECT_IDEA.md BOOTSTRAP_MASTER.md docs prompts .claude/settings.json .gitattributes
git diff --cached --name-only                                    # expect: only .md files + .claude/settings.json + .gitattributes (LF, for Windows checkouts)
git diff --cached -- . ':!.env.example' | grep -nE "$SECRET_RE" ; echo "secret-scan exit=$? (1 = clean)"
git commit -m "docs: pre-event ideation package (markdown planning written before 12:30 PM Sat; no code)"
git log --oneline                                                # expect: 1 commit
```

- The scan is the canonical secret scan in `docs/ARCHITECTURE.md` §9. The first line loads its regex from that file, so the regex is never restated here. It matches key *bodies*, not the prefixes that the planning docs mention in prose.
- Do **not** backdate. The commit time is the real kickoff time. The README states the docs were authored before the event as ideation.

**2-ALT (organizers forbid pre-event docs in the repo):**

1. Skip this commit. Keep the package in a shared folder outside the repo.
2. At or after 12:30, write and commit only fresh files: a minimal `CLAUDE.md`, `.claude/settings.json`, a README, plus new `docs/handoffs/`, `docs/requests/` (each with a short README) and a fresh `docs/PROJECT_STATE.md`.
3. Step 5 still generates `src/contracts/**` from `CONTRACTS.md` in the shared folder.
4. Lanes paste their prompts from the shared folder. Prompt paths under `docs/` then mean the shared-folder copy.
5. `BASELINE_SHA` is posted in chat only (Step 16).
6. Record a new decision entry (D-028).

### Step 3 — scaffold Next.js in a temp dir, then move it in

The repo directory is not empty (CLAUDE.md, docs, prompts), so `create-next-app` would refuse to scaffold into it.

```bash
pnpm view create-next-app@16.4.2 version
# expect 16.4.2. ASSUMPTION: create-next-app is released in lockstep with next 16.4.2 (R-INF-10 observed next only).
# If missing: use the newest 16.x of both and record it in ARCHITECTURE §3.
pnpm dlx create-next-app@16.4.2 --help | head -60
# confirm the flag names below; look for an option that skips generating AGENTS.md / CLAUDE.md and add it if present
SCAF="$(mktemp -d)/annona-scaffold"
pnpm dlx create-next-app@16.4.2 "$SCAF" --ts --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --use-pnpm --skip-install --disable-git --no-agent-feedback --yes
# flags confirmed against `create-next-app@16.4.2 --help` on 2026-10-17 11:10 AM (pre-event, registry lookup only);
# next, create-next-app and @google/genai pins are the current npm `latest`. AGENTS.md is generated by default: the tar excludes it.
( cd "$SCAF" && tar --exclude=./README.md --exclude=./CLAUDE.md --exclude=./AGENTS.md \
    --exclude=./node_modules -cf - . ) | tar -xf - -C .
git diff --exit-code -- CLAUDE.md README.md docs prompts .claude/settings.json \
  || git checkout -- CLAUDE.md README.md docs prompts .claude/settings.json
test -e AGENTS.md && echo "AGENTS.md present: delete it (CLAUDE.md governs)"
git status --short    # expect new: package.json tsconfig.json next.config.ts eslint.config.mjs postcss.config.mjs src/app/ public/ .gitignore (exact list varies)
```

- If prompted, take the defaults. React Compiler: **No**.
- `README.md`, `CLAUDE.md`, `docs/`, `prompts/` and `.claude/settings.json` must be unchanged. The `git diff --exit-code … || git checkout …` line restores them if the scaffold touched them.

### Step 4 — install dependencies with exact versions (ARCHITECTURE §3)

```bash
pnpm install
pnpm add -E zod drizzle-orm postgres @electric-sql/pglite @google/genai@2.30.0 lucide-react socket.io-client
pnpm add -E -D drizzle-kit tsx vitest @vitejs/plugin-react vite-tsconfig-paths jsdom \
  @testing-library/react @testing-library/dom @testing-library/jest-dom
grep -nE '"[~^]' package.json ; echo "range-grep exit=$? (1 = all exact)"   # strip any ^/~ by hand, then pnpm install
pnpm list --depth 0      # copy the resolved versions into the ARCHITECTURE §3 "Version" column (goes into commit 2)
```

- **Not installed:** `@photon-ai/api`. D-011 uses `fetch`, and the SDK changes daily (R-PH-3). Dev 3 may request it through `docs/requests/messaging-<topic>.md`.
- **`socket.io-client`** is pre-installed so that the relay fallback never needs a lockfile change (OWNERSHIP §5).
- **The test tooling** (`@vitejs/plugin-react`, `vite-tsconfig-paths`, `@testing-library/dom`, `jest-dom`) is what Next.js + Vitest needs. List it in ARCHITECTURE §3.
- **ASSUMPTION:** if pnpm 10 reports "ignored build scripts" and `pnpm build` later fails on a native dependency, the human runs `pnpm approve-builds` (interactive) in their own terminal and commits the resulting config change in commit 2.

### Step 5 — generate `src/contracts/**` from the current `docs/CONTRACTS.md` + contract tests

Prompt your Claude session to generate these, quoting CONTRACTS section numbers. Use `snake_case` fields (D-015). Each enum is a `const` array plus `z.enum`.

**Cross-lane entities (the minimum if the 12:58 check fails):** `VisionSuggestion` + `VisionModelOutput`, `VerifiedFacts`, `EligibilityDecision`, `DonationCard` + `OfferSummary`, `ClaimCommand` + `ClaimResult`, `InboundMessage`, `InboundResult`, `OutboundMessage`, `SendResult`, `OfferMessageView`, `DraftReadyView`, `VerificationLinkView`, `SystemModes`, `DashboardSnapshot`, `IdentitySummary`. Lane-internal shapes (profiles, `MatchCandidate`, `PolicyConfig`, `AuditEvent`, `DeliveryStatusEvent`, `VerificationLink` row) may move to *contracts-2*.

| File | Contents (CONTRACTS §) |
|---|---|
| `src/contracts/enums.ts` | Every §2 enum, exact strings, including `DonationStatus.unmatched`, `ReasonSeverity.dispatch`, `MessagePurpose` `draft_ready`/`intake_failed` and `InboundIgnoreReason`; the §2.1 ReasonCode catalogue (code → severity), including `NO_ELIGIBLE_MATCH`/`CANDIDATES_EXHAUSTED`/`COURIER_OPTED_OUT` (dispatch), `COURIER_OPTED_OUT_AFTER_PICKUP` (review) and `PICKUP_NOT_COLLECTED` (reject). Export `INBOUND_REPROCESS_AFTER_SECONDS = 30`. |
| `src/contracts/entities.ts` | §3.1–§3.13 types + Zod schemas. **`VisionSuggestion` uses `.strict()`.** **`VisionModelOutput`** = the VisionSuggestion schema with the five provenance keys (`prompt_id`, `prompt_version`, `provider`, `model`, `mode`) omitted, `.strict()` (§3.3). **`VerifiedFacts` is `.strict()`**: every key required, `allergens` with all nine keys, `attestation.attested_at` present but overwritten by core (§3.4). Literal flags: `ingredients_verified: z.literal(false)`, `handling_verified: z.literal(false)`, `requires_donor_confirmation: z.literal(true)`, `is_synthetic: z.literal(true)`, `handoff.simulated: z.literal(true)`, `attestation.attested: z.literal(true)`. Field paths use `allergens.<name>` (§3.6). v0.2 shapes: `OfferMessageView`, `DeliveryStatusEvent`, `SendResult` (incl. `NOT_JOINED`), `SystemModes` (per-provider `status: ok \| misconfigured`), `DonationCard.donor_area_label`, `OfferSummary.recipient_display_name`, `IdentitySummary`. HTTP request bodies (§10) are `.strict()`; the simulated inbound body is `{ identity_id, text, fixture_id? }`; the verify bodies are `{ token }` and `{ token, facts }`. v0.4 shapes: `Donation.source_ref`/`collected_at`, `DraftReadyView`, `VerificationLinkView` (§3.16). UTC strings must end in `Z`. |
| `src/contracts/result.ts` | `Result<T>`, `ErrorCode`, the HTTP status map (§3.15) |
| `src/contracts/ports.ts` | `VisionProvider`, `MessagingGateway`, `DispatchStore` (opaque `{ kind: StoreKind }`), `Clock`, `Actor` (§9.1); the factory config types `{ mode, api_key, model }`, `{ kind, database_url, pglite_dir }`, `{ mode, project_id, api_key }` (§9.0). Both provider ports expose `mode` and `status` (§9.1, §9.2, §12). |
| `src/contracts/functions.ts` | Signature types for §9.0 and the lane-public functions in §9.2–§9.4, each with the optional trailing `deps?: { store?, clock?, messaging?, vision? }` where §9.0 says so (types only). *contracts-2.* Until then each barrel stub carries its own signature (Step 8). |
| `src/contracts/routes.ts` | The §10 route table as constants (method, path, owner lane, auth). *contracts-2.* |
| `src/contracts/fixtures/demo-actors.ts` | **`DEMO_ACTORS`** (§9.0, D-024): a readonly list of `{ key, actor_id, role, display_name }` with **fixed UUIDs** (e.g. `00000000-0000-4000-8000-000000000001`, …) and **no handles**. Personas match the ARCHITECTURE §7 seed: 1 operator; donors Rainier Catering (approved), 1 pending, 1 suspended; recipients Eastlake Community Pantry, Youth Meals Program, 1 not-registered DFDO, 1 HSP-serving; couriers A, B (cold transport) and C (none). Every display name ends in "(synthetic)". Dev 2's seed uses these IDs. |
| `src/contracts/fixtures/donation-cards.ts` | Baseline: **3 cards** (`needs_review` = scene 3, `eligible`, `claimed`). *contracts-2:* the other 8, giving **one `DonationCard` per `DonationStatus` (11, incl. `unmatched`)**, plus a `VerificationLinkView` and a `DraftReadyView`. Synthetic names with "(synthetic)", fixed `…Z` timestamps, example short codes `K7M3` / `H4M9` only. |
| `src/contracts/fixtures/scenes.ts` | The **3 demo scenes** (MVP_SCOPE §5): VisionSuggestion + VerifiedFacts + expected outcome. Scene 1 suggestion `sandwich_platter`; scene 1 facts = **`scene1_eligible_facts`**, the policy-eligible demo facts used by T-CO-01. **No fixture, scene or test name may contain "safe".** |
| `src/contracts/index.ts` | Barrel export |
| `tests/contracts/contracts.test.ts` | **T-CT-01:** every fixture parses. `ingredients_verified: true` and unknown keys (`safe`, `allergen_free`) are rejected. `VisionModelOutput` rejects any provenance key. Enum arrays deep-equal the lists copied from CONTRACTS §2. `DEMO_ACTORS` IDs are unique UUIDs and carry no handle field. No fixture name contains "safe". |
| `tests/contracts/session.test.ts` | **T-CT-02**, written first (RED); passes after Step 6: `POST /api/session` with a `DEMO_ACTORS` id + correct passcode sets a signed cookie; a wrong passcode or unknown `actor_id` → `NOT_AUTHORIZED`; a tampered cookie → `getActor` returns `null`. |

The DispatchStore internals are private to Dev 2 (§9.1). The public surface is the §9.3 functions. Lanes request additions through `docs/requests/<lane-slug>-<topic>.md`.

### Step 6 — `src/server/**` (captain; session and health **work** at baseline)

| File | Behavior |
|---|---|
| `src/server/env.ts` | `getEnv()`: Zod schema, parsed **lazily** so `next build` runs with no env. Baseline: the names the container, session and health need (`ANNONA_DEMO_MODE`, `STORE`, `PGLITE_DIR`, `DATABASE_URL`, `VISION_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `MESSAGING_PROVIDER`, `PHOTON_PROJECT_ID`, `PHOTON_API_KEY`, `SESSION_SECRET`, `DEMO_PASSCODE`, `APP_BASE_URL`); *contracts-2* adds the rest of CONTRACTS §12 (incl. `TICK_INTERVAL_MS`, `TEST_DATABASE_URL`, `DEMO_DONOR_HANDLE`, `DEMO_COURIER_A_HANDLE`, `DEMO_COURIER_B_HANDLE`). A lane that needs a name earlier asks in chat; the captain adds it within minutes. An unset provider variable means `fake`. A real provider with a missing key is passed through, so the lane factory reports `misconfigured` (never silently fake). Never a `NEXT_PUBLIC_` secret. Lanes never read `process.env` directly. |
| `src/server/container.ts` | `getServices()` → `{ vision, messaging, store, clock }`, memoized on `globalThis`. It calls exactly `createVisionProvider({ mode, api_key, model })` from `@/lib/ai`, `createDispatchStore({ kind, database_url, pglite_dir })` from `@/db` and `createMessagingGateway({ mode, project_id, api_key })` from `@/integrations/photon`, each with config built from `getEnv()`, plus the system `Clock`. It never changes when lanes add real adapters (OWNERSHIP §2). |
| `src/server/session.ts` | HMAC-signed httpOnly cookie `{ role, actor_id }` using `node:crypto` + `SESSION_SECRET` (D-013); `SameSite=Lax`, `Secure` on HTTPS. Exports `getActor(request) → Promise<Actor \| null>` (null on a missing or tampered cookie); `POST` (strict body `{ actor_id, passcode }`, `actor_id` must be in `DEMO_ACTORS`, timing-safe passcode compare against `DEMO_PASSCODE`); `DELETE` (clears the cookie); `GET_ACTORS` for `/api/session/actors` (demo mode only; returns `{ actors: { role, actor_id, display_name }[] }`). If `SESSION_SECRET` or `DEMO_PASSCODE` is unset, `POST` fails closed with `NOT_AUTHORIZED`. |
| `src/server/health.ts` | `GET /api/health` returns `SystemModes`: provider `mode`/`provider`/`model`/`channel`/`status` from `getServices()`, `store` kind, `demo_accelerated` from `ANNONA_DEMO_MODE`, `last_tick_at: null` and `policy_version: "unavailable"` (never a made-up version). A captain follow-up PR adds Dev 2's `getSystemStatus()` once sub-PR 2(c) merges (OWNERSHIP §7). |
| `src/server/http.ts` | `toResponse(result)` (ErrorCode → HTTP, §3.15) and `notImplemented(route, owner)` → 501 `{ ok:false, error:{ code:"NOT_IMPLEMENTED", message, retryable:false } }` |

### Step 7 — stub handler modules + thin route files (CONTRACTS §10)

Each route file contains only a re-export. Each lane handler module returns `notImplemented(...)` until the lane replaces it. Dynamic routes receive `{ params: Promise<{ id: string }> }`.

| Route | Route file (`src/app/api/…/route.ts`) | Re-exports from (owner) |
|---|---|---|
| `GET /api/health` | `health/` | `@/server/health` (captain; **working**, 200) |
| `POST`, `DELETE /api/session` | `session/` | `@/server/session` (captain; **working**) |
| `GET /api/session/actors` | `session/actors/` | `export { GET_ACTORS as GET } from "@/server/session"` (captain; **working**) |
| `POST /api/intake/drafts` | `intake/drafts/` | `@/features/intake/http/drafts` (Dev 1) |
| `POST /api/donations/:id/verification` | `donations/[id]/verification/` | `@/features/intake/http/verification` (Dev 1) |
| `POST /api/verify/view` | `verify/view/` | `export { VIEW as POST } from "@/features/intake/http/verify"` (Dev 1) |
| `POST /api/verify/image` | `verify/image/` | `export { IMAGE as POST } from "@/features/intake/http/verify"` (Dev 1) |
| `POST /api/verify/submit` | `verify/submit/` | `export { SUBMIT as POST } from "@/features/intake/http/verify"` (Dev 1) |
| `GET /api/donations/:id` | `donations/[id]/` | `@/core/http/donation` (Dev 2) |
| `GET /api/dashboard` | `dashboard/` | `@/core/http/dashboard` (Dev 2) |
| `POST /api/donations/:id/operator-actions` | `donations/[id]/operator-actions/` | `@/core/http/operator` (Dev 2) |
| `POST /api/donations/:id/handoff` | `donations/[id]/handoff/` | `@/core/http/handoff` (Dev 2) |
| `GET /api/images/:id` | `images/[id]/` | `@/core/http/images` (Dev 2) |
| `POST /api/demo/reset` | `demo/reset/` | `@/core/http/demo` (Dev 2) |
| `POST /api/donations/:id/dispatch` | `donations/[id]/dispatch/` | `@/workflows/http/dispatch` (Dev 3) |
| `POST /api/internal/tick` | `internal/tick/` | `@/workflows/http/tick` (Dev 3) |
| `POST /api/messaging/photon/inbound` | `messaging/photon/inbound/` | `@/integrations/photon/http/inbound` (Dev 3) |
| `POST /api/messaging/simulated/inbound` | `messaging/simulated/inbound/` | `@/integrations/photon/http/simulated` (Dev 3; `POST`) |
| `GET /api/messaging/simulated/thread` | `messaging/simulated/thread/` | `@/integrations/photon/http/simulated` (Dev 3; `GET`) |

### Step 8 — lane barrels with typed stubs, script entries, empty folders (lanes own them afterwards)

Each barrel exports **every** name its lane provides in CONTRACTS §9.0–§9.4, typed against `@/contracts`. Stubs that return `Result` return `NOT_IMPLEMENTED`. Stubs with a non-`Result` return type throw `Error("NOT_IMPLEMENTED (owner Dev N): <name>")`. After the baseline, each barrel belongs to its lane, which keeps the exported names stable. Lanes import each other **only** through these barrels.

| File (owner) | Stub behavior |
|---|---|
| `src/lib/ai/index.ts` (Dev 1) | `createVisionProvider({ mode, api_key, model })` → provider with `mode` (`real` if `gemini`, else `fake`), `model: null`, `status: "ok"`; `analyzeFoodImage` returns `NOT_IMPLEMENTED` |
| `src/features/intake/index.ts` (Dev 1) | `createDraftFromImage`, `parseVerifiedFacts`, `submitDonorVerification`, `getLinkVerification`, `submitDonorVerificationByLink` stubs (§9.2) |
| `src/features/intake/components/index.ts` (Dev 1) | Placeholder client components `PhotoUpload`, `DraftReview`, `VerificationForm`, `LinkVerification` that render "Not implemented (Dev 1)" (CONTRACTS §9.0). Dev 1 keeps the names stable so Dev 4's pages can mount them. |
| `src/core/index.ts` (Dev 2) | Every §9.3 function as a typed stub, incl. `getSystemStatus`, `getIdentity`, `optOutIdentity`, `recordStatusEvent`, `recordDeliveryStatus`, `issueVerificationLink`, `getVerificationLinkView`, `getVerificationLinkImage`, `recordIgnoredInbound`, `createTestClock` |
| `src/db/index.ts` (Dev 2) | `createDispatchStore({ kind, database_url, pglite_dir })` → `{ kind }` (works). `src/db/schema.ts` empty with a comment. |
| `src/integrations/photon/index.ts` (Dev 3) | `createMessagingGateway({ mode, project_id, api_key })` → gateway with `mode`, `channel`, `status: "ok"`; `send` returns `{ ok:false, error_code:"NOT_IMPLEMENTED", retryable:false, mode }`. `normalizePhotonEvent` stub. |
| `src/workflows/index.ts` (Dev 3) | `handleInbound`, `handleDeliveryStatus`, `tick()`, `dispatchDonation`, `formatOfferMessage(view: OfferMessageView)`, `formatDraftReadyMessage(view: DraftReadyView)` stubs (§9.4) |
| `src/db/migrate.ts`, `src/db/seed/index.ts` (Dev 2); `src/workflows/worker.ts` (Dev 3); `src/lib/ai/eval.ts` (Dev 1) | Print `not implemented yet (owner Dev N): <script>` to stderr and **`process.exit(1)`**, so nobody mistakes a placeholder for a pass |
| `.gitkeep` in `tests/{intake,core,messaging,ui}/`, `fixtures/intake/images/` | Empty |

### Step 9 — shadcn/ui init + base components (after CP0a, in the captain's `feat/dashboard` worktree; non-interactive)

Not part of the baseline (D-034). `components.json` is a captain-controlled config file, so commit it in a small `chore/integration-ui-kit` PR (reviewer: Dev 1); the generated `src/components/ui/**` is Dev 4's lane code.

```bash
pnpm view shadcn version                                   # pin exactly what this prints as <v>
pnpm dlx shadcn@<v> init --help                            # confirm the non-interactive flags
pnpm dlx shadcn@<v> init --yes --defaults                  # components.json (captain); output under src/components/ui (Dev 4)
pnpm dlx shadcn@<v> add --yes button card badge alert input label textarea select checkbox radio-group table tabs separator dialog skeleton tooltip sonner
```

If a flag is missing in that version, use what `--help` shows; never answer prompts that would overwrite `src/contracts` or `src/server`.

### Step 10 — package scripts

Edit `package.json`. **Keep whatever lint command the scaffold generated**, and verify it.

| Script | Command |
|---|---|
| `dev` / `build` / `start` | `next dev` / `next build` / `next start` |
| `lint` | scaffold default (e.g. `eslint`) |
| `typecheck` | `tsc --noEmit` |
| `test` | `vitest run` |
| `db:generate` | `drizzle-kit generate` |
| `db:migrate` | `tsx --env-file-if-exists=.env.local src/db/migrate.ts` |
| `db:seed` | `tsx --env-file-if-exists=.env.local src/db/seed/index.ts` |
| `worker` | `tsx --env-file-if-exists=.env.local src/workflows/worker.ts` |
| `eval:intake` | `tsx --env-file-if-exists=.env.local src/lib/ai/eval.ts` |

- **ASSUMPTION:** `tsx` forwards `--env-file-if-exists` to Node 22. If it doesn't, use `node --env-file-if-exists=.env.local --import tsx <file>`.
- The planned lane filter is `pnpm test tests/<lane>`. Verify it in Step 13 and record the working form in ARCHITECTURE §3 (commit 2).

### Step 11 — config files (captain-controlled)

| File | Content |
|---|---|
| `vitest.config.ts` | `plugins: [tsconfigPaths(), react()]`. Include `tests/**/*.test.{ts,tsx}`. Environment `node` by default; **`jsdom` for `tests/ui/**` and `tests/intake/**/*.tsx`** via Vitest `projects` (two projects split by glob), with a setup file importing `@testing-library/jest-dom/vitest` for the jsdom project. Fallback if the installed Vitest version handles this differently: a `// @vitest-environment jsdom` docblock per component test file, recorded in ARCHITECTURE §3. No `passWithNoTests`. |
| `drizzle.config.ts` | `dialect: "postgresql"`, `schema: "./src/db/schema.ts"`, `out: "./src/db/migrations"`, `dbCredentials.url` from `DATABASE_URL` (OWNERSHIP §2) |
| `next.config.ts` | `serverExternalPackages: ["@electric-sql/pglite"]`; `outputFileTracingIncludes` mapping `/api/intake/drafts` to `./fixtures/intake/images/**` (CONTRACTS §9.2). **ASSUMPTION:** both behave as intended (ARCHITECTURE §16); confirm with `pnpm build` and again on the first deploy. |
| `.env.example` | **Names only, empty values**, from CONTRACTS §12: `ANNONA_DEMO_MODE STORE PGLITE_DIR DATABASE_URL VISION_PROVIDER GEMINI_API_KEY GEMINI_MODEL MESSAGING_PROVIDER PHOTON_PROJECT_ID PHOTON_API_KEY PHOTON_WEBHOOK_SECRET PHOTON_INBOUND_MODE TICK_INTERVAL_MS TEST_DATABASE_URL DEMO_DONOR_HANDLE DEMO_COURIER_A_HANDLE DEMO_COURIER_B_HANDLE ANNONA_INTERNAL_SECRET APP_BASE_URL SESSION_SECRET DEMO_PASSCODE` (the full list, even though `env.ts` parses only part of it at baseline). All values are empty, including the three demo handles; when unset, Dev 2's seed uses synthetic `@example.invalid` handles usable only with fake messaging. No phone-number literal anywhere in the repo. Comments: "Never set ANTHROPIC_API_KEY." "Real courier handles go only in .env.local." "TEST_DATABASE_URL is a disposable database, never the shared demo DB." |
| `.gitignore` | Scaffold default **plus**: `.env*`, `!.env.example`, `.data/` (PGlite dir and `.data/photon-cursor`), `.next/`, `node_modules/`, `.vercel/`, `.claude/settings.local.json`, `.claude/worktrees/` |

```bash
git check-ignore -v .env.local .data/x .claude/settings.local.json .claude/worktrees/x   # expect 4 matches
git check-ignore .env.example ; echo "exit=$? (1 = not ignored, correct)"
```

### Step 12 — README note (captain)

Add one short "Kickoff baseline" paragraph covering:

- The planning docs and prompts were written **before 12:30 PM Sat as ideation** (Rule 10, R-DH-3) and committed at kickoff.
- **All code was written at or after 12:30 PM.**
- The scaffold came from `create-next-app` and shadcn/ui.
- AI-assisted development is disclosed.
- The repo is public from kickoff; data is synthetic.

### Step 13 — smoke test (record every exit code)

```bash
pnpm install;    echo "install=$?"
pnpm typecheck;  echo "typecheck=$?"
pnpm lint;       echo "lint=$?"
pnpm test;       echo "test=$?"                 # T-CT-01 and T-CT-02 pass; lane test dirs are empty
pnpm test tests/contracts; echo "filter=$?"     # expect only the 2 contract test files reported
pnpm build;      echo "build=$?"
pnpm db:migrate; echo "db:migrate=$? (expect 1: placeholder)"
```

- **Expected:** the first six commands exit `0`, and `db:migrate` exits `1` with the placeholder message.
- **Test filter:** if `pnpm test tests/contracts` runs more than the contract files, retry with pnpm's `--` argument separator before the path. Record the form that filters correctly in ARCHITECTURE §3, together with the resolved versions from Step 4.
- **Live check** (run `pnpm dev` in a second terminal with a local `.env.local` that sets `ANNONA_DEMO_MODE=1`, a random `SESSION_SECRET` and a `DEMO_PASSCODE`):
  - `curl -s localhost:3000/api/health` → 200, all providers `fake`, `status: "ok"`.
  - `curl -s localhost:3000/api/session/actors` → 200 with the `DEMO_ACTORS` list.
  - `curl -si -X POST localhost:3000/api/session -H 'content-type: application/json' -d '{"actor_id":"<operator id>","passcode":"<DEMO_PASSCODE>"}'` → 200 with a `Set-Cookie` header.
  - `curl -s -o /dev/null -w "%{http_code}" -X POST localhost:3000/api/intake/drafts` prints `501`, and so does `-X POST localhost:3000/api/verify/view`.
- **If any check fails:** fix forward before Step 14. No commit 2, no tag, no posted SHA.

### Step 14 — commit 2: baseline skeleton

```bash
SECRET_RE="$(sed -n "s/^ *SECRET_RE='\(.*\)'$/\1/p" docs/ARCHITECTURE.md | head -1)"; test -n "$SECRET_RE" || echo "REGEX NOT LOADED: stop"
git add -A
git diff --cached --name-only | grep -E "^\.env($|\.)|^\.data/|node_modules|\.next/|AGENTS\.md" | grep -v "^\.env\.example$" ; echo "stray-grep exit=$? (1 = clean)"
git diff --cached -- . ':!.env.example' | grep -nE "$SECRET_RE" ; echo "secret-scan exit=$? (1 = clean)"
git ls-files | grep -E '^\.env' | grep -v '^\.env\.example$' ; echo "env-files exit=$? (1 = clean)"
git diff --exit-code HEAD -- .claude/settings.json CLAUDE.md prompts ; echo "unchanged exit=$? (0 = unchanged)"
CV="$(grep -m1 -o 'contracts v[0-9.]*' docs/CONTRACTS.md)"; echo "$CV"   # the only version source (D-034)
git commit -m "chore: kickoff baseline skeleton ($CV, DEMO_ACTORS, session/health, barrels, stubs, scripts; written after 12:30 PM)"
```

Commit 2 includes the ARCHITECTURE §3 updates (resolved versions, test-filter form, Vitest environment choice) and the README paragraph.

### Step 15 — create the public repo, push, tag

> If the public repo already exists with the docs commit pushed (D-035), replace the `gh repo create` line with `git push origin main` and run the rest unchanged.

```bash
SECRET_RE="$(sed -n "s/^ *SECRET_RE='\(.*\)'$/\1/p" docs/ARCHITECTURE.md | head -1)"; test -n "$SECRET_RE" || echo "REGEX NOT LOADED: stop"
git log -p -- . ':!.env.example' | grep -nE "$SECRET_RE" ; echo "history-scan exit=$? (1 = clean)"   # whole history; no origin exists yet
gh repo create <owner>/annona --public --source . --remote origin --push
CV="$(grep -m1 -o 'contracts v[0-9.]*' docs/CONTRACTS.md)"
git tag -a baseline -m "Annona kickoff baseline ($CV)"
git push origin baseline
BASELINE_SHA="$(git rev-parse 'baseline^{commit}')"; echo "BASELINE_SHA=$BASELINE_SHA"
test "$BASELINE_SHA" = "$(git rev-parse HEAD)" && echo "tag points at commit 2"
git ls-remote --tags origin 'baseline*'          # expect refs/tags/baseline and refs/tags/baseline^{} (= BASELINE_SHA)
```

- The repo is **public from kickoff** (D-023). It is never "made public later".
- `BASELINE_SHA` is the commit (`baseline^{commit}`), not the annotated-tag object. Prompts are not edited.
- From now on `main` changes only through PRs (OWNERSHIP §6). Never force-push. Never move or re-create a pushed tag.

### Step 16 — post to the team chat (CP0a, 1:15 PM)

```text
BASELINE_SHA=<sha>   tag=baseline   repo=<url>   contracts=<version from the CONTRACTS.md header>
Smoke: install=0 typecheck=0 lint=0 test=0 filter=0 build=0 (db:migrate=1 placeholder)
Branch:  git fetch --tags origin && git switch -c feat/<intake|dispatch|messaging|dashboard> baseline
Check:   git rev-parse 'baseline^{commit}'   # must equal BASELINE_SHA
Read:    docs/KICKOFF.md first (10 min), then paste prompts/dev-0N-*.md unchanged (everything below its horizontal rule)
Tests:   pnpm test tests/<lane>   (form recorded in docs/ARCHITECTURE.md §3)
Repo is public. Secrets and courier handles: DM only, never in git or chat.
```

### Step 17 — every machine branches from the tag (CP0b, 1:30 PM)

Each human, in their own clone or worktree (the captain uses a worktree for `feat/dashboard`, e.g. `git worktree add ../annona-dashboard -b feat/dashboard baseline`):

```bash
git clone <repo-url> annona-<lane> && cd annona-<lane>
git fetch --tags origin && git switch -c feat/<lane> baseline
git rev-parse 'baseline^{commit}'                       # equals the posted BASELINE_SHA
cp .env.example .env.local                              # keys empty unless you own them; fakes are the default
pnpm install && pnpm typecheck && pnpm test && pnpm build ; echo "cp0b=$?"
```

Each human posts `cp0b=0` (or the failing command) in chat, then pastes their own prompt.

### Step 18 — accounts and Devpost shell, right after CP0a (not blocking it)

| Account | Owner | Do | Output → where |
|---|---|---|---|
| Supabase project (Free), created **fresh** (R-INF-1) | Dev 4 | Create the project. Copy the transaction pooler URL (6543) and the session pooler URL (5432) (R-INF-7). | `DATABASE_URL` → Dev 2 by DM; Vercel env |
| Vercel Hobby | Dev 4 | `pnpm view vercel version`, then use `pnpm dlx vercel@<pinned>`. `vercel login` / `vercel link` are interactive: **the human runs them in their own terminal.** Set env in Vercel; deploy `main`. If Git deploys of teammates' commits are blocked, the captain deploys with `vercel deploy --prod` (R-INF-4; D-017). | URL → `PROJECT_STATE.md` §10 |
| Photon Beta project | Dev 3 (created during the 12:30 spike) | app.beta.photon.codes org + project, API key, webhook destination once there is a public URL (R-PH-1, R-PH-2, R-PH-6). The donor phone and couriers A/B send their handles **by DM to Dev 2, Dev 3 and the captain** (never in git); Dev 3 needs them to create the matching assignments (R-PH-4). | Keys in Dev 3's `.env.local`; to the captain by DM for Vercel |
| AI Studio keys | each; demo-project key Dev 1 | Personal key for dev work; a separate demo project key (D-012) | Own `.env.local`; demo key to the captain by DM |
| VEYZL GitHub App | Dev 4 | **Only after an explicit organizer OK.** Install on the public repo; it checks every PR. The evidence PR is the first intake/AI PR opened after CP2, normally Dev 1's Gemini-adapter PR (D-022). | `PROJECT_STATE.md` §4 |
| Devpost project shell | Dev 4 | By about 2:00 PM: all 4 contributors + Discord handles; tracks **Community Kitchen, SideShift, DubHacks NEXT only**. First test whether a declared track can be removed (R-SP-9). Photon, MLH Gemini and VEYZL are added at the 9:30 PM draft only if removable or their evidence exists (R-DH-4). | ROADMAP §6 |

### Step 19 — record CP0 (PR, not a direct push)

On `chore/integration-cp0-record` (reviewer: Dev 2): `docs/PROJECT_STATE.md` §1 baseline row = `BASELINE_SHA`, the contracts version from the CONTRACTS.md header, CP0a/CP0b rows = real exit codes from Steps 13 and 17, §10 GitHub row = repo URL. Lanes do not need this PR to start.

Later captain follow-ups, each a small `chore/integration-*` PR: **`chore/integration-contracts-2` by 2:30 PM** (`functions.ts`, `routes.ts`, the other 8 card fixtures + `VerificationLinkView`/`DraftReadyView` fixtures, the rest of `env.ts`, any entities moved by the 12:58 check); `chore/integration-ui-kit` (Step 9); health adds `getSystemStatus()` after Dev 2's 2(c) merges.

## 3. CP0 verification checklist

**CP0a (1:15 PM, captain):**

- [ ] `git ls-remote --tags origin 'baseline*'` shows the tag, and its peeled commit equals the posted `BASELINE_SHA`.
- [ ] `git log --oneline origin/main` shows 2 commits; `origin/main` = `BASELINE_SHA`.
- [ ] Smoke exit codes from Step 13 posted (first six `0`).
- [ ] Canonical scan clean on staged changes and on the whole history; `git ls-files | grep -E '^\.env'` prints only `.env.example`.
- [ ] `.claude/settings.json`, `CLAUDE.md` and `prompts/` unchanged since commit 1.
- [ ] `GET /api/health` returns 200 with all providers `fake`. `/api/session` and `/api/session/actors` work. Every lane route (incl. `/api/verify/*`) returns 501.
- [ ] ARCHITECTURE §3 lists the resolved versions and the test-filter form.

**CP0b (1:30 PM, all four):**

- [ ] Each human is on `feat/<lane>` created from the tag, in their own clone or worktree, with their own prompt pasted.
- [ ] Each posted `cp0b=0` from Step 17.

## 4. Rollback and fallbacks

| Situation | Action |
|---|---|
| Smoke test fails before the tag | Fix forward on local `main` and re-run Step 13. No commit 2, no tag, no post until it is green. |
| Baseline found broken **after the tag is pushed** (before or after anyone branches) | **Never move, delete or re-create the tag, and never force-push.** `BASELINE_SHA` stays the tag's commit. Fix forward via a `chore/integration-baseline-fix` PR reviewed by Dev 2 (Dev 3 between 4:00 and 6:30 PM). Post "baseline fix merged at <sha>; rebase". Lanes branch from the tag as usual, then `git fetch origin && git rebase origin/main`. |
| `create-next-app@16.4.2` unavailable | Use the newest 16.x of `create-next-app` and `next`; record it in ARCHITECTURE §3 |
| `gh repo create` fails | The human creates the empty **public** repo on the web, then `git remote add origin <url> && git push -u origin main`, then continue Step 15 at `git tag` |
| Canonical scan finds a hit | Stop. Remove the value, re-stage, re-scan. If it was ever pushed, **rotate the key immediately**; rewriting history does not un-leak it. |
| Organizers have not answered Q-1 by 12:30 | Apply the C2 defaults and proceed. VEYZL waits for an explicit OK. |
| Still not green at 1:15 PM | Report CP0a FAILED with the failing command. Lanes keep spiking outside the repo and planning. The captain fixes forward and re-runs CP0a at 1:30 PM; CP0b moves to 1:45 PM. |
