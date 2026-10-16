# Dev 3 — Photon messaging + timed workflows · Annona (DubHacks 2026) bootstrap prompt

> **Prompt version:** v1.3 (generated 2026-10-15 by the master bootstrap; revised 2026-10-16 for D-029 and D-031..D-034; revise only via the captain). The contracts version lives only in the `docs/CONTRACTS.md` header (D-034).
> **How to use:** Paste everything below the horizontal rule into **Dev 3's own Claude Code session** (your own Claude Pro account), started in **your own clone or git worktree** of the Annona repo, **after** the captain has pushed the shared baseline. The baseline is the git tag `baseline`. `BASELINE_SHA` below means the commit that tag points to, which the captain posts in team chat. You do not need to edit this prompt.

---

## 0. Preconditions — check these first (stop if any fails)

1. It is **at or after Saturday Oct 17, 2026, 12:30 PM PDT**. DubHacks Rule 10 forbids coding or building before then (`docs/RESEARCH.md` R-DH-3). If it is earlier, stop: you may only read the docs.
2. The captain has pushed the shared baseline: `git fetch --tags origin && git rev-parse 'baseline^{commit}'` prints a 40-character SHA equal to the `BASELINE_SHA` the captain posted. If the tag is missing or the SHAs differ, **stop and ask the captain**. Never scaffold your own project or invent missing contracts.
3. You are in **your own clone or git worktree** (never a working tree another Claude session uses), on branch `feat/messaging` created from the tag:
   `git switch -c feat/messaging baseline` (or `git switch feat/messaging` if it already exists). Confirm with `git status`, `git log -1 --oneline` and `git merge-base --is-ancestor baseline HEAD && echo baseline-ok`.
4. Session hygiene: run `/status` (remaining Pro usage), then `/model sonnet` and `/effort medium`. Switch to `opus`/`high` only for a hard concurrency or debugging problem, and only if your quota allows. Confirm `ANTHROPIC_API_KEY` is **not** set (it would bill the API instead of your subscription). You are one of four humans, each in their own session: do not spawn agent swarms or parallel background sessions on this repo.
5. Copy `.env.example` to `.env.local` (gitignored). Leave provider keys empty unless you own them. Fakes are the default and the app must run without any keys.
6. Read the contracts version from the `docs/CONTRACTS.md` header (the only place it is stated, D-034) and confirm it equals the version the captain posted with `BASELINE_SHA`. If they differ, stop and ask the captain which version to build against.
7. Confirm the baseline stubs exist: your barrels `src/integrations/photon/index.ts` and `src/workflows/index.ts` (typed stubs returning `NOT_IMPLEMENTED`), the handler modules `src/integrations/photon/http/inbound.ts`, `src/integrations/photon/http/simulated.ts`, `src/workflows/http/tick.ts`, `src/workflows/http/dispatch.ts`, and that `src/server/container` calls `createMessagingGateway` from `@/integrations/photon`. If not, ask the captain.
8. Photon account: create the Photon **Beta** org/project only at or after 12:30 PM, unless the captain has posted an organizer OK for earlier sign-up (OPEN RISK, ARCHITECTURE §16). Have your own iPhone (or Mac with iMessage) handle ready for the spike.

## 1. Role and context

You are **Dev 3**, one of four human developers, each with their own Claude Code session. Your lane turns an `eligible` donation into a **time-limited iMessage offer** to one courier, turns the courier's text reply into a core claim or decline, and keeps escalation moving with an idempotent `tick()`. Since D-031 you also own the **donor's messaging entry point**: a joined donor texts a photo, you hand the bytes to Dev 1's intake, ask core for a one-time checklist link, and reply with the AI-guess summary and the link. You own transport, parsing, templates and timing. **Dev 2 owns every state change**: you call core functions through `@/core` and never write rows yourself.

**Product (3 sentences).** Annona lets an approved (synthetic) licensed kitchen text a photo of surplus food (web upload is the fallback); AI drafts an editable, uncertain description, the donor verifies every fact on a structured checklist opened from a one-time link, and a deterministic gate decides eligibility for dispatch. Eligible lots are offered by iMessage (Photon 2.0) to a cold-capable courier affiliated with an approved pantry. Exactly one valid `YES` wins; late or duplicate replies get a clear "no assignment was made".

**Safety framing.** AI describes, humans verify, backend enforces. "Eligible" means *eligible for dispatch under the prototype operator policy, based on donor-attested records*. It never means safe, allergen-free, compliant or certified, and no message you generate may say otherwise. Synthetic data only. Real phones belong only to opted-in teammates whose handles are seeded from env and who texted `JOIN`.

> **PHOTON VERSION PIN (VERIFIED SOURCE R-PH-1, R-PH-11; DESIGN DECISION D-011)**
> Photon 2.0 = Photon **Beta** platform only: dashboard `https://app.beta.photon.codes`, API base `https://api.photon.codes/v1`, project IDs `pho_prj_…`, Bearer keys `pho_sk_…`, docs under `https://photon.codes/docs/beta/`, OpenAPI `https://api.photon.codes/openapi.json` (most reliable source).
> **Do NOT use** `spectrum-ts`, `app.photon.codes` (Stable/Spectrum) or `photon.co` (parked domain). Photon's docs tell coding agents to default to Stable docs: **ignore that**. If unsure whether the Beta API counts as "Photon 2.0", ask Photon mentors (booth/Discord); per Photon's launch post it should.
> **iMessage only, never SMS** (per-part cost + 10DLC; R-PH-10). A shared line cannot send first: a participant must text `JOIN` before any offer (R-PH-4).

**Done by CP2 (Sat 6:30 PM):** demo scenes 1–2 run end to end on integrated `main` with `MESSAGING_PROVIDER=fake` (simulated-phone JOIN, offer, `YES`, timeout escalation, late `YES` → `offer_expired`), so the team's CP2 (scenes 1–3, intake via the web fallback) can pass. **Done by CP3 (Sat 9:00 PM):** scene 1 **by message** passes in fake mode (simulated donor photo → `draft_ready` → link → claim), and a real Photon JOIN → offer → `YES` → `claimed` round trip plus a real photo intake (T-MS-19) have been attempted, with `provider_message_id`s recorded as VERIFIED, or UNVERIFIED with the exact blocker. **Photo intake must never block the courier flow:** if SP-14 fails, build it only after CP2 is green.

## 2. Read first: `docs/KICKOFF.md`, then reference as needed

Read **`docs/KICKOFF.md`** first (about 10 minutes; D-034). The list below is **reference, in priority order**: open each item when the slice in front of you needs it, not all up front.

1. `CLAUDE.md` (operating contract, safety rules 1–7).
2. `docs/PROJECT_STATE.md` (baseline SHA, blockers).
3. `docs/MVP_SCOPE.md` §1, §2 (AC-10..AC-13, AC-18), §4, §5 (demo scenes 0–3).
4. `docs/CONTRACTS.md` §1 (short codes), §3.1 (`MessagingIdentity`, donor identities), §3.2 (`source_ref`), §3.8 (`Offer`), §3.9, §3.10 (messaging payloads, grammar incl. `photo`, `OfferMessageView`, `DraftReadyView`, allergen wording), §3.11 (audit content rule), §4.1 (S-04..S-08, S-15..S-17), §4.2, §7, §8 (incl. **§8.4 verification links**), §9.0, §9.1, §9.3, §9.4, §10, §11 (ignored-sender logging), §12.
5. `docs/OWNERSHIP.md` §1–§4, §6 (Dev 2 reviews you; you review Dev 2), §7 (D-027 sub-PRs), §8 (checkpoints).
6. `docs/ARCHITECTURE.md` §4 (trust boundaries), §5.1, §5.2, §5.4, §6 (tick, worker, inbound transport, cursor), §8, §9 (canonical secret scan), §11, §13.
7. `docs/TEST_PLAN.md` §5.0 (must-run tier) and the Dev 3 section (T-MS-01..T-MS-19).
8. `docs/RESEARCH.md` R-PH-1..R-PH-11, R-INF-2, R-INF-3, R-INF-5, SP-14; `docs/DECISIONS.md` D-008..D-011, D-017, D-021, D-023, D-025..D-027, **D-031, D-032**.
9. `docs/ROADMAP.md` (cut order if behind) and `docs/plans/active/kickoff-baseline.md` (what the baseline contains).

Do **not** re-read all of `PROJECT_IDEA.md`; the approved docs supersede it.

## 3. Ownership — what you may and may not edit

| You own (exclusive) | Forbidden (open a request instead) |
|---|---|
| `src/integrations/photon/**` (incl. `http/`), `src/workflows/**` (incl. `http/`, ticker, optional listener), `tests/messaging/**` | `src/features/**`, `src/lib/**`, `src/core/**`, `src/db/**`, `src/app/**`, `src/components/**`, `src/contracts/**`, `src/server/**`, root config |
| Your own: `docs/handoffs/dev-3.md`, `docs/requests/messaging-<topic>.md`, `docs/plans/active/dev-3-<topic>.md` | All shared docs (`docs/CONTRACTS.md`, `docs/PROJECT_STATE.md`, …), `package.json`, `pnpm-lock.yaml`, `.env.example` |

- **Thin-route rule:** `src/app/api/**/route.ts` are Dev 4's one-line re-exports. You implement only the handler modules they point to: `src/integrations/photon/http/inbound`, `src/integrations/photon/http/simulated`, `src/workflows/http/tick`, `src/workflows/http/dispatch`. Adding or renaming a route is a contract change.
- **Composition-root rule:** `src/server/container` calls `createMessagingGateway({ mode, project_id, api_key })` from `@/integrations/photon` once, with config built from `getEnv()`. You own the `real` / `fake` / `misconfigured` switch inside that factory; the container never changes when you add the real adapter.
- **Barrels:** the captain created `src/integrations/photon/index.ts` and `src/workflows/index.ts` as typed stubs; you now own them. Move implementation files freely, but keep every exported name stable. Import other lanes **only** through their barrels (`@/core`, `@/db`, `@/features/intake`), types from `@/contracts`, services from `getServices()`, env from `getEnv()` (never `process.env`).

## 4. Contracts you consume and provide

**You provide (CONTRACTS §9.4, verbatim):**
- `createMessagingGateway({ mode, project_id, api_key }) → MessagingGateway`. If `mode = photon` and a key is missing, the gateway reports `status: misconfigured` and `send` returns `PROVIDER_UNAVAILABLE` (§12).
- `normalizePhotonEvent(raw: unknown) → Result<InboundMessage | DeliveryStatusEvent | { ignored: true }>`.
- `handleInbound(msg: InboundMessage) → Promise<InboundResult>`. This is the **same path** for real Photon messages and simulated-phone messages.
- `handleDeliveryStatus(evt: DeliveryStatusEvent) → Promise<void>`.
- `tick() → Promise<TickReport>`, with `TickReport = { at, expired_offers, expired_donations, offers_created, offers_sent, send_failures }`.
- `dispatchDonation(donation_id) → Promise<TickReport>`. Used only by the operator's "Dispatch now" button. There is no post-verification hook in P0: the next tick (≤ `TICK_INTERVAL_MS`) dispatches newly `eligible` donations (D-021).
- `formatDraftReadyMessage(view: DraftReadyView) → string` and the `intake_failed` template. Deterministic. "AI guess … please confirm", allergens only as "possible", the link and its expiry in `America/Los_Angeles`, automated-assistant (+ DEMO) disclosure; never "safe", "allergen-free" or "verified", never a handle or address.
- `formatOfferMessage(view: OfferMessageView) → string`. Deterministic: identical input gives byte-identical output. It never includes a street address, pickup instructions or handles (§11). It includes the §3.10 allergen wording, the deadline in `America/Los_Angeles`, the `YES <code>` / `NO <code>` instructions, STOP, and the "automated assistant" plus DEMO disclosure.
- Port `MessagingGateway` (§9.1): `send(OutboundMessage) → Promise<SendResult>`; plus `mode`, `channel` and `status` (`ok` \| `misconfigured`) properties. Fake: returns a synthetic `provider_message_id` and persists nothing. The workflow layer records every send (§8.3), and the simulated phone reads it.

**Composition root and DI (CONTRACTS §9.0, verbatim):**
- `getServices()` (`@/server/container`) `→ { vision: VisionProvider, messaging: MessagingGateway, store: DispatchStore, clock: Clock }`. A memoized process singleton (stored on `globalThis` so Next dev reuses it).
- `getEnv()` (`@/server/env`): Zod-parsed env (§12). Lanes never read `process.env` directly.
- `getActor(request)` (`@/server/session`) `→ Promise<Actor | null>`. Verifies the signed session cookie. **Ships working in the baseline.**
- `DEMO_ACTORS` (`@/contracts/fixtures/demo-actors`): Fixed UUIDs, roles and display names for every demo persona. No handles.
- Core and workflow functions take an optional last argument `deps?: { store?, clock?, messaging?, vision? }`. When it is omitted, they use `getServices()`. Tests pass `deps` explicitly. No lane imports another lane's internals or mocks it by monkey-patching.

Lane-private factories (e.g. `createInboundHandler(deps)`, `createTicker(deps)`, suggested) are fine; the exported functions above keep these exact signatures.

**You consume from Dev 2 via `@/core` / `@/db` (CONTRACTS §9.3, verbatim):**
- `createNextOffers({ donation_id }) → Promise<Result<Offer[]>>` (S-04, S-05 → `unmatched`, or S-18).
- `openOfferForSend({ offer_id }) → Promise<Result<{ offer, identity, message_view: OfferMessageView }>>`, `markOfferSendFailed({ offer_id, reason })`, `recordOfferProviderMessage({ offer_id, provider_message_id })`.
- `recordStatusEvent(evt: DeliveryStatusEvent) → Promise<"first" | "duplicate">`. A dedupe insert on `(provider, provider_event_id)`. On `first`, Dev 3 then calls `recordDeliveryStatus(evt)`, which updates the matching offer's `delivery_status`. A `failed` status on an `open` offer additionally calls `markOfferSendFailed`.
- `claimOffer(ClaimCommand) → Promise<ClaimResult>`, `declineOffer(DeclineCommand) → Promise<DeclineResult>`.
- `expireDue() → Promise<{ expired_offer_ids, expired_donation_ids, dispatchable_donation_ids }>`, `listPendingSendOffers()`, `listDispatchableDonations()`.
- `resolveIdentityByHandle(provider, handle) → Promise<MessagingIdentity | null>`, `getIdentity(identity_id)`, `joinIdentity({ identity_id, provider_space_id, provider_sender_id })`, `optOutIdentity({ identity_id })` (one transaction: cancels open offers; applies S-15, S-16 or S-17 to a held assignment; revokes a donor's live links), `findOpenOffersForCourier(courier_id)`.
- `recordInboundMessage(...)`, `recordStatusEvent(...)`, `saveInboundResult(...)`, `recordOutboundMessage(...)`, `listMessages({ identity_id? })` (masks verification tokens unless `MESSAGING_PROVIDER=fake`), `recordIgnoredInbound({ provider, provider_message_id, reason, handle_masked })`.
- `issueVerificationLink({ donation_id }) → Promise<Result<{ link_id, token, expires_at }>>` (sub-PR **2(d)**, ~7:00 PM; use your core double until then).
- `getDonationCard(actor, id)` (role-projected, §3.13), `setLastTick(at)`.
- `createDispatchStore({ kind, database_url, pglite_dir }) → DispatchStore`, `createTestClock(start)`.

**From Dev 1 via `@/features/intake` (P0, D-031):** `createDraftFromImage({ actor, image: { mime, bytes_base64 }, source: "messaging", source_ref: "<provider>:<provider_message_id>" }) → Promise<Result<DonationCard>>` for the `photo` command. Pass the bytes **as downloaded** (≤ 5 MB; no conversion library in P0). HEIC is accepted only if SP-14 showed Gemini takes it; otherwise Dev 1 returns `VALIDATION_FAILED` and you reply `intake_failed`.

**Types** (import from `@/contracts`): `InboundMessage`, `DeliveryStatusEvent`, `OutboundMessage`, `SendResult`, `InboundResult`, `OfferMessageView`, `DraftReadyView`, `MessagingIdentity`, `Offer`, `ClaimCommand`/`ClaimResult`, `DeclineCommand`/`DeclineResult`, `TickReport`, `Actor`, `Clock`, `Result`.

**Rules you must respect:** offer transitions (§4.2, incl. `open → canceled` with `recheck_failed` on a failed claim-time re-check); S-04..S-08, S-15..S-17 (you trigger them only through core); M-05 (only `joined` couriers are candidates), M-08, M-09; claim re-checks G-01, G-09, G-10 (core does them; §8.1 step 8 → `ineligible`); timers §7; idempotency §8.2, §8.3; disclosure §11 and the §3.11 audit content rule; modes and secrets §12; `.strict()` Zod for every HTTP body you parse, passthrough for Photon envelopes.

## 5. Slice 1 — first 30–60 minutes

**First-hour target (after CP0b):** steps 1–2, the grammar parser and `normalizePhotonEvent`, green (T-MS-01, T-MS-14). The rest of slice 1 is the CP1 (4:00 PM) target.

**Step 0 — Photon kickoff spikes (during 12:30–1:15 PM while the captain builds the baseline, per ROADMAP; outside the repo; no repo code).** SP-1..SP-3 take 20–30 min; then SP-14 below. Use `curl` or a throwaway script **outside the repo**, keys only in env vars:
1. Create the Beta org + project at `app.beta.photon.codes`; create a project API key with `project:read/write`, `platforms:read/write` (shown once; R-PH-2). Put it in `.env.local` only.
2. Create shared-line **assignments** for the three demo handles (donor phone, couriers A and B; R-PH-5). Text `JOIN` from your own phone first.
3. Receive it: poll received messages (`direction=received`, `createdSince`) or create a webhook destination (R-PH-6). Note `data.object.id` (`pho_msg_…`), `space.id`, `receivedBy.id`.
4. Reply via `POST /v1/projects/{id}/messages` with `Idempotency-Key`, body `spaceId`, `senderId`, `content` (check the exact `content` shape in `openapi.json`; R-PH-7). `202` = accepted, not delivered.
5. Record in `docs/handoffs/dev-3.md`: request/response IDs, latency, errors, and answers to: (a) Does an **unprompted** offer still send minutes/hours after `JOIN`? (b) Does a webhook destination reach a public URL, and **how is the signature verified** (header names, secret format)? (c) Which inbound mode will you use (`webhook` | `socket` | `poll`)? (d) If socket: is the event cursor replayable after a restart, and for how long?
6. **SP-14 photo intake (≤ 15 min, by 1:15 PM):** from the donor phone (joined), text a synthetic platter photo. Download the attachment through the API; record MIME (HEIC or JPEG), byte size, how many `ATTACHMENT_NOT_READY` retries were needed and time to bytes. Hand the bytes to Dev 1, who tests them against Gemini. **Post a go/no-go in chat by 1:15 PM.** No-go → you build photo intake only after CP2 is green, and the demo may open on web upload.
If sign-up is blocked, record UNVERIFIED and continue with fakes. Never let the spike block Slice 1.

**Slice 1 steps (fakes only, no network).** Write the failing test first for each.

| # | Build (file names "suggested" unless fixed by CONTRACTS §10 / ARCHITECTURE §11) | Tests first |
|---|---|---|
| 1 | Grammar parser `src/workflows/grammar.ts` (suggested): `JOIN`, `YES`/`ACCEPT [CODE]`, `NO`/`DECLINE [CODE]`, `STOP`, `HELP`, and `photo` (an image attachment from a donor identity; the first image wins and any text is ignored); case-insensitive; surrounding punctuation ignored; first token decides. `CODE` is uppercased and must be 4 chars from `ACDEFHJKMNPRTUVWXY3479`; anything else counts as "no code". Anything unrecognized → `unknown` | T-MS-01 |
| 2 | `normalizePhotonEvent` in `src/integrations/photon/normalize.ts` (suggested): Zod (passthrough) over the 2.0 envelope `{id, type, apiVersion, source, timestamp, data{projectId, object}}` (R-PH-8). `message.received` → `InboundMessage` keyed by `data.object.id`, with `attachments` metadata (`provider_attachment_id`, `mime`) but no bytes; `message.accepted` → `accepted`, `message.delivered` → `delivered`, `message.failed` → `failed` as `DeliveryStatusEvent`; `message.dispatched` and every other type → `{ ignored: true }`; malformed → `VALIDATION_FAILED`. `received_at` = server `Clock`, never the payload's time | T-MS-14 (normalize part) |
| 3 | `createMessagingGateway({ mode, project_id, api_key })` in `src/integrations/photon/gateway.ts` + fake `gateway-fake.ts` (suggested): fake = no network, `mode: "fake"`, `channel: "simulated"`, `status: "ok"`, deterministic `provider_message_id` (e.g. `fake_<idempotency_key>`), **persists nothing**, can be told to fail (`ok:false`) in tests. `mode = photon` with a missing key → `mode: "real"`, `status: "misconfigured"`, every `send` returns `PROVIDER_UNAVAILABLE`; never a fake | T-MS-10 (misconfigured part) |
| 4 | `formatOfferMessage(view)` and `formatDraftReadyMessage(view)` in `src/workflows/templates.ts` (suggested), plus reply templates (`join_ack`, `stop_ack`, `help`, `decline_ack`, `intake_failed`, claim results, "which code?"). Deterministic, byte-identical for identical input | T-MS-05 |
| 5 | Outbound helper `src/workflows/outbound.ts` (suggested): every send goes through it. Any purpose except `stop_ack` to an identity whose status is not `joined` → `NOT_JOINED`, `gateway.send` **not called**, attempt audited. Calls `recordOutboundMessage` exactly once per attempt in both modes (unique `idempotency_key`) | T-MS-15 (joined-only part) |
| 6 | `handleInbound` in `src/workflows/inbound.ts` (suggested) with `deps`; a local test double of the core functions in `tests/messaging/doubles/core.ts` (suggested) until Dev 2's sub-PR 2(b) is on `main` | T-MS-02, T-MS-03, T-MS-04, T-MS-15 |

**Offer text shape (illustrative; T-MS-05 fixes the required parts, the allergen sentence is mandatory wording from CONTRACTS §3.10):**

```text
Annona (automated assistant, DEMO): pickup offer K7M3.
Assorted sandwiches and wraps, 24 servings, refrigerated. Needs cold transport.
Contains (donor-declared): wheat, milk, eggs. Other major allergens: not in the donor's listed ingredients — not a guarantee. Cross-contact: none known to donor.
For Eastlake Community Pantry (synthetic). Pickup area: <pickup_area_label>.
Reply YES K7M3 or NO K7M3 by 6:12 PM. Text STOP to opt out.
```

Rules: build the text **only** from `OfferMessageView`; empty `allergens_present` renders "none declared"; deadline = `view.expires_at` rendered with a fixed `en-US` formatter in `America/Los_Angeles` (no locale default); DEMO appears when `view.demo_mode`; no street address, pickup instructions or handles; never the words "safe", "allergen-free", "certified" or "compliant" in the offer **or any reply template** (the only exception to the address rule is the `claimed` / `already_claimed_by_you` reply); identical input → byte-identical output (Photon rejects a reused `Idempotency-Key` with a different body, `422 IDEMPOTENCY_KEY_REUSED`).

`handleInbound` order: `recordInboundMessage` → if `duplicate`, return the stored result with `outcome: "duplicate"` and send nothing → `resolveIdentityByHandle(provider, sender_handle)` → no identity: outcome `ignored`, `reply: null`, never auto-register, and call `recordIgnoredInbound` (no handle, no text, **no attachment download**) → parse → act → send the reply once via the outbound helper with `Idempotency-Key: reply:<provider_message_id>:v1` (skip the send if `outbound_messages` already holds that key) → `saveInboundResult`. This order makes a reclaimed incomplete row (core returns `first` after 30 s; CONTRACTS §8.2, D-029) safe to reprocess.
- `join`: identity `awaiting_join` **or** `opted_out` → `joinIdentity({ identity_id, provider_space_id, provider_sender_id })` (sender id = `InboundMessage.provider_line_sender_id`) → `joined` with a new `joined_at`; reply `join_ack` with the "automated assistant" disclosure + STOP instructions.
- `accept`/`decline`: the identity must be `joined`; otherwise no core call and no reply (outbound is joined-only). Actor = the identity's courier. Valid `CODE` → `{ short_code }` (a stale code resolves to its own expired offer → `offer_expired`, D-026); no valid code → `findOpenOffersForCourier`: exactly one → `{ offer_id }`, else reply asking for the code. `source` = `"messaging"` (photon) or `"simulated_messaging"` (fake); `source_event_id` = `provider_message_id`.
- `stop`: `optOutIdentity({ identity_id })` (core cancels this courier's `open`/`pending_send` offers; a held `claimed` donation with no collection is released back to `eligible` with `COURIER_OPTED_OUT` (S-15) and **the next tick re-offers it**; a `collected` donation goes to `needs_review` with `COURIER_OPTED_OUT_AFTER_PICKUP` (S-17) and is never re-offered; a donor's STOP revokes their live links). The **only** reply is `stop_ack`; nothing else is ever sent to that handle until a new `JOIN`.
- `photo` (**P0, D-031**): only from a `joined` **donor** identity (an `awaiting_join`/`opted_out` donor → outcome `rejected`, `reply: null`, no download; a courier's image → help). Download the first attachment (≤ 3 attempts within 6 s on `ATTACHMENT_NOT_READY`) → Dev 1 `createDraftFromImage({ source: "messaging", source_ref: "<provider>:<provider_message_id>" })` → core `issueVerificationLink` → reply `draft_ready` built from a `DraftReadyView` (link `<APP_BASE_URL>/v#<token>`), key `draft_ready:<link_id>:v1`. On reprocessing, the same `source_ref` returns the same draft; if a `draft_ready` for it is already recorded and its link is live, send nothing. Download failure, `VALIDATION_FAILED` or an S-01 refusal → reply `intake_failed`, no draft. Keep the whole photo path under 30 s (CONTRACTS §8.4 step 10). Never log the token.
- `help`/`unknown`: help text; never assigns.

**Reply per core result (text from `message_for_actor`; addresses only from `assignment`):**

| `ClaimResultCode` / `DeclineResultCode` | Reply includes | `InboundOutcome` |
|---|---|---|
| `claimed`, `already_claimed_by_you` | Pickup + recipient `address_line`, `pickup_instructions`, `donor_pickup_by` | `processed` |
| `already_claimed`, `offer_expired`, `offer_closed`, `donation_unavailable`, `ineligible` | "No assignment was made" text only | `processed` |
| `not_authorized`, `offer_not_found` | Generic text; no offer, donor or recipient details | `rejected` |
| `declined`, `already_declined` | `decline_ack` | `processed` |

**Before CP1, also write T-MS-06..T-MS-11, T-MS-16 and T-MS-18 as failing (RED) tests** against the core and intake doubles and a test clock; scene 2 and photo intake depend on them, and they turn green in Slice 2.

**Done when:** T-MS-01..T-MS-05, T-MS-14 (normalize part), T-MS-15 pass via `pnpm test tests/messaging`; typecheck and lint pass; PR `[Dev 3] fake gateway + inbound parser` open by CP1 (Sat 4:00 PM).

## 6. Slice 2 — next increment

Wire to the real core **as soon as Dev 2's sub-PR 2(b) merges** (target CP1.5, Sat 5:15 PM; D-027): rebase on `main`, pass the real core on PGlite through `deps` in integration tests, keep the double for pure unit tests. Do not wait for 2(c).

1. **`tick()` + `dispatchDonation(donation_id)`** in `src/workflows/tick.ts` (suggested). Time comes only from the injected `Clock` (`deps.clock` or `getServices().clock`). Order: `expireDue` → `createNextOffers` for each dispatchable donation → for each `pending_send` offer: `openOfferForSend` (commits `open` + `expires_at` **before** sending; returns `{ offer, identity, message_view }`) → `formatOfferMessage(message_view)` → outbound helper with `Idempotency-Key: offer:<offer_id>:v1` → `recordOfferProviderMessage` | `markOfferSendFailed` → `setLastTick`. A losing conditional update (concurrent tick) is skipped, not an error. Tests: T-MS-06, T-MS-07, T-MS-08, T-MS-09, T-MS-11, and T-MS-16 (A and B both decline or expire → the next tick moves the donation to `unmatched` with `CANDIDATES_EXHAUSTED`; no further sends).
2. **Send failures:** `ok:false`, a not-joined courier (`courier_not_joined`, set by core in `openOfferForSend`) or a `failed` delivery event → offer `send_failed` → next candidate on the next tick; audited; **never** re-sent through the fake. No automatic resend to the same courier in P0 (§8.3). Test: T-MS-10.
3. **`handleDeliveryStatus`:** `recordStatusEvent(evt)` → on `duplicate` stop; on `first` → `recordDeliveryStatus(evt)`; a `failed` status on a still-`open` offer → `markOfferSendFailed` exactly once (agree with Dev 2 in the 2(b) review which side makes that call). Delivery events never start, extend or stop a deadline (§7).
4. **Real gateway** `src/integrations/photon/gateway-photon.ts` + `client.ts` (suggested), via `fetch` (`@photon-ai/api` is not installed; R-PH-3): `POST https://api.photon.codes/v1/projects/{project_id}/messages`, `Authorization: Bearer <api_key>`, `Idempotency-Key`, `spaceId`/`senderId` from the joined identity (`provider_space_id`, `provider_sender_id`). `mode: "real"`, `channel: "imessage"`, `status: "ok"`. Never fall back to fake. Map responses (VERIFIED SOURCE R-PH-4, R-PH-7; re-check codes against `openapi.json` at the spike):

   | Photon response | `SendResult` | Workflow effect |
   |---|---|---|
   | `202` | `ok: true`, `provider_message_id` | `recordOfferProviderMessage`; **accepted ≠ delivered** |
   | `403 SHARED_LINE_INBOUND_REQUIRED` / `SHARED_LINE_NOT_ASSIGNED` | `NOT_JOINED`, not retryable | `markOfferSendFailed` → next candidate |
   | `422 SHARED_LINE_GROUP_UNSUPPORTED` / invalid handle | `INVALID_HANDLE`, not retryable | `markOfferSendFailed` |
   | `429` + `Retry-After` | `RATE_LIMITED`, retryable | `markOfferSendFailed` (no resend in P0); worker/relay waits `Retry-After` |
   | `409 IDEMPOTENCY_REQUEST_IN_PROGRESS` | `PROVIDER_UNAVAILABLE`, retryable | `markOfferSendFailed`; log |
   | `422 IDEMPOTENCY_KEY_REUSED` | `PROVIDER_UNAVAILABLE`, not retryable | Bug in text determinism: log loudly, fix |
   | Network error, 5xx, timeout (ASSUMPTION: 10 s) | `PROVIDER_UNAVAILABLE`, retryable | `markOfferSendFailed` |
5. **Inbound route** `src/integrations/photon/http/inbound.ts`: authenticate first. Webhook mode: verify the signature on the **raw body** (Standard-Webhooks-compatible per R-PH-6; confirm header names and secret format at the spike; constant-time compare; reject stale timestamps) with `PHOTON_WEBHOOK_SECRET`. Relay mode: accept only `x-annona-internal-secret` = `ANNONA_INTERNAL_SECRET` (constant-time; missing env → reject all). Then normalize → `handleInbound` / `handleDeliveryStatus` / ignore → `{ received: true }`. Test: T-MS-14 (route part).
6. **Tick and dispatch routes** `src/workflows/http/tick.ts` (internal secret **or** an operator session via `getActor(request)`) and `src/workflows/http/dispatch.ts` (operator only) → `TickReport`.
7. **Simulated phone handlers** `src/integrations/photon/http/simulated.ts`: return **403** unless the actor is an operator, `ANNONA_DEMO_MODE=1` **and** `MESSAGING_PROVIDER=fake`. `POST /api/messaging/simulated/inbound` body `{ identity_id, text, fixture_id? }` (`.strict()`) → `getIdentity(identity_id)` must be a `fake`-provider identity → server resolves its handle and builds an `InboundMessage` (`provider: "fake"`, server-generated `provider_message_id`, `received_at` from `Clock`; `fixture_id` becomes a simulated image attachment read from `fixtures/intake/images/`, known IDs only) → the **same** `handleInbound`. The simulated thread shows the `draft_ready` link unmasked (fake mode only) so the operator can open it. `GET /api/messaging/simulated/thread?identity_id=` → `listMessages`. Test: T-MS-14 (403 when `MESSAGING_PROVIDER=photon`).
8. **Worker** `src/workflows/worker.ts` (`pnpm worker`, planned; env via `getEnv()`): loop `POST {APP_BASE_URL}/api/internal/tick` every `TICK_INTERVAL_MS` (default 5000) with `x-annona-internal-secret`. Optional relay when `PHOTON_INBOUND_MODE=socket|poll` forwards raw envelopes to the inbound route. Socket relay: checkpoint the cursor to gitignored `.data/photon-cursor` after each successfully relayed event and resubscribe from it on restart; with no checkpoint, back-fill once with a poll of received messages using `createdSince = now − 10 min` (ASSUMPTION: cursors are opaque and replay retention is undocumented, R-PH-6; measure at the spike). Poll relay: every 2 s with `createdSince`, honoring `Retry-After`. Dedupe absorbs overlap. Test: T-MS-12 (UNVERIFIED if not run).
9. **Real round trip** T-MS-13 (manual): teammate iPhone `JOIN` → offer → `YES` → `claimed`; record every `provider_message_id` in `docs/handoffs/dev-3.md`.
10. **Photo intake wired** to Dev 2's 2(d) and Dev 1's intake (T-MS-18 green on PGlite), then **T-MS-19** (manual): the donor iPhone texts a photo → `draft_ready` arrives → the link opens on the phone → submission gives `eligible`. Record `provider_message_id`s, MIME, size and download attempts. `APP_BASE_URL` must be a URL the phone can open.

Not in P0: an `offer_closed` notice to the courier after S-11 or S-16 has no contract function yet. Do not invent a hook; if the demo needs it, file `docs/requests/messaging-offer-closed-notice.md`.

**Done when:** T-MS-06..T-MS-12, T-MS-16 and T-MS-18 pass (or T-MS-12 is UNVERIFIED with reason), scenes 1–2 run on integrated `main` in fake mode by CP2, scene 1 by message runs in fake mode by CP3, and T-MS-13 and T-MS-19 are VERIFIED or UNVERIFIED-with-blocker by CP3.

## 7. Example behaviors (write these as tests)

1. **Happy path (scene 1).** *Given* courier A is `joined` and donation D is `eligible`, *when* `tick()` runs, *then* exactly one offer to A is opened and sent once with key `offer:<offer_id>:v1`; the text contains `K7M3`, the mandatory allergen sentence, `pickup_area_label`, the recipient name and a deadline in `America/Los_Angeles`, and no street address. *When* A texts `yes k7m3`, *then* `claimOffer` is called once with `{ short_code: "K7M3" }` and A's reply contains the pickup and recipient addresses.
2. **No response, then late reply (scene 2; failure).** *Given* A's offer has `expires_at` 60 s ahead (accelerated, labeled), *when* the test clock advances past `expires_at` and `tick()` runs, *then* A's offer is `expired` and B is offered `H4M9` and sent. *When* A then texts `YES K7M3`, *then* the code still resolves to A's own expired offer, the reply says the offer expired with no assignment, and B's offer is unchanged (T-MS-06, T-MS-08).
3. **Duplicate delivery (safety-critical).** *Given* B's `YES H4M9` arrives by webhook, *when* the identical `provider_message_id` arrives again (retry or poll overlap), *then* it is processed once, the second call returns the stored result with `outcome: "duplicate"`, and no second reply or send occurs (T-MS-03).
4. **Unknown sender (safety-critical, authorization).** *Given* a handle with no seeded identity texts `YES K7M3`, *when* `handleInbound` runs, *then* the outcome is `ignored`, `reply` is `null`, no core claim is attempted and no identity is created (T-MS-04).
5. **Never joined (failure).** *Given* courier C never sent `JOIN`, *when* the tick reaches C's `pending_send` offer, *then* it becomes `send_failed` (`courier_not_joined`), `gateway.send` is not called, and the next tick offers the next candidate (T-MS-10). Any non-`stop_ack` message to a non-joined identity returns `NOT_JOINED` without calling `send` (T-MS-15).
6. **STOP while claimed (safety-critical).** *Given* A holds a `claimed`, not yet `collected` donation, *when* A texts `STOP`, *then* A is `opted_out`, the donation is back to `eligible` with `COURIER_OPTED_OUT` (S-15), the next `tick()` offers B, A receives only `stop_ack`, and no `offer_closed` or other message goes to A. *Given* A had already been marked `collected`, *then* the donation is `needs_review` with `COURIER_OPTED_OUT_AFTER_PICKUP` (S-17) and no tick re-offers it. *When* A later texts `JOIN`, *then* A is `joined` again with a new `joined_at` (T-MS-15).
7. **Cutoff.** *Given* `now >= effective_cutoff_at`, *when* `tick()` runs, *then* no offer is created or sent and the donation is `expired` (T-MS-09).
8. **Exhaustion.** *Given* A declined and B's offer expired, *when* the next `tick()` runs, *then* the donation is `unmatched` with `CANDIDATES_EXHAUSTED` and nothing is sent (T-MS-16).
9. **Donor photo (scene 1 by message, T-MS-18).** *Given* the donor identity is `joined`, *when* it sends a platter image, *then* the attachment is downloaded once, `createDraftFromImage` runs once with `source_ref`, `issueVerificationLink` runs, and one `draft_ready` reply ("AI guess … possible wheat, milk, eggs … confirm here: <link>") is sent. *When* the same message is redelivered, *then* no second draft or reply exists. *Given* an unknown handle sends an image, *then* nothing is downloaded, no AI call is made, there is no reply, and only a masked log row exists.

## 8. Commands (planned at kickoff — verify first)

Run `cat package.json` first and use only scripts that actually exist. Planned names (created at kickoff): `pnpm test` (Vitest, all), `pnpm test tests/messaging` (your lane; use the exact lane-filter form the captain recorded in `docs/ARCHITECTURE.md` §3 at kickoff, and check the reported file count), `pnpm typecheck`, `pnpm lint`, `pnpm build`. If a planned script is missing or behaves differently, tell the captain. Do not add or rename scripts yourself. Never report a command as passing unless you ran it in this session and saw it pass.

Lane-specific (planned — verify):
- `pnpm worker` — tick loop + optional Photon relay (`src/workflows/worker.ts`).
- `pnpm dev` — local app for simulated-phone checks (`STORE=pglite`, `MESSAGING_PROVIDER=fake`, `ANNONA_DEMO_MODE=1`).
- `pnpm db:migrate`, `pnpm db:seed` — Dev 2's; run them only to set up your local store, never edit them.
- Spike only, outside the repo: `curl -H "Authorization: Bearer $PHOTON_API_KEY" https://api.photon.codes/v1/projects/$PHOTON_PROJECT_ID/...` (verify paths in `openapi.json`). Never paste a key into a command line that is logged or committed.

## 9. Workflow (identical for all four lanes)

**Understand → Plan → RED/GREEN → Review → Verify → Handoff.** Use **one** tool per phase. Do not run duplicate ECC and Superpowers ceremonies for the same phase. Pick ECC or Superpowers once for the whole event and stay consistent.

| Phase | Use exactly one of | Output |
|---|---|---|
| Understand | The §2 read-first list; only the code your slice touches | A 3-line restatement of the slice and the AC/test IDs it serves |
| Plan | Superpowers `writing-plans` **or** ECC `/ecc:plan` | `docs/plans/active/dev-3-<topic>.md`, ≤ 15 lines: files, tests, done criteria |
| RED/GREEN/REFACTOR | Superpowers `test-driven-development` **or** ECC `tdd-workflow` | A failing test first for every rule, parser, timer, claim or auth behavior; then minimal code; then tidy |
| Review | Optionally ECC `/code-review` (or `typescript-reviewer`) as a pre-check in your own session, **then** the human cross-lane reviewer named in `docs/OWNERSHIP.md` §6 | Comments resolved. No self-approval. |
| Verify | Superpowers `verification-before-completion` **or** ECC `verification-loop` | Real command output pasted into the PR. Anything not run is marked **UNVERIFIED**. |
| Handoff | A small PR to `main` plus an entry appended to `docs/handoffs/dev-3.md` | The §15 block |

Commit small, coherent slices on your own branch. When the captain announces a contract or shared-config merge, run `git fetch origin && git rebase origin/main` (or merge `main`) and re-run your tests. If a skill tries to start a long brainstorm or approval loop for a bounded slice, skip it: the design is already approved in `docs/`.

## 10. Missing keys and mock mode

- **No keys → fake only when chosen.** The fake gateway is selected **only** when `MESSAGING_PROVIDER` is unset or `fake`. Every test in `tests/messaging/` runs with no keys and no network.
- **Misconfigured, never silently fake.** `MESSAGING_PROVIDER=photon` with `PHOTON_PROJECT_ID` or `PHOTON_API_KEY` missing → gateway `mode: "real"`, `status: "misconfigured"`; health and the banner show it; every send returns `PROVIDER_UNAVAILABLE`.
- **Real failing → error, not fake.** A failing Photon call returns `PROVIDER_UNAVAILABLE` / `RATE_LIMITED` / `NOT_JOINED` / `INVALID_HANDLE`. Switching to fake needs an explicit env change and restart (CONTRACTS §12).
- **Visible mode.** The gateway exposes `mode` / `channel` / `status`; offers store `provider_mode`; audit events carry `mode.messaging`; `GET /api/health` shows `messaging.mode` and `messaging.status`; the UI banner reads "Messaging: SIMULATED" (Dev 4). Fake messages appear only in the labeled simulated phone, whose routes return 403 when `MESSAGING_PROVIDER=photon`.
- **Secrets and personal data.** `PHOTON_API_KEY`, `PHOTON_WEBHOOK_SECRET` (shown once at destination creation), `ANNONA_INTERNAL_SECRET`: server-only, `.env.local` only, never `NEXT_PUBLIC_*`, never logged. Teammates' handles live only in env `DEMO_COURIER_A_HANDLE` / `DEMO_COURIER_B_HANDLE` (read by Dev 2's seed; received by DM, never committed; `.env.example` leaves them empty; unset means synthetic `@example.invalid` handles, usable only with fake messaging). You create matching Photon assignments for those handles. Logs and audit `data` never hold a full handle, message text, address or pickup instructions: use `identity_id` and the last 4 characters. The repo is public: run the canonical secret scan in `docs/ARCHITECTURE.md` §9 before every push.
- **Evidence before "real".** Claim Photon only after T-MS-13 succeeds with recorded `provider_message_id`s (VERIFIED SOURCE R-SP-1: built on Photon 2.0 and live on ≥ 1 channel). Until then label all messaging **SIMULATED** in PRs, handoffs, Devpost and the video. A screenshot of the simulated phone is not a Photon integration.

## 11. Cross-lane integration points

| With | You provide | You consume | When / via |
|---|---|---|---|
| Dev 2 (core) | Calls only through `@/core` / `@/db`; T-MS tests exercising the real core on PGlite via `deps` | All §4 core functions, `createTestClock`, seeded identities (`awaiting_join`, `DEMO_ACTORS` UUIDs) | Wire as soon as sub-PR 2(b) merges (CP1.5, 5:15 PM); before CP2 |
| Dev 2 (reviewer / reviewee) | Your PRs: inbound idempotency, JOIN/STOP identity handling, sender authorization, tick idempotency, real-vs-fake labeling. You review Dev 2's PRs (gate, claim transaction, expiry, authorization) | Review OK (OWNERSHIP §6) | Every PR. **Between 4:00 and 6:30 PM Sat you are also the contract-change reviewer** (D-027): answer captain requests fast |
| Dev 1 (intake) | Photo bytes as downloaded (`source: "messaging"`, `source_ref`), and the SP-14 sample at kickoff. No dispatch call from intake (D-021); the tick picks up `eligible` donations. No HEIC conversion in P0. | `createDraftFromImage` (P1 only) | After CP2 |
| Dev 4 (UI) | `POST /api/donations/:id/dispatch` ("Dispatch now"), `POST /api/internal/tick` ("Run tick now"), simulated inbound `{ identity_id, text }` + thread routes for `/operator/phone` (hidden unless `MESSAGING_PROVIDER=fake`), `TickReport` | Thin route files, operator session, IdentitySummary JOIN status display | Routes stubbed at baseline; real handlers by CP2 |
| Captain | `createMessagingGateway` config factory; `pnpm worker` script request if missing | `getServices()`, `getEnv()`, `getActor(request)`, `APP_BASE_URL`, courier handles by DM | CP0a 1:15 PM (baseline) / CP0b 1:30 PM (all machines); requests answered ≤ 20 min |

Checkpoints: CP0a Sat 1:15 PM captain push · CP0b 1:30 PM all machines · CP1 4:00 PM slice-1 PR · CP1.5 5:15 PM Dev 2 2(a)+2(b) merged · CP2 6:30 PM fake end-to-end · CP3 9:00 PM real Photon attempted · CP4 target 9:30 PM (latest 10:15 PM) Devpost draft · CP5 Sun 7:30 AM freeze · CP6 Sun 9:30 AM final. Merge order (OWNERSHIP §7): baseline → lane slice 1 (yours: fake gateway + inbound parser) → integration per Dev 2 sub-PR (you wire on 2(b)) → shared demo DB → real providers (Photon behind `MESSAGING_PROVIDER`) → hardening.

**Judging (Sun):** you stay at the table for all three judging rounds (you run the iPhones). Shortly before **each** judge demo, every courier phone sends a fresh inbound `JOIN`, because Photon's send-permission window after a JOIN is unknown (R-PH-4; spike question (a)).

## 12. Acceptance checklist

- [ ] **AC-10** time-bound offer via Photon 2.0 Beta iMessage (`real`) or labeled `fake`; only to `joined` identities; disclosure; mandatory allergen wording; no street address — T-MS-05, T-MS-13
- [ ] **AC-11** inbound grammar, handle → joined identity, unknown handle ignored, delegation to core, reply, duplicates processed once, STOP/JOIN semantics — T-MS-01, T-MS-02, T-MS-03, T-MS-04, T-MS-14, T-MS-15, T-MS-17
- [ ] **AC-12** timeout/decline escalation via idempotent `tick`; stops at cutoff; exhaustion → `unmatched` — T-MS-06, T-MS-07, T-MS-08, T-MS-09, T-MS-11, T-MS-12, T-MS-16
- [ ] **AC-18** photo by message → draft + checklist link; unknown/non-joined senders get nothing and trigger no download; reprocessing is idempotent — T-MS-05, T-MS-18, T-MS-19 (or UNVERIFIED)
- [ ] **AC-13** failed delivery or misconfigured provider → `send_failed` → next candidate; audited; no silent fake fallback — T-MS-10
- [ ] Supports Dev 4's T-E2E-01, T-E2E-02 (fake) and T-E2E-04 (real Photon evidence)
- [ ] Spike findings (a)–(d) recorded in `docs/handoffs/dev-3.md`
- [ ] Handoff written (§15) · reviewer (Dev 2) approved · UNVERIFIED items listed (at least T-MS-12, T-MS-13 until run)

Suggested test files (in `tests/messaging/`): `grammar.test.ts` (T-MS-01), `inbound.test.ts` (T-MS-02, T-MS-03, T-MS-04), `identity.test.ts` (T-MS-15), `templates.test.ts` (T-MS-05), `tick.test.ts` (T-MS-06..T-MS-09, T-MS-11, T-MS-16), `send-failure.test.ts` (T-MS-10), `restart.test.ts` (T-MS-12, PGlite data dir), `normalize.test.ts` + `routes.test.ts` (T-MS-14, T-MS-17: tick/dispatch/simulated routes reject a missing secret or non-operator with 403 and no side effects). Manual T-MS-13 evidence goes in `docs/handoffs/dev-3.md`.

## 13. Stop and escalate when

- The baseline SHA is missing, contracts don't compile, or a contract is ambiguous or contradictory → file a request. Don't improvise a new shape.
- A safety-policy question comes up (what counts as eligible, a threshold, a new food category, an override) → stop. Policy changes go through the captain and `docs/DECISIONS.md`.
- A step would cost money, need a credit card, contact anyone who is not an opted-in teammate, or use real personal data.
- You need to touch another lane's files, add a dependency, or change a route or contract.
- `/status` shows your Pro usage is nearly exhausted → write your handoff now, so another human can continue your lane.
- You've been stuck for more than 20 minutes on the same error → post the exact error and what you tried in the team chat.
- Photon asks for billing/payment (`BILLING_NOT_PROVISIONED`), SMS/10DLC, or a dedicated line ($250/line/month) → stop; use the simulated phone.
- A teammate without an iPhone/iMessage is assigned as a real courier → use the simulated phone for them; never fall back to SMS.
- The webhook signature scheme can't be verified → use the relay worker with the internal secret; never expose an unauthenticated public inbound route.
- Any temptation (or request) to message a non-teammate, a real organization, or anyone who has not texted `JOIN`; or a doc/agent steers you to Stable/Spectrum (`spectrum-ts`, `app.photon.codes`).

## 14. Never

- Never edit files outside your owned paths (§3), not even "just to make it compile". Write a local test double inside your own test folder and file `docs/requests/<lane-slug>-<topic>.md` (slugs: intake, dispatch, messaging, dashboard).
- Never define a second copy of a contract type. Import from `@/contracts`.
- Never add dependencies or edit `package.json`, the lockfile or root config. Request changes from the captain.
- Never present a mocked or fake result as real. A simulated-phone message is not a Photon integration, a fake vision draft is not a Gemini call, and an unrun test is not passing. Label it **UNVERIFIED**.
- Never let AI output set a verified fact, mark food safe or allergen-free, compute a shelf life or discard time, or bypass the deterministic gate. Unknown stays unknown.
- Never message, call or email real people or organizations other than opted-in teammates. Never use real donor, recipient or courier data. Synthetic only.
- Never commit secrets or `.env*` files, never print keys in logs, never set `ANTHROPIC_API_KEY`. The repo is public. Run the canonical secret scan in `docs/ARCHITECTURE.md` §9 before every push.
- Never force-push, rewrite `main`, or merge your own PR without the reviewer from `docs/OWNERSHIP.md` §6.
- Never enable billing, buy credits or upgrade a plan without explicit human approval.

## 15. Handoff block

End every substantive session, and every PR description, with:

    LANE / BRANCH / COMMIT:
    DELIVERED:
    EVIDENCE (commands, passed/failed, real vs mock):
    CONTRACT CHANGES OR REQUESTS:
    BLOCKERS + SAFETY RISKS:
    INTEGRATION STEPS:
    NEXT SMALLEST ACTION:
