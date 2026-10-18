# ARCHITECTURE.md — Annona (PROPOSED)

> **Status (2026-10-15, pre-event): every row in this document is PROPOSED. Nothing is implemented. No code, package manifest, schema or deployment exists yet.** Implemented behavior is defined only by code and tests merged on `main` after kickoff. The captain updates §15 as features land. Contracts: `docs/CONTRACTS.md`. Evidence: `docs/RESEARCH.md`. Decisions: `docs/DECISIONS.md`.

## 1. Step-back: constraints that decide the design

| Constraint | Source | Design consequence |
|---|---|---|
| A photo and an LLM can never establish safety, allergen absence, temperature or legality | CLAUDE.md; R-AI-3 ("validate values") | AI output is a separate, immutable, untrusted object. The gate's input type excludes it. Literal-`false` flags. |
| Unknown must fail closed, with explainable reasons | CLAUDE.md safety rules 2, 4 | A pure, deterministic gate with an exhaustive reason catalogue; `unknown` → `needs_review` |
| Exactly one winner under concurrent, duplicate, late messages | CLAUDE.md rule 6; R-PH-6 (at-least-once inbound) | Postgres row lock + conditional updates + partial unique index; dedupe table on provider message ID |
| Timers can't be trusted to fire (serverless, restarts, sleeping laptops) | R-INF-2, R-INF-3 | Lazy expiry inside transactions; idempotent `tick` for liveness only |
| Photon shared iMessage lines can't send first; only text replies, no buttons | R-PH-4, R-PH-9 | JOIN opt-in identity state (donors and couriers); strict text grammar with offer short codes |
| Donors should only have to text a photo, yet safety facts must be verified in structured form | D-031; CLAUDE.md safety rules 1–2 | Messaging-first intake: photo by message, AI-guess reply, one-time link to the structured checklist (CONTRACTS §8.4); web upload as the fallback on the same code |
| Four humans on Pro accounts, about 21 build hours, Windows + mixed machines, possibly no Docker | CLAUDE.md; R-INF-8; R-TOOL-6 | Zero-setup local dev (PGlite); fakes for every provider; disjoint file ownership; small PRs |
| No code before 12:30 PM Sat; video + Devpost + judging deadlines | R-DH-1..5 | Spec-only contracts now; generated baseline at kickoff; freeze at 7:30 AM Sun |
| Judges score functionality 30%, track fit 30%, design 20%, creativity 20% | R-DH-8 | Reliability of the one flow and a polished dashboard over extra integrations |

## 2. Design alternatives (compact evidence matrix)

| Criterion (weight) | **S1 (chosen)**: Next.js on Vercel + Supabase Postgres via Drizzle (PGlite for tests/local) + lazy timers + worker | S2: Single Node server (Hono) + SQLite + server-rendered UI on Railway or laptop | S3: Next.js + Supabase RPC (plpgsql) + Supabase Realtime + Inngest durable timers |
|---|---|---|---|
| Claim atomicity on real DB semantics (high) | ✅ Postgres row locks / conditional updates; tested in PGlite and on Supabase | ⚠️ SQLite serializes writers (correct, but different semantics from any Postgres demo) | ✅ Same, but the logic lives in SQL functions |
| Testable offline without Docker (high) | ✅ PGlite in-process | ✅ SQLite file | ❌ Needs a hosted DB, or Docker for a local Supabase stack (R-INF-8) |
| Parallel ownership across 4 lanes (high) | ✅ Lane TS modules; one Drizzle schema owner (Dev 2) | ⚠️ One server file tends to become a hotspot | ⚠️ SQL functions + RLS + Inngest config cross lanes |
| Photon compatibility (high) | ✅ Webhook → route; worker relay if Socket.IO/poll needed | ✅ Persistent process | ✅ but adds Inngest |
| Vendors to set up at kickoff (medium) | 3: Vercel, Supabase, + Photon/Gemini | 2: Railway, + Photon/Gemini (card requirement unverified, R-INF-9) | 4: Vercel, Supabase, Inngest, + Photon/Gemini; Deployment Protection pitfall (R-INF-9) |
| UI polish for the design score (medium) | ✅ React + shadcn/ui | ⚠️ Weaker | ✅ |
| Timer precision (low; correctness is lazy anyway) | ⚠️ Tick interval of 5 s | ⚠️ Same | ✅ Per-offer `sleepUntil` |
| **Verdict** | **Best balance** | Viable fallback for the runtime only (D-017 ladder step 2) | Too many moving parts for 21 h |

## 3. Stack (exact versions pinned at kickoff and recorded here)

| Layer | Choice | Version observed 2026-10-15 (re-verify) | Notes |
|---|---|---|---|
| Runtime | Node.js 22 LTS | local 22.23.2 | `@photon-ai/api` engines `>=22`; `@google/genai` 2.x `>=20` (R-PH-3, R-AI-4) |
| Package manager | pnpm | local 10.33.3 | |
| Web framework | Next.js App Router + React | next 16.4.2 (R-INF-10) | Route handlers on the Node runtime |
| Validation | Zod | resolve at kickoff | Schemas in `src/contracts` |
| DB access | Drizzle ORM + drizzle-kit; drivers `postgres` (postgres.js) and `@electric-sql/pglite` | resolve at kickoff | Supabase transaction pooler: `prepare: false` (R-INF-7) |
| Database | Supabase Postgres (Free), created **at kickoff** | supabase-js not needed | Created fresh to avoid inactivity pause (R-INF-1) |
| Vision | `@google/genai` | 2.30.0 | `GEMINI_MODEL=gemini-3.5-flash-lite` (R-AI-1) |
| Messaging | Photon 2.0 Beta HTTP API via `fetch`; `@photon-ai/api` optional | 0.5.0 (changing daily) | Pin exactly or skip the SDK (R-PH-3) |
| Socket fallback | `socket.io-client` | resolve at kickoff | **Pre-installed at baseline** to avoid a later lockfile change. Used only if the webhook spike fails. `@photon-ai/api` is **not** installed (D-011 uses fetch). |
| UI | Tailwind CSS + shadcn/ui + lucide-react | resolve at kickoff | |
| Tests | Vitest; @testing-library/react + jsdom for components | resolve at kickoff | |
| Scripts runner | tsx | resolve at kickoff | Worker, migrate, seed, eval |
| Hosting | Vercel Hobby (web) + worker on the demo laptop | — | Fallback ladder in D-017 |

**Resolved at the kickoff baseline (2026-10-17, from `pnpm list --depth 0`; every dependency is pinned exactly, no `^`/`~`).**

| Package | Version | | Package | Version |
|---|---|---|---|---|
| next | 16.4.2 | | drizzle-orm | 0.45.4 |
| react / react-dom | 19.3.0 | | drizzle-kit | 0.31.11 |
| typescript | 5.9.3 | | postgres | 3.4.9 |
| zod | 4.6.7 | | @electric-sql/pglite | 0.5.10 |
| @google/genai | 2.30.0 | | socket.io-client | 4.8.4 |
| lucide-react | 1.59.0 | | tailwindcss / @tailwindcss/turbopack | 4.3.3 |
| vitest | 5.0.5 | | @vitejs/plugin-react | 6.1.2 |
| vite-tsconfig-paths | 6.1.1 | | jsdom | 30.1.3 |
| @testing-library/react | 16.3.3 | | @testing-library/dom | 10.4.2 |
| @testing-library/jest-dom | 7.0.1 | | tsx | 4.23.15 |
| eslint | 9.39.5 | | @types/node | 22.20.5 |

- **Test filter (verified):** `pnpm test tests/<lane>` filters correctly (`pnpm test tests/contracts` ran only the 2 contract files). A lane directory with no test files makes Vitest exit 1 (`passWithNoTests` is deliberately off); this clears when the lane adds its first test.
- **Vitest environments:** two `projects` in `vitest.config.mts` (`node` default; `jsdom` for `tests/ui/**` and `tests/intake/**/*.test.tsx`, setup file `tests/setup-jsdom.ts`). The config is `.mts` so Vite loads it as ESM. No per-file docblock needed.
- **Scaffold deviations (rulings):** the `create-next-app` defaults enabled `cacheComponents` and `partialPrefetching` in `next.config.ts`. They were removed: Annona pages and route handlers read per-request data (cookies, clock, store), and Cache Components would force a Suspense/`use cache` model on all four lanes. `@types/node` is pinned to 22.x to match the Node 22 runtime (the scaffold shipped 20.x, which triggered an unmet-peer warning). `LayoutProps` in `src/app/layout.tsx` was replaced by an explicit type because that global exists only after `next typegen`, and `pnpm typecheck` runs without it. ESLint ignores `_`-prefixed unused arguments so lane stubs lint clean.
- **pnpm build scripts:** pnpm 10 skipped dependency build scripts (`sharp`, `unrs-resolver`; see `pnpm-workspace.yaml`); `pnpm build` and the tests do not need them.

**Planned package scripts.** These are created at kickoff. **Verify they exist in `package.json` before running them; do not assume.**

`pnpm dev`, `pnpm build`, `pnpm start`, `pnpm lint`, `pnpm typecheck` (`tsc --noEmit`), `pnpm test` (`vitest run`), `pnpm test tests/<lane>` (exact filter form verified and recorded here at kickoff), `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm worker`, `pnpm eval:intake`.

## 4. Components and trust boundaries

```text
 UNTRUSTED                                  │ SERVER (authoritative)                             │ EXTERNAL PROVIDERS
                                            │                                                     │
 Donor iPhone (iMessage) ──photo─────────► │ Photon route → Dev3 handleInbound (photo) ──────────│◄ Photon 2.0 Beta (attachment)
                        ◄─AI guess + link── │   └─ Dev1 createDraftFromImage + Dev2 link issue     │
 Donor phone browser ──photo (≤1.5 MB)────► │ Dev1 intake: validate image → store bytea           │   (web fallback, same code)
   (/v checklist or /donor/new) ◄─draft──── │   └─ VisionProvider ───────────────────────────────►│ Gemini (real) / fake
                     ──VerifiedFacts──────► │ Dev1 parseVerifiedFacts (Zod, strict)               │
                                            │   └─► Dev2 core.submitVerification                   │
                                            │        evaluateEligibility (pure, G-01..G-13)        │
                                            │        state machine (S-01..S-18)                    │
                                            │        findCandidates (pure, M-01..M-10)             │
                                            │        claimOffer / declineOffer (txn, §8.1)         │
                                            │        Drizzle repo ──► Postgres (Supabase) | PGlite │
                                            │                                                     │
 Courier iPhone (iMessage) ◄──offer text─── │ Dev3 workflows.tick / dispatch ──MessagingGateway──►│ Photon 2.0 Beta (real) / fake outbox
                           ──"YES K7M3"───► │ Photon webhook route ─┐                              │   iMessage shared line
                                            │ worker relay (opt.) ──┴► normalize → dedupe → handleInbound
                                            │                                                     │
 Operator browser ◄──poll 2 s──────────────│ Dev2 read models (DashboardSnapshot)                │
   (dashboard, demo controls)               │ Dev4 pages render server truth only                 │
 Judge ◄──────── live dashboard + phone     │ /api/health → provider modes banner                 │
```

Trust boundaries and rules:

1. **Browser to server.** Every body is Zod-parsed. The actor comes from the signed session cookie, never from the request body. Client timestamps are ignored.
2. **AI to server.** The model output is untrusted text. It is parsed against a strict schema with literal `false`/`true` flags, stored as `ai_suggestion`, and never read by the gate.
3. **Messaging provider to server.** Webhook signature or internal-secret check comes first, then normalization, then a dedupe insert, then handle-to-identity resolution. An unknown or unjoined handle cannot act.
4. **Server to messaging provider.** Offer text contains no street address and no personal contact data. Addresses are sent only to the winning courier after the claim.
5. **Server to operator UI.** Read models are role-filtered (CONTRACTS §11). Handles are masked.
6. **Secrets.** Server env only. `NEXT_PUBLIC_*` never carries a secret. `.env.local` is gitignored.

## 5. Sequences

### 5.1 Happy path (demo scene 1)

```text
Donor phone, Courier A (iPhone) → Photon line: "JOIN" → identities joined (space, sender ids stored) → reply join_ack (+ "automated assistant", STOP)
Donor phone → photo                                 → dedupe(first) → handleInbound(photo) → fetch attachment (≤3 tries/6 s)
                                                    → createDraftFromImage(source=messaging, source_ref) → S-01 draft → VisionProvider (≤15 s) → S-02
                                                    → issueVerificationLink → reply draft_ready: "AI guess: … possible wheat, milk, eggs. Confirm here by 5:52 PM: <APP_BASE_URL>/v#<token>"
Donor (phone browser) → /v → POST /api/verify/view {token} (not consumed) → checklist (same VerificationForm)
Donor → POST /api/verify/submit {token, facts}      → parse → edited_from_ai → one txn: consume link + evaluateEligibility → S-03 eligible
   (web fallback: POST /api/intake/drafts, then POST /api/donations/:id/verification with the session cookie; same code after the entry point)
                                                    → next tick (≤ TICK_INTERVAL_MS) dispatches it; or operator presses "Dispatch now" (D-021)
Workflow: createNextOffers → S-04 offered, offer(pending_send) → openOfferForSend (open, expires_at) → gateway.send → 202 → provider_message_id
Courier A ← "Annona (automated, DEMO): pickup offer K7M3 … Reply YES K7M3 or NO K7M3 by 6:12 PM. STOP to opt out."
Courier A → "yes k7m3" → webhook/relay → dedupe(first) → handleInbound → claimOffer → S-07 claimed → reply with pickup address + recipient address
Operator dashboard (poll) shows claimed; operator clicks Simulated "Collected" → S-09, then "Delivered (recipient accepted after inspection)" → S-10
```

### 5.2 No response, then late reply (scene 2)

```text
Offer to A opens (expires_at = now + 60 s, demo-accelerated) … no reply
tick (worker, every 5 s): expireDue → offer A expired → S-06 eligible → createNextOffers (exclude A) → offer B → send
B → "YES H4M9" → claimed
A → "YES K7M3" (late) → claimOffer → offer A expired → ClaimResult offer_expired → reply "This offer expired; no assignment was made."
```

### 5.3 Responsible refusal (scene 3)

```text
Pasta tray photo → AI draft ("pasta with tomato sauce", possible wheat/milk)
Donor: preparation_type=cooked_then_cooled, continuous_cold_holding=unknown, temperature_log=no, sesame=unknown
Gate → needs_review [COOLING_HISTORY_REVIEW, COLD_HOLDING_UNKNOWN, TEMPERATURE_LOG_MISSING, ALLERGEN_UNKNOWN(sesame)]
No offer is created. The dashboard shows the reasons. Operator actions offered: reject, return_to_donor, cancel. No dispatch override exists.
```

### 5.3a No courier available, and courier STOP (D-032)

```text
eligible → createNextOffers finds no feasible pair → S-05 unmatched (NO_ELIGIBLE_MATCH, severity dispatch; neutral card)
operator "Retry matching" after a courier joins → S-14: cutoff + gate re-checked → eligible → next tick offers
Courier A claimed, then texts STOP before pickup → S-15: assignment released (close_reason courier_opted_out) → eligible → next tick offers B
Courier A collected, then texts STOP              → S-17: needs_review (COURIER_OPTED_OUT_AFTER_PICKUP); never re-offered; operator follows up, cancels with a note
```

### 5.4 Duplicate and concurrent inbound

```text
Photon redelivers the same message (webhook retry, or the same message also seen by the poll relay)
→ INSERT inbound_messages ON CONFLICT (provider, provider_message_id) DO NOTHING → duplicate → return stored result, no reply
Two different couriers answer concurrently (wave size 2)
→ both claimOffer transactions take the donation row FOR UPDATE; the first commits claimed; the second sees status=claimed → already_claimed
```

## 6. Timers, tick and the worker

- **Lazy correctness.** Claim and decline compare `now` with `offers.expires_at` and `donations.effective_cutoff_at` inside the transaction (CONTRACTS §7, §8).
- **`tick()` (Dev 3)** is idempotent and concurrency-safe:
  1. `expireDue` (conditional updates; `FOR UPDATE SKIP LOCKED` where batching).
  2. `createNextOffers` for each `eligible` donation (conditional `eligible → offered`).
  3. For each `pending_send` offer: `openOfferForSend`, then `gateway.send`, then record the provider ID, or `markOfferSendFailed`.
  4. Record `last_tick_at`.
- **Tick drivers.** Any one is sufficient; all hit `POST /api/internal/tick`.
  1. `pnpm worker` on the demo laptop (or another always-on machine). It loops every `TICK_INTERVAL_MS` (default 5000) with `x-annona-internal-secret`.
  2. Supabase `pg_cron` every 10 s calling `net.http_post` to the tick URL, if the Free project supports it. Scheduled by migration so it is replayable (R-INF-5).
  3. The operator dashboard's **"Run tick now"** demo control.
- **Photon inbound transport.** The kickoff spike picks the first that works:
  1. A **webhook destination** to `POST /api/messaging/photon/inbound`, verifying the signature on the raw body (R-PH-6).
  2. **Worker Socket.IO relay**: the worker subscribes to Photon events and POSTs each envelope to the same route with the internal secret. The cursor is kept in worker memory and checkpointed to a gitignored local file (`.data/photon-cursor`) after each successfully relayed event. On restart it resubscribes from the checkpointed cursor. If there is no checkpoint, it first back-fills with one poll of received messages using `createdSince = now − 10 min`. This is an **ASSUMPTION**: Photon cursors are opaque, and the replay retention window is undocumented (R-PH-6); the spike measures it. The dedupe table absorbs overlap.
  3. **Worker poll relay**: list received messages every 2 s with `createdSince`, honoring `Retry-After` (R-PH-6).
- The dashboard shows `last_tick_at`. A tick older than 30 s shows a "Scheduler stalled" warning. This is a liveness warning only; correctness is unaffected.

## 7. Minimum database schema (Dev 2; Drizzle; text + CHECK constraints instead of PG enums)

| Table | Key columns | Constraints / indexes |
|---|---|---|
| `donors` | id, display_name, org_type, licensed_food_establishment, approval_status, location jsonb `{lat,lng,area_label,address_line}`, is_synthetic | CHECK approval_status |
| `recipients` | id, display_name, approval_status, registered_dfdo, serves_highly_susceptible_population, accepts_handling_modes text[], excluded_allergens text[], capacity_servings_available, receiving_closes_at, location jsonb, is_synthetic | |
| `couriers` | id, display_name, approval_status, affiliated_recipient_ids uuid[], capabilities jsonb `{cold_transport}`, available_until, location jsonb, is_synthetic | |
| `messaging_identities` | id, actor_role (`courier` or `donor`), actor_id, provider, handle, status, provider_space_id, provider_sender_id, joined_at, opted_out_at | UNIQUE (provider, handle) |
| `donations` | id, donor_id → donors, status, version, source, source_ref, image_id, ai_status, ai_suggestion jsonb, verified_facts jsonb, edited_from_ai text[], latest_decision jsonb, effective_cutoff_at, claimed_offer_id, collected_at, created_at, updated_at, is_synthetic | CHECK status ∈ DonationStatus (incl. `unmatched`); INDEX (status); UNIQUE (source, source_ref) WHERE source_ref IS NOT NULL |
| `donation_images` | id, mime, bytes bytea, sha256, created_at | CHECK octet_length(bytes) ≤ 5 MB (web uploads are ≤ 1.5 MB by the intake check; message photos ≤ 5 MB) |
| `verification_links` | id, donation_id → donations, donor_id, token_hash, issued_at, expires_at, consumed_at, revoked_at | UNIQUE (token_hash); UNIQUE (donation_id) WHERE consumed_at IS NULL AND revoked_at IS NULL (CONTRACTS §3.16, §8.4). No raw token column. |
| `offers` | id, donation_id → donations, recipient_id, courier_id, short_code, status, wave_no, created_at, sent_at, expires_at, responded_at, close_reason, provider_mode, provider_message_id, delivery_status, candidate jsonb | **UNIQUE (donation_id) WHERE status='accepted' AND close_reason IS NULL** (one active assignment; F1); **UNIQUE (courier_id) WHERE status IN ('pending_send','open')** (one live offer per courier; M-09, F6); UNIQUE (short_code) (never reused until `resetDemo`, which deletes offers; D-026); INDEX (status, expires_at); INDEX (courier_id, status) |
| `inbound_messages` | id, provider, provider_message_id, provider_event_id, received_at, processing_started_at, sender_handle NULL, handle_masked, ignore_reason NULL, payload jsonb NULL, result jsonb NULL | **UNIQUE (provider, provider_message_id)**; `result IS NULL` rows older than 30 s are reclaimed (CONTRACTS §8.2); ignored senders stored with `sender_handle` and `payload` null (CONTRACTS §11) |
| `provider_status_events` | id, provider, provider_event_id, provider_message_id, status, failure_code, at | UNIQUE (provider, provider_event_id) |
| `outbound_messages` | id, identity_id, purpose, text, idempotency_key, provider_mode, provider_message_id, correlation jsonb, send_result jsonb, created_at | UNIQUE (idempotency_key) |
| `audit_events` | id, at, donation_id, offer_id, type, actor_role, actor_id, mode jsonb, data jsonb | INDEX (donation_id, at) |
| `policy_config` | policy_id, policy_version, config jsonb, active | One active row |
| `system_status` | key, value jsonb, updated_at | e.g. `last_tick_at` |

Seed (Dev 2, `pnpm db:seed`, deterministic, synthetic, relative to "now"):

- **Donors:** 1 approved licensed donor ("Rainier Catering (synthetic)"), 1 pending, 1 suspended.
- **Recipients:** "Eastlake Community Pantry (synthetic)" (refrigerated, no exclusions); "Youth Meals Program (synthetic)" (excludes peanuts and tree nuts); 1 not-registered DFDO; 1 HSP-serving.
- **Couriers:** A and B (cold transport, affiliated with Eastlake, handles = opted-in teammates); C (no cold transport).
- **Donor identity:** one messaging identity for "Rainier Catering (synthetic)", handle from `DEMO_DONOR_HANDLE` (D-031).
- **Policy:** 1 active row.

Real handles come from env `DEMO_DONOR_HANDLE` / `DEMO_COURIER_A_HANDLE` / `DEMO_COURIER_B_HANDLE` and are never committed. All persona IDs come from `DEMO_ACTORS` (D-024). `resetDemo` keeps messaging identities, so joined phones stay joined, and deletes offers, so short codes are free again.

## 8. Provider adapters and modes

| Port | Real | Fake | Selection | Visible as |
|---|---|---|---|---|
| VisionProvider | Gemini (`@google/genai`), schema output + Zod, 15 s timeout, `store:false` if Interactions API | Fixture-keyed deterministic suggestions (by fixture ID or image SHA-256), including a malformed-output fixture for tests | `VISION_PROVIDER` | Banner "AI: FAKE"; `ai_suggestion.mode`; audit |
| MessagingGateway | Photon 2.0 Beta HTTP (`POST /v1/projects/{id}/messages`, `Idempotency-Key`) | Returns a synthetic `provider_message_id` and persists nothing; the workflow layer records each send (CONTRACTS §8.3), and the **simulated phone** renders it via `listMessages` | `MESSAGING_PROVIDER` | Banner "Messaging: SIMULATED"; offer `provider_mode`; phone UI labeled |
| DispatchStore | Drizzle + postgres.js → Supabase | Drizzle + PGlite (same code) | `STORE` | `/api/health.store` |

A real provider error **never** silently falls back to fake (CONTRACTS §12). The simulated phone posts through `handleInbound`, exactly the real path.

## 9. Security, privacy, authorization

- **Roles.** Session cookie `{role, actor_id}` (HMAC-signed with `SESSION_SECRET`); the demo picker is gated by `DEMO_PASSCODE`. Messaging actor = joined identity by handle. Each core command checks the role and ownership (CONTRACTS §11).
- **Minimal disclosure.** Offer text contains only area labels. Addresses and pickup instructions go only to the winning courier. Handles are masked in the UI.
- **Verification links (D-031; CONTRACTS §8.4).** 256-bit CSPRNG token; only its SHA-256 is stored; the token travels in the URL fragment and `POST` bodies, never in a path, query string, log or audit event; `Referrer-Policy: no-referrer`, `Cache-Control: no-store`; expiry `min(30 min, cutoff)`; opening never consumes; the successful submit consumes it in the same transaction as S-03; every failure returns one uniform 403. A link grants access to one donation's checklist and nothing else.
- **Unknown senders.** No reply, no attachment download, no AI call; logged with the handle masked to its last 4 characters and no message content (CONTRACTS §11).
- **Data.** Synthetic profiles and photos only. No faces, labels, addresses or real organization names in images (free-tier AI data use, R-AI-5; Photon beta ToS, R-PH-10).
- **Photon ToS hygiene.** Opt-in by JOIN, STOP honored, automated-assistant disclosure in `join_ack` and offers.
- **Secrets and public repo (D-023).** The repo is public from kickoff. Secrets live in server env only. Before **every** push, run the single canonical scan:
  ```bash
  SECRET_RE='pho_sk_[A-Za-z0-9]{16,}|pho_ask_[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_-]{35}|sk-ant-[A-Za-z0-9_-]{20,}|whsec_[A-Za-z0-9+/=]{16,}|postgres(ql)?://[^ :/]+:[^ @]+@|\+1[2-9][0-9]{9}|[A-Z][A-Z0-9_]*(API_KEY|SECRET|TOKEN|PASSWORD|PASSCODE)[^A-Za-z0-9_ ]? *[:=] *[^A-Za-z0-9 ]?[A-Za-z0-9._~+/-]{20,}'
  git diff --cached -- . ':!.env.example' | grep -nE "$SECRET_RE"   # staged changes; exit 1 = clean
  git log -p origin/main..HEAD -- . ':!.env.example' | grep -nE "$SECRET_RE"   # unpushed commits; exit 1 = clean
  git ls-files | grep -E '^\.env' | grep -v '^\.env\.example$'      # must print nothing
  ```
  The regex matches key *bodies*, not prefixes mentioned in prose. The last branch is shape-independent: any `NAME_API_KEY`, `_SECRET`, `_TOKEN`, `_PASSWORD` or `_PASSCODE` assigned a value of 20 or more key characters, so a key whose format we do not know (for example the newer Google key shape) is still caught. A few test fixtures hold obviously fake values and will match (`tests/contracts/env.test.ts`, `tests/contracts/session.test.ts`, `tests/intake/doubles/http.ts`, `tests/intake/link-verification.test.tsx`, plus fake `postgres://` and `+1206555…` literals in `tests/`); in a diff or the full-history scan, a hit is acceptable only if it is one of those; anything else is a leak. `tests/contracts/secret-scan.test.ts` reads this regex from this file and checks it. This block is the **only** canonical scan; other docs cite it rather than restating it. Before the first push (no `origin/main` yet), scan the whole history with `git log -p -- . ':!.env.example'`. Synthetic handles in source, tests and fixtures are `@example.invalid` emails, never phone-number literals.
  Run the same grep over the full history (`git log -p`) on Sun 9:00 AM. Teammates' real phone handles live only in env (`DEMO_COURIER_*_HANDLE`, D-024).
- **Abuse.** The tick and relay routes require the internal secret. Demo routes are disabled unless `ANNONA_DEMO_MODE=1`.

## 10. UI screens (Dev 4 pages; Dev 1 intake components)

| Route | Who | Content |
|---|---|---|
| `/` | all | Pitch header, "Synthetic demo" notice, profile picker (passcode) |
| `/v` | donor, by link (no session) | **Primary checklist (D-031):** `LinkVerification` reads the token from the URL fragment and renders the same draft review and `VerificationForm` as `/donor/new`; shows the gate outcome and reasons after submit (Dev 1 component; Dev 4 page with no-referrer / no-store headers) |
| `/donor/new` | donor | **Web fallback:** photo upload (client downscale), then draft review: AI suggestions vs donor fields, nine allergens, attestations (Dev 1 components) |
| `/donor/donations/[id]` | donor | Status, decision reasons, what's missing |
| `/operator` | operator | Dashboard: cards by status (`unmatched` in its own neutral group), reasons, FieldState badges, active offers with server-derived countdowns, identity JOIN status, timeline, mode banner, `last_tick_at`, demo controls (reset, run tick now, dispatch now) |
| `/operator/donations/[id]` | operator | Full detail, audit timeline, operator actions (reject / return / cancel / retry matching) |
| `/operator/phone` | operator (demo) | **Simulated phone** for fake couriers and the fake donor: thread view, send JOIN/YES/NO, send a fixture photo, open the `draft_ready` link; clearly labeled |

## 11. Planned directory layout (created at kickoff)

```text
src/contracts/        captain   types, Zod schemas, ports, typed fixtures
src/server/           captain   container (composition root), env parsing, session/actor, health
src/app/              Dev 4     pages, layouts, api/**/route.ts thin re-exports
src/components/       Dev 4     ui/ (shadcn), dashboard/, layout/
src/styles/           Dev 4
src/features/intake/  Dev 1     service, components/, http/
src/lib/ai/           Dev 1     gemini adapter, fake adapter, prompts/annona-intake.v1.md, eval runner
src/core/             Dev 2     eligibility, matching, state, claims, service, read models, http/
src/db/               Dev 2     schema, client (driver switch), repo/, migrations/, seed/, migrate
src/integrations/photon/ Dev 3  client, normalize, gateway (real/fake), http/
src/workflows/        Dev 3     tick, inbound, message templates, worker (tick loop + relay), http/
tests/{intake,core,messaging,ui}/   per lane
tests/contracts/      captain   T-CT-01, T-CT-02
fixtures/intake/      Dev 1     synthetic images + eval cases
```

## 12. Observability and evidence

- `audit_events` is the demo's evidence trail, because Vercel Hobby keeps runtime logs only 1 h (R-INF-4).
- `GET /api/health` reports modes, store, `last_tick_at` and policy version.
- Real-provider evidence: offers' `provider_message_id`, the Gemini `model` in `ai_suggestion`, recorded in `docs/handoffs/` and the video.

## 13. Failure modes and fallbacks

| Failure | Detection | Behavior | Demo fallback |
|---|---|---|---|
| Gemini error, timeout, safety block or invalid JSON | Result `ok:false` | `ai_status=failed`; manual entry path; reason shown | `VISION_PROVIDER=fake` (labeled) |
| Photon beta access delayed | Kickoff spike | Simulated phone; Photon track not claimed until a real round trip | Labeled simulation |
| Photo by message unusable (HEIC rejected, `ATTACHMENT_NOT_READY`, too large) | SP-14; `intake_failed` replies | Donor gets `intake_failed`; no draft | Web upload opens scene 1 (ROADMAP rung 6a); iPhone camera "Most Compatible" |
| Donor phone cannot open `APP_BASE_URL` (laptop-only demo) | Link fails on the phone | — | Deployed URL or tunnel; else web upload on the laptop |
| Courier never sent JOIN | `openOfferForSend` guard or `SHARED_LINE_INBOUND_REQUIRED` | Offer `send_failed (courier_not_joined)` → next candidate | Demo checklist: all phones JOIN first |
| Photon webhook not verifiable or not delivering | Spike | Worker Socket.IO or poll relay | — |
| Worker or laptop sleeps | `last_tick_at` stale banner | Claims still correct (lazy); escalation pauses | "Run tick now" button; pg_cron |
| Supabase unreachable | Health check | API errors surfaced | `STORE=pglite` local stack (ladder step 3) |
| Vercel deploy blocked for non-owner commits | Deploy status | Captain deploys via CLI | Local `next start` |
| Venue Wi-Fi down | — | — | Phone hotspot; recorded backup video (Sat night) |
| Real provider selected but key missing | `status: misconfigured` in health/banner | Calls return `PROVIDER_UNAVAILABLE`; never silently fake (CONTRACTS §12) | Fix env or explicitly switch to fake + restart |
| Vercel Hobby CPU/invocation budget (R-INF-4) | Vercel usage page at CP3 | Dashboard polling pauses when the tab is hidden; developers poll local `next dev`; only judge-facing tabs hit Vercel; worker tick 5 s | Local `next start` (D-017 step 2) |
| Bad migration on the shared DB | Migration error | No backups on Free (R-INF-1) | Migrations replayable; `pnpm db:migrate && pnpm db:seed` on a fresh project |

**Rollback.** Every risky capability sits behind an env switch (`VISION_PROVIDER`, `MESSAGING_PROVIDER`, `STORE`). Code rollback is `git revert` of the squash-merged PR on `main` (never force-push). The demo-day fallback is the labeled fake mode plus the recorded video.

## 14. Development workflow mapping (one workflow per phase, all four lanes)

| Phase | Use exactly one of | Notes |
|---|---|---|
| Understand | Read the role prompt's read-first list; ECC `code-explorer` only for unfamiliar merged code | No broad repo scans |
| Plan | Superpowers `writing-plans` **or** ECC `/ecc:plan` (not both); write to `docs/plans/active/dev-N-<topic>.md` | ≤ 15 lines for small slices |
| RED/GREEN | Superpowers `test-driven-development` **or** ECC `tdd-workflow` | Required for gate, matching, claims, parsing, timers |
| Review | Human cross-lane reviewer (OWNERSHIP §6), optionally preceded by ECC `/code-review` or `typescript-reviewer` | No self-approval |
| Verify | Superpowers `verification-before-completion` **or** ECC `verification-loop` | Paste real command output |
| Debug | Superpowers `systematic-debugging` | |

## 15. Implemented vs proposed

| Capability | State | Evidence |
|---|---|---|
| Everything in this document | **PROPOSED** | None. No code exists as of 2026-10-15. |
| Contracts generated in `src/contracts` | Pending kickoff | — |

## 16. Open risks (tracked in `docs/PROJECT_STATE.md`)

- **Photon:**
  - Beta sign-up latency.
  - Which handles can be assigned (iPhones needed).
  - Whether an agent can send an unprompted offer hours after JOIN (R-PH spike).
  - Webhook signature format.
  - Inbound photo attachments: format (HEIC/JPEG), readiness and size (SP-14).
- **PGlite under `next dev`:** bundling untested. The fallback is a personal Supabase project.
- **Supabase `pg_cron` on Free:** unverified (R-INF-5). The worker loop and the manual tick cover it.
- **Pro usage limits:** a lane stalls if its human hits the 5-hour window (R-TOOL-6). Handoff docs let another human continue.
- **Organizer clarifications:** whether pre-event planning docs may sit in the repo, and whether sponsor accounts may be created before 12:30 PM.
