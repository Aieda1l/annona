# MVP_SCOPE.md — Annona DubHacks 2026 MVP

> **Status:** PROPOSED, 2026-10-15 (pre-event). Nothing here is implemented yet. "Done" means the listed tests were **actually run** and recorded in a handoff (`docs/handoffs/dev-N.md`). Field and state names follow the current `docs/CONTRACTS.md` (version in its header only). Test IDs are defined in `docs/TEST_PLAN.md`.

## 1. The one flow we ship

**P0 is one working end-to-end donation lifecycle:** intake → verification → safety gate (including a responsible rejection) → messaging dispatch → offer timeout → first valid claim wins → dashboard. No sophisticated feature or new infrastructure is added unless this lifecycle needs it.

**Messaging-first (D-031).** An **approved synthetic donor** (licensed kitchen) **texts a food photo** to the Annona Photon line (after a one-time JOIN). Annona replies with an uncertain AI summary and a one-time link to the mobile safety checklist. **Web upload is the fully supported fallback**: same draft code, same checklist, same gate, independently demonstrable. Photo-by-message is a **time-boxed integration risk**: if the kickoff spike SP-14 cannot reliably receive and download an iPhone photo, the team builds the web path first and returns to photo intake only after CP2 is green. The flow then runs:

1. **AI drafts** an uncertain, editable suggestion (sent back as a short summary when the photo came by message).
2. **The donor verifies** dish, servings, ingredients, all nine allergens and handling facts on the **structured checklist** (opened from the link, or from the web upload page). Nothing safety-relevant is parsed from chat text.
3. **A deterministic gate** returns `eligible`, `needs_review` or `rejected`, with plain-language reasons.
4. The server picks an **eligible recipient + cold-capable courier** with a feasible time budget.
5. **Photon 2.0** sends that courier a **time-limited offer**, or an explicitly labeled simulated phone does.
   - **Over iMessage**, the courier must first opt in by texting **JOIN**, because a Photon shared line cannot send first.
6. The courier replies `YES <code>` or `NO <code>`. **Exactly one valid claim wins.** A timeout or decline escalates to the next candidate only while the donation is still before its cutoff. If no courier is available, the donation is `unmatched` (a dispatch outcome), never `needs_review` (a safety outcome).
7. The **operator dashboard** shows server truth, including a **simulated, labeled** pickup and delivery.

Prototype scope restriction (not a legal rule): **refrigerated, ready-to-eat food that is prepared cold (sandwiches, salads, wraps) or commercially packaged, from approved licensed kitchens. Synthetic data only.** Cooked-then-cooled food goes to `needs_review`, because the prototype cannot verify its cooling history (`docs/DECISIONS.md` D-007; `docs/RESEARCH.md` R-REG-4).

## 2. In scope (P0)

| ID | Capability | Owner | Test owner | Tests (must be run) | Evidence of completion |
|---|---|---|---|---|---|
| **AC-01** | Photo → uncertain structured draft (`VisionSuggestion`, fake and real adapters), one implementation for both `messaging` and `web_upload` sources | Dev 1 | Dev 1 | T-IN-01, T-IN-02, T-IN-03, T-IN-09, T-IN-10, T-IN-11, T-PE-01..08 | Fake path tests pass. Real Gemini call recorded with model ID, or marked UNVERIFIED. |
| **AC-02** | Donor checklist (web page or link page, same `VerificationForm`): AI vs donor fields side by side, nine allergens default `unknown`, explicit attestations, `edited_from_ai` provenance | Dev 1 | Dev 1 | T-IN-06, T-IN-07, T-IN-08, T-IN-12, T-IN-13 | AI estimate 18–30 → donor enters 24 servings; `edited_from_ai` contains `servings` (T-IN-07). The form starts every allergen and attestation at `unknown` (T-IN-12). The link page reads its token from the URL fragment and submits through the same parser (T-IN-13). |
| **AC-03** | AI failure fails closed: invalid output, provider error, unusable or non-food image → `ai_status=failed` or `image_quality≠usable`, and the manual entry path still works | Dev 1 | Dev 1 | T-IN-04, T-IN-05, T-IN-09, T-IN-11, T-PE-04, T-PE-05 | Malformed-output test passes. |
| **AC-04** | Deterministic eligibility gate G-01..G-13. The policy-eligible demo facts (`scene1_eligible_facts`) yield `eligible`. **Unknown never yields eligible.** | Dev 2 | Dev 2 | T-CO-01..T-CO-11 | All gate tests pass. |
| **AC-05** | Matching + feasibility M-01..M-10, deterministic ranking. No match → `unmatched` (severity `dispatch`); `retry_matching` re-runs the gate and checks the cutoff. | Dev 2 | Dev 2 | T-CO-12, T-CO-13, T-CO-14 | |
| **AC-06** | Atomic first-valid-claim-wins and idempotent replay | Dev 2 | Dev 2 | T-CO-16, **T-CO-17 (required)**, T-CO-18, T-CO-25, T-CO-26 | PGlite race test passes **and** T-CO-17 passes on real Postgres with independent connections through the demo's connection mode (D-033). Without T-CO-17, AC-06 is **not done**, and nobody may call claims race-safe. |
| **AC-07** | Late or stale claims lose. Expiry and cutoff are enforced lazily in the claim transaction and by `expireDue`. Time is re-checked at claim (§8.1 step 8), collection and delivery. A no-show claim expires (S-16). | Dev 2 | Dev 2 | T-CO-19, T-CO-20, T-CO-21, T-CO-24, T-CO-27, T-CO-28 | |
| **AC-08** | State machine S-01..S-18 enforced (incl. post-claim time guards S-09/S-10, STOP before pickup S-15, no-show S-16, STOP after pickup S-17, non-eligible gate re-run S-18). The single Drizzle repository + migrations run on PGlite (always) and Supabase Postgres (when `TEST_DATABASE_URL` is set). Every transition is audited. | Dev 2 | Dev 2 | T-CO-15, T-CO-23, T-CO-28 | Repository tests green on PGlite. Postgres run recorded, or marked UNVERIFIED. |
| **AC-09** | Authorization + minimal disclosure (CONTRACTS §11) in core and read models | Dev 2 | Dev 2 | T-CO-22, T-CO-26, T-CO-29 | |
| **AC-17** | Verification-link security (CONTRACTS §8.4): CSPRNG token, hash-only storage, expiry `min(30 min, cutoff)`, view never consumes, atomic single consumption on successful submit, uniform 403, revocation, `resubmit_token` on `needs_review`; `createDraft` idempotent on `source_ref`; ignored senders logged without personal data | Dev 2 | Dev 2 | T-CO-30, T-CO-31 | |
| **AC-10** | Time-bound offer message via Photon 2.0 Beta iMessage (`real`), or a clearly labeled `fake` gateway. Sent **only to JOINed identities**, with an automated-assistant disclosure and no street address. | Dev 3 | Dev 3 | T-MS-05, T-MS-13 | A real send records `provider_message_id`. Otherwise **UNVERIFIED** and the Photon track is not claimed. |
| **AC-11** | Inbound handling: grammar (JOIN/YES/NO/STOP/HELP), sender handle → joined identity, delegation to core claim/decline, result reply, duplicate messages processed once | Dev 3 | Dev 3 | T-MS-01..T-MS-04, T-MS-14, T-MS-15, T-MS-17 | |
| **AC-18** | **Photo by message → draft + checklist link** (`photo` command): joined donor only; bounded attachment download; `draft_ready` reply with the AI-guess wording; `intake_failed` on unusable photos; reprocessing never creates a second draft; simulated-phone `fixture_id` path for fake mode | Dev 3 | Dev 3 | T-MS-05, T-MS-18, T-MS-19 (manual, real) | Fake path green. Real iPhone photo → Photon → `draft_ready` recorded with `provider_message_id`s and the received MIME, or **UNVERIFIED** (then the demo opens on web upload). |
| **AC-12** | Timeout/decline escalation through idempotent `tick`. Stops at cutoff. Exhaustion → `unmatched`. | Dev 3 | Dev 3 | T-MS-06..T-MS-09, T-MS-11, T-MS-12, T-MS-16 | |
| **AC-13** | Failed provider delivery → `send_failed` → next candidate, surfaced in audit/UI. No silent fallback to fake. | Dev 3 | Dev 3 | T-MS-10 | |
| **AC-14** | Operator dashboard shows server truth: statuses, reasons, field states, offers with server-derived countdowns, timeline; `unmatched` in a neutral group separate from `needs_review`. No client-side safety logic. | Dev 4 | Dev 4 | T-UI-01, T-UI-02, T-UI-03, T-UI-05, T-UI-07 | |
| **AC-15** | Truthful labeling: provider-mode banner, "Synthetic data", "DEMO: accelerated timers", "Simulated" handoff and phone. The simulated phone uses the same inbound handler. | Dev 4 | Dev 4 | T-UI-02, T-UI-04, T-E2E-01 | |
| **AC-16** | Demo readiness: integrated scenes 1–3 pass on main, scene 1 by message **and** by the web fallback; deployed (or documented local + tunnel) URL tested; video recorded; Devpost draft + final submitted | Dev 4 | Dev 4 | T-UI-06, T-E2E-01..T-E2E-06 | CP2, CP4, CP6 in `docs/OWNERSHIP.md` §8 met. |

Every P0 criterion has exactly one owner and one test owner. AC numbers are IDs, not an order (AC-17 and AC-18 were added by D-031). **Baseline gate (captain):** T-CT-01 and T-CT-02 must pass at CP0a. Cross-lane end-to-end scenes are owned by Dev 4 as captain.

## 3. Release gate (from CLAUDE.md)

The demo passes only if a reviewer can execute every row below on the integrated `main`:

| # | Release-gate step | Covered by |
|---|---|---|
| 1 | Photo (by message, or by the web fallback) → uncertain structured draft | AC-01, AC-18, T-E2E-01, T-E2E-06 |
| 2 | Human verification on the structured checklist | AC-02, AC-17, T-E2E-01 |
| 3 | Policy-eligible demo facts (`scene1_eligible_facts`; CLAUDE.md's "known-safe-for-demo scenario") pass deterministic policy | AC-04 (T-CO-01), T-E2E-01 |
| 4 | Eligible recipient/courier selection | AC-05, T-E2E-01 |
| 5 | Time-bound Photon message, or explicitly labeled fake mode | AC-10, AC-15 |
| 6 | First valid claim wins (race safety claimed only after T-CO-17 passes, D-033) | AC-06, T-E2E-01 |
| 7 | Timeout or stale claim loses | AC-07, AC-12, T-E2E-02 |
| 8 | Operator dashboard reflects server truth | AC-14 |
| 9 | Unsafe/unknown inputs are blocked | AC-04, T-E2E-03 |

## 4. Required edge tests → test IDs

| Required edge (CLAUDE.md) | Test IDs | Owner |
|---|---|---|
| Ambiguous image | T-IN-03, T-PE-02, T-PE-05 | Dev 1 |
| Unknown allergen | T-CO-09, T-IN-08 | Dev 2 |
| Missing holding history | T-CO-04 | Dev 2 |
| Non-approved donor | T-CO-02 | Dev 2 |
| Ineligible recipient | T-CO-12 | Dev 2 |
| No response | T-MS-06 | Dev 3 |
| Simultaneous claims | T-CO-16, T-CO-17 (required, real Postgres) | Dev 2 |
| Duplicate inbound event | T-MS-03 | Dev 3 |
| Late claim | T-CO-19, T-MS-08 | Dev 2 / Dev 3 |
| Cutoff reached | T-CO-08, T-CO-21, T-CO-28, T-MS-09 | Dev 2 / Dev 3 |
| Failed provider delivery | T-MS-10 | Dev 3 |
| Authorization | T-CO-22, T-CO-26, T-CO-29, T-CO-30 (verification link), T-MS-04, T-MS-17, T-MS-18 (photo from an unknown or non-joined sender), T-CT-02 (captain: session) | Dev 2 / Dev 3 |

## 5. Demo scenes (all synthetic; seeded by Dev 2, scripted by Dev 4)

0. **Setup (before judges arrive):** The donor phone and courier phones A and B (three opted-in teammates' iMessage handles) text **JOIN** to the Annona Photon line. The dashboard shows all three as `joined`. In fake mode, the same JOINs go through the simulated phone. **Before each judge demo**, each phone sends a fresh JOIN and receives the reply, because Photon's send-permission window after JOIN is unknown (RESEARCH SP-3).
1. **Success:** The donor phone for "Rainier Catering (synthetic)" **texts a photo** of a **refrigerated catering platter of sandwiches and wraps** (prepared cold). *(Fallback: the donor uploads the same photo on the web page; T-E2E-06.)*
   - Annona replies with the AI guess ("assorted sandwiches/wraps, ~18–30 servings, possible wheat/milk/eggs; please confirm") and the checklist link.
   - On the checklist, the donor corrects servings to 24, declares all nine allergens from the recipe sheet, and attests every handling fact.
   - The gate returns `eligible`.
   - Courier A (cold transport, affiliated with "Eastlake Community Pantry (synthetic)") gets an iMessage offer and replies `YES K7M3`. The donation is `claimed`, and A receives the pickup address.
   - The operator marks the **simulated** steps `collected`, then `delivered` ("recipient accepted after inspection").
2. **No response / late reply:** Courier A ignores a 60-second **accelerated** offer. The tick expires it and offers courier B, who accepts. A's late `YES` gets "This offer expired — no assignment was made."
3. **Responsible refusal:** An attractive **pasta tray**. The donor marks it `cooked_then_cooled`, cold holding `unknown`, no temperature log, and sesame `unknown`. The gate returns `needs_review` with four plain-language reasons. No offer is created, and there is no "dispatch anyway" button.

Optional fourth scene, if time allows: a `previously_served = yes` buffet tray is `rejected`.

## 6. Out of scope (non-goals for the hackathon)

- Any claim that food is safe, allergen-free, compliant or certified. No shelf-life or "safe until" estimation from images or AI.
- Hot-held, ambient, frozen, home-prepared, previously-served or WAC-excluded food (the gate rejects these). Cooked-then-cooled food (the gate sends it to `needs_review`).
- Real donors, recipients, couriers, outreach or food movement. Messaging goes only to **opted-in team members** acting as synthetic couriers, after they text JOIN.
- SMS, voice, Telegram or group-chat offers. iMessage via Photon is the only real channel; SMS needs 10DLC registration and per-part fees.
- Verifying safety facts in chat text. Photos arrive by message (D-031), but verification always happens on the structured checklist.
- Server-side image conversion or resizing (no HEIC conversion library in P0; SP-14 decides whether HEIC passes through).
- Real authentication/identity verification. The demo uses a passcode-gated synthetic role picker.
- Live GPS, routing APIs, payments, impact or CO₂ metrics, recipient-side two-stage acceptance, multi-region, multi-tenant.
- LLM-driven conversational verification over chat. The AI never asks or answers safety questions autonomously; it only drafts.
- Multi-agent orchestration inside the product.

## 7. P1 (only after CP2 is green)

| Item | Owner |
|---|---|
| Recipient + donor notifications on claim (outbound messages) | Dev 3 |
| Courier replies "PICKED UP" / "DELIVERED" (simulated handoff via messaging) | Dev 3 (parser) + Dev 2 (transition) |
| VEYZL audit on a real PR with a documented before/after fix | Captain + the owning lane of the finding |
| Automatic `retry_matching` from `unmatched` when a new courier joins | Dev 2 |
| A new checklist link by message after `return_to_donor` (S-13) | Dev 3 + Dev 2 |

P2 and later ideas: `docs/BACKLOG.md`.

## 8. Success measures for judging (measurable, honest)

| Measure | Target | How shown |
|---|---|---|
| Photo → editable draft | ≤ 10 s with the real model, or labeled fake | Live demo + audit timestamps |
| Unknowns blocked | 100% of the T-CO-11 single-field-unknown mutations are not `eligible` | Test output |
| Explainable rejection | Every `needs_review`/`rejected` card lists ≥ 1 plain-language reason | Scene 3 |
| Claim correctness | 1 winner across N concurrent claims (N ≥ 10 in the PGlite race test T-CO-16), **and** T-CO-17 on real Postgres before any race-safety claim | Test output |
| Escalation | Offer B sent ≤ 1 tick interval after A expires | Scene 2 + audit timeline |
| Real messaging evidence | ≥ 1 real Photon round trip with recorded provider message IDs | T-MS-13 / T-E2E-04, or the Photon track is not claimed |
