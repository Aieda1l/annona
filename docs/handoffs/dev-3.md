# Dev 3 handoffs — Photon messaging + timed workflows (`feat/messaging`)

Append-only. Providers are labeled **real** or **fake**. No handles, phone numbers, keys, or project/org IDs in this file (the repo is public).

## 2026-10-17 13:12 PDT — Kickoff spikes SP-1, SP-14, SP-3 (partial), SP-2 (partial)

```text
LANE / BRANCH / COMMIT: Dev 3 / feat/messaging / f750162 (baseline; spikes ran outside the repo, no repo code)
DELIVERED: Real Photon Beta (api.photon.codes/v1, plain fetch, no SDK) findings below. Answers to the prompt's spike questions (a)-(d).
EVIDENCE (commands, passed/failed, real vs mock): all REAL Photon unless stated.
CONTRACT CHANGES OR REQUESTS: none filed yet. One proposal to raise with the captain: STOP matched anywhere in a short message (see BLOCKERS).
BLOCKERS + SAFETY RISKS: see below
INTEGRATION STEPS: see below
NEXT SMALLEST ACTION: Dev 3 builds slice 1 (grammar done; normalizePhotonEvent next).
```

### SP-1 — setup and JOIN round trip: VERIFIED (real)

Beta org, project and a project API key were created through the Beta API (device login, then `POST /organizations/{org}/projects`, `POST /projects/{id}/api-keys`). Shared iMessage line, 25-assignment cap. Assignments were created for three phones (donor, courier A, courier B); each gets its own assigned line number.

| Phone | Inbound JOIN (`provider_message_id`) | Reply (`provider_message_id`) | Result |
|---|---|---|---|
| donor | `pho_msg_079ga3bt79g8v8ndxgahm96meh` | `pho_msg_3adx0zc8k5h6zvyfgdn2572w9q` | send 202 in 411 ms; delivered 4.1 s after dispatch |
| courier B | `pho_msg_1b2grby8jtgqv8y4b1tj41fx83` | `pho_msg_75n4fzwmcfht2vb728b469sn4c` | send 202 in 260 ms; delivered |
| courier A | `pho_msg_4zc58jg1q5h3q9z9jgygggcmbg` | `pho_msg_20rewn2qjehtmv31pyx2kz90ay` | send 202 in 295 ms; delivered 0.8 s after dispatch |

Observed API facts (from real calls):
- `Idempotency-Key` is required on **every** POST (a missing key returns 400 `IDEMPOTENCY_KEY_REQUIRED`), not only on sends.
- Send body: `{ spaceId, senderId, content: { type: "text", format: "plain", text } }`. `spaceId` and `senderId` come from the inbound message (`space.id`, `receivedBy.id`). The 202 body is the message record, so `provider_message_id` = its `id` (`pho_msg_...`).
- `202` is accepted, not delivered. Delivery shows later as `status: "delivered"` with `timestamps.deliveredAt` on `GET /messages`.
- Inbound message record: `{ id, status: "received", content, sentBy{handle,kind:"human"}, receivedBy{id,handle,kind:"agent"}, space{id,kind:"direct"}, timestamps.receivedAt, platform:"imessage" }`. `GET /messages?direction=...` rejects unknown values with 422; use only documented values.
- Not verified on a phone: whether each recipient saw the reply as a blue iMessage bubble (API status only).

### SP-14 — photo intake: GO on the Photon side (real)

| | JPEG | HEIC |
|---|---|---|
| Message | `pho_msg_0y74xrjqnghwzr5n9h0p47tvrc` | `pho_msg_24q018n0kvg3n9n8r2rshzftap` |
| Attachment | `pho_att_62ghkwgc13ht5rfbc6wm89jzfa` | `pho_att_7878c3qk79gq6ts8b8jv39xqvq` |
| Photon MIME (metadata and header) | `image/jpeg` | `image/heic` (Photon did **not** convert) |
| Bytes (matches reported size) | 41,497 | 1,456,484 |
| sha256 | `99db7d97b70ac3ee2889067a008304036f7ea31bc973bda755c42a10dcdb444f` | `4f72bffbdf473ebda647305e65c01d34f6c75d2b922cd7910cdafb241a332922` |
| Download | 1 attempt, 0 `ATTACHMENT_NOT_READY`, 226 ms | 1 attempt, 0 `ATTACHMENT_NOT_READY`, 230 ms |

- An inbound photo is a message with `content: { type: "attachment", attachmentId }` (no MIME on the message). MIME, size and filename come from `GET /attachments/{id}`; bytes from `GET /attachments/{id}/content` (the endpoint holds up to 10 s, then 409 `ATTACHMENT_NOT_READY` with `Retry-After: 5`).
- Gemini accepted the HEIC (reported by Dev 1; not observed by Dev 3).
- Sample: 2 downloads, one donor, idle system. Retry behavior under load is untested.

### SP-3 — send permission after JOIN: PARTIAL (real)

- An unsolicited offer-style text with no inbound since JOIN was accepted (202) and delivered to courier B at 40.2 min after JOIN and courier A at 37.9 min after JOIN.
- UNVERIFIED: any longer window; messaging a never-joined identity (no spare handle to test); the donor (excluded because photo messages refreshed their window).
- Operational note: still re-send JOIN from each courier phone shortly before each judge demo (prompt §11).

### SP-2 — inbound transport and signatures

- (a) Unprompted offer after JOIN: works at 38-40 min (see SP-3).
- (b) Webhook signature: **UNVERIFIED**. `POST /projects/{id}/webhooks/destinations` returns a one-time `signingSecret`, but the OpenAPI spec names no signature header or algorithm. No destination was created (needs a public HTTPS URL from Dev 4). Do not guess the scheme.
- (c) Inbound mode in use for the spike: **poll** (`GET /messages`, VERIFIED). Webhook and Socket.IO are UNVERIFIED (Socket.IO is not in the OpenAPI spec).
- (d) Socket cursor replay after restart: UNVERIFIED.

### Billing

- Org wallet shows a $100.00 welcome credit. No plan purchase, checkout or payment-method endpoint was called. Project billing could not be read (503 once, then 403 for a project key), so the project's plan is UNVERIFIED.

### Deviations from the prompt

- The project API key lives in the macOS Keychain, not `.env.local`. For real mode, put it in `.env.local` only at that point (server-only, never `NEXT_PUBLIC_*`). It expires 2026-10-20 00:00 UTC.
- Spike scripts and downloaded attachments are outside the repo. The earlier Spectrum/Stable project (`app.photon.codes`) created before kickoff is not used by Annona.

### BLOCKERS + SAFETY RISKS

- **STOP matching (needs captain decision).** CONTRACTS §3.10 says the first token decides, so "please stop" is `unknown` and does not opt out. Proposal: also treat STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT anywhere in a short message as `stop`. Template wording will also tell users to text STOP.
- Webhook signature scheme unknown, so inbound auth cannot be webhook-only. Use the relay worker with the internal secret.

### INTEGRATION STEPS

- Captain: a deployed HTTPS URL is needed to test webhook delivery and signing (SP-2 b).
- Env names (no values): `MESSAGING_PROVIDER`, `PHOTON_PROJECT_ID`, `PHOTON_API_KEY`, `PHOTON_WEBHOOK_SECRET`, `ANNONA_INTERNAL_SECRET`, `PHOTON_INBOUND_MODE`. Courier handles go to the captain by DM only.

## 2026-10-17 13:35 PDT — Slice 1 build (steps 1-6), uncommitted

```text
LANE / BRANCH / COMMIT: Dev 3 / feat/messaging / working tree on f750162 (baseline), NOT committed or pushed yet; no PR yet
DELIVERED: Command grammar (parseCommand), normalizePhotonEvent, fake + misconfigured gateway, offer/draft-ready/fixed-reply templates, claim-reply formatter, joined-only outbound sender, createInboundHandler (dedupe, unknown/non-joined senders, JOIN, STOP, HELP, accept/decline). Lane-private MessagingCore port + in-memory test double. Covers T-MS-01, T-MS-02, T-MS-03, T-MS-04, T-MS-05, T-MS-10 (gateway part), T-MS-14 (normalize part), T-MS-15 (joined-only, JOIN/STOP).
EVIDENCE (commands, passed/failed, real vs mock): all FAKE/in-memory, no network. pnpm test -> 8 files, 172 tests passed. pnpm typecheck exit 0. pnpm lint exit 0. pnpm build exit 0. Canonical secret scan (ARCHITECTURE section 9) over 20 changed paths: exit 1 (clean). Each behavior was written test-first and seen failing before implementation.
CONTRACT CHANGES OR REQUESTS: none filed. To raise with the captain: (1) STOP anywhere in a short message (see earlier entry); (2) core needs a way to ask whether outbound_messages already holds an idempotency key (MessagingCore.hasOutboundMessage; real adapter can use listMessages); (3) typed MessagingIdentity for core (contracts-2).
BLOCKERS + SAFETY RISKS: handleInbound for a donor photo is a stub (returns ignored, no reply) until slice 2 (T-MS-18). Core join/opt-out failures throw, so the delivery is retried rather than acknowledged. Cross-contact "unknown" renders as "unknown", never "none known to donor" (wording not in the spec; confirm). The workflows barrel handleInbound is still NOT_IMPLEMENTED: the adapter over @/core is not written (needs contracts-2 types).
INTEGRATION STEPS: Wire MessagingCore to @/core after Dev 2's sub-PR 2(b). Dev 2 reviews the slice-1 PR; no self-merge.
NEXT SMALLEST ACTION: Dev 3 commits slice 1 on feat/messaging, runs the secret scan on the staged diff, opens PR "[Dev 3] fake gateway + inbound parser".
```

## 2026-10-17 14:13 PDT — After PR #7: tick, delivery, real Photon send adapter, routes, worker (not yet pushed)

```text
LANE / BRANCH / COMMIT: Dev 3 / feat/messaging-tick (stacked on main after PR #7 merged) / commits 6c51f01, 8e85eed, cef7740 and the worker commit that follows; not pushed, no PR yet
DELIVERED: createTicker (tick, dispatchDonation), createDeliveryHandler, createPhotonGateway (real send, stubbed-fetch tested) wired into createMessagingGateway, route handlers (internal tick, dispatch, Photon inbound, simulated phone), identityFromCore, createRelay + pnpm worker (tick loop + poll relay). T-MS-06..T-MS-09, T-MS-10 (send failure, delivery, gateway mapping), T-MS-11, T-MS-14 (route part), T-MS-16, T-MS-17, T-MS-12 worker part.
EVIDENCE (commands, passed/failed, real vs mock): all FAKE / in-memory / stubbed fetch; no real Photon call in these tests. pnpm test -> 40 files, 1043 passed, 1 todo (another lane's). pnpm typecheck exit 0. pnpm lint exit 0. pnpm build exit 0. Secret scan on each commit: 0 matches. pnpm worker exits 1 with a clear message while ANNONA_INTERNAL_SECRET is unavailable (by design).
CONTRACT CHANGES OR REQUESTS: docs/requests/messaging-env-names.md (open), messaging-stop-anywhere.md (open), messaging-core-idempotency-lookup.md (open).
BLOCKERS + SAFETY RISKS: (1) Every messaging function in the real @/core is still a stub, so the barrel's handleInbound / handleDeliveryStatus / tick / dispatchDonation are still NOT_IMPLEMENTED and the app's buttons answer 501; the MessagingCore/DispatchCore/DeliveryCore adapter is the next job once sub-PR 2(b) is on main. (2) env.ts lacks ANNONA_INTERNAL_SECRET, so the internal-secret routes and the worker are closed (safe default) until the captain adds it. (3) Photon webhook signature scheme and Socket.IO are still UNVERIFIED; the inbound route accepts only the internal secret. (4) T-MS-13 (real JOIN -> offer -> YES -> claimed round trip) and T-MS-19 (real photo intake) are not run.
INTEGRATION STEPS: Captain adds the env names (request above). Dev 2 confirms the idempotency-lookup request and the courier_not_joined reason shape. Dev 3 then writes the core adapter, switches the barrel to it, and runs integration tests on PGlite.
NEXT SMALLEST ACTION: Dev 3 pushes feat/messaging-tick and opens the PR, then starts the core adapter when 2(b) merges.
```

## 2026-10-17 14:41 PDT — Response to Dev 2's review of PR #12 (feat/messaging-tick)

```text
LANE / BRANCH / COMMIT: Dev 3 / feat/messaging-tick / the commit that adds this entry; not pushed yet
DELIVERED: Fixes for every MEDIUM and the two LOW code findings in the review of PR #12.
 - M1 relay.ts: skipped (non-inbound) items now advance the cursor, so 50+ of our own sends after the cursor can no longer hide an inbound message behind a full page.
 - M2 relay.ts: cursor load/save failures are logged and survived (ten-minute window / dedupe cover them); each run-loop iteration is wrapped so an unexpected error cannot end the worker.
 - M3 gateway-photon.ts: an ambiguous send outcome (network error, timeout, 202 without an id, 5xx, 409 request-in-progress) is retried ONCE with the same Idempotency-Key before the offer is failed. Safe because Photon replays the key (confirmed live: the same message id came back, no duplicate). Definite outcomes (401, 402, 403, 422, 429) are never retried.
 - M4 tick.ts: a failed recordOfferProviderMessage is now reported (the send still counts as sent).
 - LOW relay.ts: every outgoing request has a 10 s timeout. LOW simulated.ts: GET now applies the same identity checks as POST (404 unknown, 403 non-fake).
 - Not done yet: remove the as-unknown casts for the env names once PR #14 is on main.
EVIDENCE (commands, passed/failed, real vs mock): pnpm test -> 40 files, 1063 passed, 1 todo (another lane's); typecheck 0, lint 0, build 0. Each fix has a test that failed first. All FAKE / stubbed; the idempotent-replay behavior behind M3 was observed on REAL Photon in the earlier live-send entry.
CONTRACT CHANGES OR REQUESTS: Captain approved messaging-stop-anywhere (D-039) and, in principle, messaging-env-names (PR #14). Implementing D-039 next, on its own branch.
BLOCKERS + SAFETY RISKS: M3 residual: if both attempts are ambiguous the offer is still marked send_failed although Photon may have delivered it; first-claim-wins in core still protects the donation, but courier A could hold a closed offer. Dev 2's questions about core (CONFLICT shape, courier_not_joined detail, authoritative dispatchable set) are still unanswered until 2(b).
INTEGRATION STEPS: none new.
NEXT SMALLEST ACTION: push these commits to PR #12 and reply to the review; implement D-039 in the grammar.

## 2026-10-17 14:35 PDT — Donor photo path (T-MS-18) and a live check of the normalizer (stacked on PR #12, not pushed)

```text
LANE / BRANCH / COMMIT: Dev 3 / feat/messaging-photo (stacked on feat/messaging-tick / PR #12) / see the commit that adds this entry; not pushed, no PR yet
DELIVERED: createAttachmentFetcher (exact-byte download, bounded 409 retries), createPhotoHandler (download -> Dev 1 createDraftFromImage -> issueVerificationLink -> draft_ready, intake_failed on any failure before a draft exists), createInboundHandler photo routing, fixture allowlist/reader for the simulated phone (shared with the simulated route). T-MS-18.
EVIDENCE (commands, passed/failed, real vs mock): pnpm test -> 43 files, 1093 passed, 1 todo (another lane's). typecheck 0, lint 0, build 0. Unit tests use stubbed fetch and doubles: FAKE evidence. LIVE, REAL, read-only: the 10 real Photon messages from the kickoff spike were run through the relay's envelope wrapping + normalizePhotonEvent + parseCommand: 3 JOINs -> join, 2 photos -> photo with attachment ids, 5 delivered records -> status events; space and line-sender ids present on every inbound message. This validates the polled message-record shape, NOT a webhook envelope.
CONTRACT CHANGES OR REQUESTS: none new. Open: messaging-env-names, messaging-stop-anywhere, messaging-core-idempotency-lookup. To add when contracts-2 (#10) merges: swap local TickReport for the contract's; propose return types for the 8 untyped core functions.
BLOCKERS + SAFETY RISKS: (1) draft_ready uses key draft_ready:<donation_id>:v1, not <link_id> as the prompt says: it lets a reprocessed message skip issuing a second link without knowing core's re-issue semantics. (2) The reply text contains the one-time token, so it is also stored in outbound_messages (and in the saved inbound result); the table is operator-only, but confirm that is acceptable under CONTRACTS section 8.4. (3) Download budget differs from the prompt: 3 attempts, 12 s per attempt, because the content endpoint may hold a request ~10 s before answering NOT_READY; measured live it is ready in ~230 ms. (4) Still NOT run: T-MS-19 (real photo -> draft_ready -> link opens -> eligible) and T-MS-13 (real offer round trip); both need Dev 2's 2(b)/2(d) and Dev 1's link page. (5) The photo handler is not yet wired into the barrel's handleInbound (needs the core adapter).
INTEGRATION STEPS: wire createPhotoHandler with Dev 1's createDraftFromImage, core issueVerificationLink and hasOutboundMessage, APP_BASE_URL and the attachment fetcher when the core adapter is written.
NEXT SMALLEST ACTION: Dev 3 pushes this branch as a PR after #12 merges (or rebases it onto main), then writes the core adapter when 2(b) lands.
```

## 2026-10-17 14:37 PDT — Live check of the real send adapter (REAL Photon)

```text
LANE / BRANCH / COMMIT: Dev 3 / feat/messaging-photo / this entry (evidence only, no code change)
DELIVERED: Nothing new in code. First LIVE use of createPhotonGateway (src/integrations/photon/gateway-photon.ts): the unit tests had only used a stubbed fetch.
EVIDENCE (commands, passed/failed, real vs mock): REAL Photon Beta. One synthetic message to the donor phone (already joined), reply route taken from its real JOIN. send accepted (HTTP 2xx) in 386 ms, provider_message_id pho_msg_61p0ys5ervhtmrk8q3mm0rwgwq. A second send with the same Idempotency-Key returned the SAME provider_message_id (Photon replayed it; no duplicate). Status went dispatched -> delivered, 5.5 s after dispatch (dispatchedAt 21:37:34Z, deliveredAt 21:37:40Z). The donor phone received one message (to be confirmed by the phone's owner).
CONTRACT CHANGES OR REQUESTS: none.
BLOCKERS + SAFETY RISKS: This proves the SEND leg of T-MS-13 only. Still NOT run: offer text built by tick, the courier's YES, claimOffer, and the donation reaching claimed (needs Dev 2's 2(b) and the core adapter). The script ran outside the repo and wrote nothing but this evidence.
INTEGRATION STEPS: none.
NEXT SMALLEST ACTION: write the core adapter when 2(b) lands, then run the full T-MS-13 round trip with the real couriers.
```

## 2026-10-17 16:21 PDT — Response to the reviews of PR #16 (D-039) and PR #19 (photo path)

```text
LANE / BRANCH / COMMIT: Dev 3 / feat/messaging-optout (#16) and feat/messaging-photo (#19) / see the commits that add this entry
DELIVERED:
 - #16: dropped the earlier-word blocklist from the D-039 opt-out rule, per the captain's last decision (spec PR #26). "No, stop texting me", "Decline. Stop.", "yes please stop", "join and then stop" now opt out; "yes will stop by at 5", "ACCEPT K7M3", "YES K7M3", "NO K7M3" do not. stop_ack already says "Text JOIN to opt back in" (asserted in templates.test.ts).
 - #19, Dev 2's follow-ups: (1) the 5 MB bound now holds when Photon omits sizeBytes: Content-Length over 5 MB is refused without reading the body, and a body with neither a size nor a Content-Length is refused as unavailable; (2) the MIME type actually served is re-checked as image/*; (3) Retry-After is capped at 10 s; (5) a test pins that a redelivery re-asks intake with the same source_ref but issues one link and sends one reply; (6) a missing APP_BASE_URL now logs a clear operator-visible error before throwing; (7) the process.cwd() fixture path is documented as fragile outside the demo laptop.
 - #19 item (4), DECISION: transient download failures (not_ready, unavailable) still reply intake_failed, so the donor can resend. Throwing so the delivery is retried would be safe on a webhook, but the poll relay retries the same message every 2 s in order and stops at the first one the app rejects, so a persistently failing attachment would block every later inbound message (including couriers' YES replies). Open question for Dev 2 / the captain: if they prefer throwing, the relay needs a give-up rule for a poison message first.
EVIDENCE (commands, passed/failed, real vs mock): pnpm test -> 44 files, 1203 passed, 1 todo (another lane's); typecheck 0, lint 0, build 0 on the photo branch; 1008 passed on the #16 branch. Each fix had a failing test first, except the redelivery pin and the Content-Length-vouches case, which lock in existing behavior. All FAKE / stubbed.
CONTRACT CHANGES OR REQUESTS: none new.
BLOCKERS + SAFETY RISKS: still open for Dev 2 and the captain: (a) does a repeated issueVerificationLink for one donation revoke the earlier link; (b) should the stored copy of a draft_ready message redact the one-time token (Dev 2 recommends yes; needs core). Known D-039 trade-off: "yes, don't stop sending offers" opts the sender out (JOIN undoes it).
INTEGRATION STEPS: none new.
NEXT SMALLEST ACTION: Dev 3 asks Dev 2 about item (4) and the two core questions, then rebases the photo branch onto main once #16 merges.
```
