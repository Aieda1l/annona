# BACKLOG.md — deferred ideas (not in the hackathon P0)

> **Status:** PROPOSED, 2026-10-15 (pre-event ideation). Nothing here is planned for P0, and nothing here is implemented.
> **Owner:** captain (shared doc, OWNERSHIP §2). Lanes propose additions through `docs/requests/`.
> **Labels:** VERIFIED SOURCE (R-*), DESIGN DECISION (D-*), ASSUMPTION, OPEN RISK. Any regulatory reference is prototype framing, **not legal advice**. Every revived item still needs qualified food-safety and recipient-partner review before any real use (CLAUDE.md safety rule 7).

## Promotion rule

An item moves into scope only when all of these hold:

1. **CP2 is green** (`docs/OWNERSHIP.md` §8).
2. The captain approves it.
3. It passes CLAUDE.md's gate: which acceptance criterion needs it, what simpler option exists, and what fails without it.

A promoted item gets a new AC row in `docs/MVP_SCOPE.md`, test IDs in `docs/TEST_PLAN.md`, and a decision entry. P0 work (AC-01..AC-16) always comes first.

## 1. P1 — event stretch, only after CP2 (from MVP_SCOPE §7)

| ID | Item | Owner if revived | Why deferred | Acceptance criterion it would need |
|---|---|---|---|---|
| B-01 | Recipient and donor notifications on claim (`recipient_update`, `donor_update` purposes already exist) | Dev 3 | Needs joined recipient/donor identities and more outbound paths. Not on the release gate. | One notification per claim (idempotent key). Recipient gets courier display name only. Donor gets no courier handle. Extends AC-10 and AC-09. |
| B-02 | Courier handoff by messaging: "PICKED UP" / "DELIVERED" | Dev 3 (parser) + Dev 2 (S-09/S-10) | Operator-clicked simulated handoff already covers release-gate row 8 | Grammar accepts both words only from the claiming courier. Transitions stay `simulated: true`. Duplicates are processed once. Extends AC-11 and AC-08. |
| B-03 | VEYZL audit on a real PR with a before/after fix | Captain + the finding's lane | Sponsor evidence, not a product feature. Evidence PR = the first intake/AI PR opened after CP2 (normally Dev 1's Gemini adapter); the fix lands on that PR before merge. Dropped at Sun 3:00 AM if there is no finding (D-022). | Audit check visible on the PR, plus a commit that resolves a cited finding (R-SP-3) |
| B-04 | ~~Signed donor verification link sent by message~~ **Promoted to P0 by D-031** (CONTRACTS §8.4: random token with hash-only storage instead of an HMAC-signed link; AC-17). | — | — | — |
| B-05 | ~~Capacity decrement on claim~~ **Superseded by D-029** (P0 derives `committed_servings` and re-checks it under a recipient lock at claim). Remaining idea: capacity that drains as delivered food is used | Dev 2 | P0 counts delivered donations forever (until `resetDemo`) | Operator-editable capacity or a rolling time window. |
| B-06 | ~~Donor photo intake over iMessage~~ **Promoted to P0 by D-031** (AC-18), time-boxed by SP-14; web upload stays the fallback. | — | — | — |
| B-26 | Automatic `retry_matching` from `unmatched` when a new courier joins or capacity frees up | Dev 2 + Dev 3 | Operator-triggered S-14 is enough for the demo (D-032) | A JOIN by an eligible courier re-dispatches each `unmatched` donation once, before its cutoff, with the gate re-run |
| B-27 | A new checklist link by message after `return_to_donor` (S-13), and donor status texts (listed / needs review / claimed) | Dev 3 + Dev 2 | Unprompted messages depend on Photon's unknown send window (SP-3); the checklist page already shows the result | Only to `joined` donors; one message per state change; idempotent keys |
| B-28 | Server-side HEIC → JPEG conversion and resizing for message photos | Dev 3 + Dev 1 | Adds a native image dependency; SP-14 and the iPhone "Most Compatible" setting cover the demo | Any iPhone photo under 10 MB becomes a ≤ 1.5 MB JPEG before the vision call |

## 2. P2+ — product ideas worth revisiting after the event

| ID | Item | Source | Why deferred | Acceptance criterion it would need |
|---|---|---|---|---|
| B-07 | Receiving-record export for recipients: origin, quantity, type, date; kept 90 days | R-REG-12 (WAC 246-215-09435) | Recipients' own record duty. Needs partner review of format and retention. | Per-recipient CSV built from `audit_events` with the four fields. Retention is configurable. No courier handles. |
| B-08 | Courier vehicle and transport attestations beyond `cold_transport`: clean vehicle, separate containers, insulated | R-REG-6, R-REG-7 | The P0 boolean is a recipient-attested, simulated capability | M-07 expands to each attested item. A missing attestation excludes the courier from refrigerated offers. |
| B-09 | Policy for recipients serving a highly susceptible population (HSP) | M-01; R-REG-12 (-01115 definition) | P0 excludes HSP recipients from prepared-food matching | A partner-reviewed policy row. HSP recipients match only food types that policy allows. Tests cover both paths. |
| B-10 | Hot-held food under a partner policy | D-007; R-REG-2 | Out of prototype scope (`HANDLING_OUT_OF_SCOPE`). Needs hot-holding records and hot transport. | A new policy version allows `hot_held` only with partner-approved holding evidence and hot-capable couriers. Unknown still means `needs_review`. |
| B-11 | Cooked-then-cooled food with verified cooling logs | R-REG-4; D-007 | The prototype can't verify cooling history (`COOLING_HISTORY_REVIEW`) | Structured cooling-log fields reviewed by a qualified operator. The gate stays fail-closed without them. |
| B-12 | Broadcast offers (`offer_wave_size > 1`) as the default | D-009; PRODUCT_BRIEF alternative 2 | More messages, wider disclosure, many "already claimed" replies. Shared lines need N direct JOINed spaces (R-PH-4). | Wave of N offers, exactly one winner (T-CO-16 already covers 2). No address in any offer. Losers get `already_claimed`. |
| B-13 | Routing-API ETAs instead of the synthetic haversine estimate | CONTRACTS §3.5; MVP_SCOPE §6 | Keys, cost, latency. The synthetic ETA is labeled. | M-10 uses provider ETAs with a timeout and falls back to the labeled synthetic ETA. Ranking stays deterministic. |
| B-14 | Supabase Realtime instead of 2-second polling | D-006 | Needs RLS and publication setup. Polling suffices. | Dashboard updates within 1 s of a commit. Role filtering is unchanged (AC-14, AC-09). |
| B-15 | Interop with existing networks, e.g. hand off unclaimed lots to MealConnect or Food Rescue Hero partners | R-CMP-2, R-CMP-3, R-CMP-9 | Needs partner agreements or APIs. No claims of integration. | Documented partner API, with a test that an exhausted donation (`CANDIDATES_EXHAUSTED`) is offered to the partner channel only with consent |
| B-16 | USPTO / trademark search for "Annona" | D-019; R-CMP-8 | Codename only. Not legal advice. | Search done by qualified counsel before any post-event public use |
| B-17 | Customer discovery: 8 licensed kitchens, 5 registered DFDOs, 2 rescue-network ops contacts | PRODUCT_BRIEF §11 | No interviews exist. Never fabricate quotes or sign-ups. | Interview notes with consent. Assumptions in PRODUCT_BRIEF marked validated or refuted. |
| B-18 | Honest impact metrics: claimed and delivered servings, elapsed time | MVP_SCOPE §6; PROJECT_IDEA §4 step 9 | Synthetic data would make the numbers misleading | Metrics come from `audit_events` only and are labeled synthetic or real. No hunger or CO₂ figures without a source. |
| B-19 | Real authentication to replace the passcode profile picker | D-013 | The demo picker is enough. Auth setup costs time. | Role-scoped accounts. Every CONTRACTS §11 cell is enforced by tests (extends T-CO-22). |
| B-20 | Repackaged-food ingredient/allergen disclosure for recipients | R-REG-12 (-09430) | Recipient-side duty, outside the donor flow | The recipient view prints donor-declared ingredients and all nine allergen statuses. `unknown` is shown, never hidden. |
| B-21 | Durable timer service (QStash `Upstash-Not-Before` or Inngest) | D-010; R-INF-9 | Lazy expiry + worker + manual tick suffice | Escalation happens ≤ 1 tick interval after expiry even with the worker down. Correctness tests are unchanged. |
| B-22 | Second vision provider or per-item portion segmentation (e.g. Perceptron) | R-SP-8; PROJECT_IDEA §6 P2 | Would duplicate Gemini. Not needed for the flow. | The same `VisionProvider` port and strict schema. Eval T-PE-01..08 is no worse than Gemini. |
| B-23 | Recipient-side two-stage acceptance per donation | D-009; MVP_SCOPE §6 | Standing criteria count as agreement in P0 | The recipient accepts before any courier offer. A timeout leads to the next recipient. Disclosure follows §11. |
| B-24 | Persist the Photon relay cursor in the database instead of the local file `.data/photon-cursor` | ARCHITECTURE §6; R-PH-6 | The local checkpoint plus a poll back-fill covers one demo laptop | The worker resumes from the stored cursor on any machine. Dedupe still absorbs overlap (T-MS-03). |
| B-25 | Recipient-side rejection at receipt (`rejected_at_receipt`) after inspection | CLAUDE.md safety rule 4; MVP_SCOPE §5 scene 1 ("recipient accepted after inspection") | P0 records only a simulated `delivered` with an operator note | A new state or reason recorded by the recipient or operator, audited, never reverting to `eligible`. Partner-reviewed wording. |

## 3. Explicit non-goals (not revisited without a new safety review)

| Item | Why | Source |
|---|---|---|
| Any "safe", "allergen-free", "compliant" or "certified" claim, or AI shelf-life / "safe until" estimates | AI describes, humans verify, the backend enforces | CLAUDE.md rules 1–2, 7; MVP_SCOPE §6 |
| LLM-driven conversational verification of safety facts | Hard to fail closed. Facts parsed by an LLM. | D-008; MVP_SCOPE §6 |
| Home-prepared, previously served or WAC-excluded food | Rejected by the gate (G-04, G-07) | D-007; R-REG-6, R-REG-8 |
| SMS or voice channels | 10DLC registration and per-part fees | R-PH-10; MVP_SCOPE §6 |
| Live GPS, payments, multi-region, multi-tenant, in-product multi-agent orchestration | No acceptance criterion needs them | MVP_SCOPE §6 |
| Time as a public health control | Optional procedure with written plans; not modeled | R-REG-3 |
| Implying legal protection for couriers or the platform | Neither statute names coordination platforms | R-REG-11 |
