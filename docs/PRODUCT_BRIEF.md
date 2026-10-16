# PRODUCT_BRIEF.md — Annona (Phase B: brainstorm and converge)

> **Status: PROPOSED, 2026-10-15 (pre-event ideation). Nothing is implemented.** No code, build, test run, deployment, Gemini call or Photon message exists. DubHacks Rule 10 allows ideation only before Sat Oct 17, 12:30 PM PDT (R-DH-3; D-002). Contracts: the current `docs/CONTRACTS.md`. Revised 2026-10-16 for messaging-first intake (D-031) and `unmatched` (D-032). Scope and acceptance criteria: `docs/MVP_SCOPE.md`. Decisions: `docs/DECISIONS.md`. Evidence IDs (`R-*`) refer to `docs/RESEARCH.md`.
> **Labels:** VERIFIED SOURCE (cites R-*), DESIGN DECISION (cites D-*), ASSUMPTION, OPEN RISK.
> **Food-safety framing:** "eligible" means *eligible for dispatch under the prototype operator policy, based on donor-attested records*. It never means safe, allergen-free, compliant or certified. Synthetic data only. Not legal advice.

## 1. Traceability: where each PROJECT_IDEA.md idea landed

| PROJECT_IDEA.md section | Idea | Outcome | Where / why |
|---|---|---|---|
| §1 Original idea | Donor texts a photo; agent offers "until someone accepts" | **Kept, bounded** | The donor texts a photo (D-031, AC-18) and verifies on a linked structured checklist; web upload is the fallback. The unbounded loop is replaced by escalation that stops at the cutoff, then `unmatched` (D-010, D-032; AC-12). |
| §1 Two problems | Hidden allergens; short-lived perishables | **Kept** | Nine allergens default `unknown` (G-11, G-12; D-016). Separate cutoffs and lazy expiry (D-010; CONTRACTS §7). |
| §1 Starting market | Licensed kitchens + approved recipients; UW story | **Kept, narrowed** | Licensed donors and registered DFDOs only (D-007; G-01, M-01). No UW partnership claimed (R-CMP-6). |
| §1 / header | Name "Annona", tagline | **Kept as codename** | No trademark clearance (D-019; R-CMP-8). |
| §2 Principles | AI suggests, human confirms, server enforces | **Kept** | The gate cannot accept AI output (CONTRACTS §5; T-CO-11). |
| §3 Actors | Donor, receiving org, courier, operator | **Kept** | Recipient agreement = operator-entered standing criteria (D-009). Messaging is not authorization (D-013). |
| §4 Journey steps 1–2, 4–8 | Draft, verify, gate, match, offer, atomic claim, handoff | **Kept** | MVP_SCOPE §1; CONTRACTS §4–§8. Handoff is simulated and labeled. |
| §4 Journey step 3 | Agent asks follow-up questions in chat | **Changed** | The reply carries the AI's questions and a link to a structured checklist; no LLM conversational verification (D-031; MVP_SCOPE §6). |
| §4 Journey step 9 | Outcome report, portions, elapsed time | **Deferred** | Impact metrics are out of scope (MVP_SCOPE §6); `docs/BACKLOG.md`. |
| §5 Allergens | `donor_confirmed_present` / `…_not_in_listed_ingredients` / `unknown` | **Kept, renamed** | `DonorAllergenStatus`: `present`, `not_in_listed_ingredients`, `unknown` (CONTRACTS §2). |
| §5 Temperature/time | `handling_limit_at`, `donor_pickup_by`, `offer_expires_at`, ETA + buffer | **Changed** | Kitchen-supplied `discard_by` (never computed), `donor_pickup_by`, `effective_cutoff_at`, `expires_at`; invariant = M-10 (CONTRACTS §6–§7). |
| §5 Example timed workflow | Minute 2 / 5 / 10 checkpoints | **Changed** | `response_window_seconds` 60 (demo, labeled) / 600 (CONTRACTS §3.12). |
| §6 P0 features | Eight P0 rows | **Kept** | AC-01..AC-16 (MVP_SCOPE §2). |
| §6 P1 | Pickup/delivery confirmation | **Promoted (simulated)** | S-09/S-10 with `simulated: true`. Messaging-based handoff stays P1. |
| §6 P1 | VEYZL audit; ETA ranking; impact metrics | **Mixed** | VEYZL = P1 (D-022). Synthetic ETA in M-10. Impact metrics deferred. |
| §6 P2 | Segmentation, GPS, voice, swarm, broad foods | **Deferred** | `docs/BACKLOG.md`; MVP_SCOPE §6. |
| §6 State machine | Placeholder states | **Replaced** | Canonical `DonationStatus` + S-01..S-18 (CONTRACTS §4). |
| §6 Risk tests 1–8 | Edge cases | **Kept** | MVP_SCOPE §4 edge-test map. |
| §7 Team / tooling / ownership hazard | Four lanes; `src/db` vs platform seam | **Kept, resolved** | OWNERSHIP §1–§3; D-005; D-014. |
| §8 Stack | Next.js, Gemini, Photon, Supabase, Inngest, Vercel/Railway, VEYZL, Perceptron | **Changed** | Inngest and Realtime dropped (D-010, D-006). Railway = fallback only (D-017). Perceptron not used (D-001, D-012). Stack: D-004. |
| §9 Tracks | Community Kitchen; Photon, VEYZL, SideShift; Gemini, NEXT, Commit | **Kept** | D-001 (Commit only if continuing). |
| §9 Competition | TGTG, Food Rescue US, Replate | **Expanded** | §10 below (R-CMP-1..9). |
| §9 Startup hypothesis | Buyers, $49–$299/month pricing | **Kept, UNVALIDATED** | §11 below. |
| §10 Constraints / demo | Deadlines, schedule, 3 scenes | **Kept** | D-002, D-003; OWNERSHIP §8 CP0–CP6; MVP_SCOPE §5. |
| §11 Research questions | Rules, Photon, timers, WA rules, contracts | **Answered or tracked** | RESEARCH (R-*); ARCHITECTURE §16 open risks. |

## 2. Problem statement

- **Who hurts:** licensed kitchens and caterers with small, unscheduled surplus lots (one platter or a few trays) and a short handover window. Approved recipient organizations that could use the food. Couriers who could move it.
- **What breaks today (ASSUMPTION, to validate after the event):** coordination by one-off calls and texts is slow and untracked. Scheduled route programs and app-based pings may miss last-minute small lots (R-CMP-5: Eat Happy Now's June 2025 report describes mostly scheduled rescues; broader local practice is an ASSUMPTION to validate).
- **Why AI alone fails:** a photo cannot reveal ingredients, allergens, cross-contact, temperature history or legality (R-AI-3 says always validate values; R-REG-1 lists the facts donors must supply).
- **Why "keep offering until accepted" fails:** perishable food has handling constraints and a kitchen cutoff. An optimistic loop can hand food over late or to someone unable to receive it (R-REG-2, R-REG-6, R-REG-13).
- **Problem we solve in 21.5 build hours:** turn an uncertain photo into donor-attested facts. Block on any unknown. Get one time-limited offer accepted by exactly one eligible courier, or stop cleanly at the cutoff.

## 3. Users, permissions and jobs

### 3.1 Primary users (all synthetic in the demo)

| User | Must be | Enforced by | P0 surface |
|---|---|---|---|
| **Licensed donor** (restaurant, caterer, campus dining) | `approval_status = approved` and `licensed_food_establishment = true` (simulated, operator-verified); JOINed iMessage identity for photo intake | G-01 | **iMessage:** text a photo, get an AI-guess reply and a one-time checklist link (D-031). **Fallback:** mobile web upload. Verification is always the structured checklist. |
| **Approved recipient DFDO** | `approved`, `registered_dfdo = true`, `serves_highly_susceptible_population = false`, compatible handling, allergens, capacity, hours | M-01..M-04 | None in P0. Standing criteria entered by the operator count as agreement (D-009). |
| **Eligible courier** | `approved`, JOINed iMessage identity, affiliated with the recipient, `cold_transport = true`, not busy | M-05..M-09 | iMessage via Photon, or the labeled simulated phone |
| **Operator** | Operator session (passcode-gated demo picker; D-013) | CONTRACTS §11 | Web dashboard, demo controls, simulated phone |

### 3.2 Permission matrix (mirrors CONTRACTS §11; the contract wins on any conflict)

| Data / action | Donor (own) | Courier (offered) | Courier (claimed) | Recipient (assigned) | Operator |
|---|---|---|---|---|---|
| Create draft, submit verification | ✓ | – | – | – | – |
| View donation card | own | – | – | – | all |
| Dish, servings, allergen declarations, handling mode | ✓ | ✓ (offer text) | ✓ | ✓ | ✓ |
| Donor `area_label` | ✓ | ✓ | ✓ | ✓ | ✓ |
| Donor `address_line`, `pickup_instructions` | ✓ | **✗** | ✓ | – | ✓ |
| Recipient display name | after claim | ✓ | ✓ | ✓ | ✓ |
| Recipient `address_line` | – | ✗ | ✓ | ✓ | ✓ |
| Courier name | after claim | self | self | ✓ | ✓ |
| Messaging handles | ✗ | ✗ | ✗ | ✗ | masked |
| Claim / decline | – | own offer only | – | – | ✗ (never on a courier's behalf) |
| Record handoff (simulated) | – | – | `collected` | `delivered` | ✓ |
| Operator actions, dispatch now, tick, dashboard, demo reset, simulated phone | – | – | – | – | ✓ |

No role can override an unknown or rejected fact. No "dispatch anyway" control exists (CONTRACTS §4.1, §13).

### 3.3 Jobs to be done

| User | When… | I want to… | So I can… |
|---|---|---|---|
| Licensed donor | an event ends with a refrigerated platter I can't sell | text a photo, then correct a draft and attest what I know on one checklist in about a minute | hand it to a vetted organization before my pickup cutoff, with a record of what I declared |
| Recipient DFDO | food is offered that I didn't schedule | receive only lots that match my equipment, allergen exclusions, capacity and hours | inspect on receipt and accept, without screening incompatible offers |
| Courier | I'm free for the next hour and have cold transport | get one short text with what, where (area only) and a deadline, and answer YES or NO | commit quickly, and know at once if I won, lost or was too late |
| Operator | lots are moving or stuck | see server truth: safety reviews separate from unmatched lots, reasons, offers, countdowns, JOIN status, audit trail | resolve exceptions (reject, return to donor, cancel, retry matching) without bypassing the gate |

## 4. Pitch and demo journey

### 4.1 Sixty-second pitch (≤ 150 words)

> Kitchens and caterers can end an event with trays of good refrigerated food and minutes to find it a home. Rescue networks exist, but scheduled routes and app-based pings may miss small, last-minute lots. Annona is a messaging-native intake and offer layer. A licensed kitchen texts a photo; Gemini replies with what it sees, clearly marked as a guess, plus a one-tap checklist. The kitchen confirms servings, ingredients, all nine major allergens and how the food was held. A deterministic rule gate, not the AI, decides whether the lot is eligible for dispatch under our prototype policy. Anything unknown goes to review, with plain-language reasons. Eligible lots go to a cold-capable courier affiliated with an approved pantry, as a time-limited iMessage offer via Photon. Exactly one valid YES wins; late replies get a clear "no assignment". Today it runs on synthetic data, and it does not certify food safety.

### 4.2 Twenty-second first impression (judges)

> "Text a photo, AI drafts, the kitchen verifies, unknowns block, and the first valid iMessage YES wins." On screen: the AI-guess reply on the donor phone, the guess beside donor-verified facts, then the blocked pasta tray with its reasons.

### 4.3 Demo journey (identical to MVP_SCOPE §5; all synthetic; seeded by Dev 2, scripted by Dev 4)

| Scene | What happens | Proves (release gate row) |
|---|---|---|
| **0. Setup** (before judges arrive) | The donor phone and courier phones A and B (opted-in teammates' iMessage handles) text **JOIN** to the Annona Photon line. Dashboard shows all three `joined`. **Before each judge demo**, each phone sends a fresh JOIN and gets the reply, because how long Photon keeps send permission after JOIN is unknown (RESEARCH SP-3). In fake mode, JOIN goes through the simulated phone. | Opt-in identity (R-PH-4) |
| **1. Success** | The "Rainier Catering (synthetic)" phone texts a photo of a refrigerated, prepared-cold platter of sandwiches and wraps (fallback: web upload). Annona replies "AI guess: assorted sandwiches/wraps, ~18–30 servings, possible wheat/milk/eggs" with a checklist link. On the checklist the donor sets servings to 24, declares all nine allergens from the recipe sheet and attests every handling fact. Gate → `eligible`; the next tick dispatches (D-021). Courier A (cold transport, affiliated with "Eastlake Community Pantry (synthetic)") gets an iMessage offer and replies `YES K7M3`. Donation → `claimed`; A receives the pickup address. Operator marks **simulated** `collected`, then `delivered` ("recipient accepted after inspection"). | Rows 1–6, 8 |
| **2. No response / late reply** | A ignores a 60-second **accelerated** offer. Tick expires it and offers B, who accepts. A's late `YES` gets "This offer expired — no assignment was made." | Row 7 |
| **3. Responsible refusal** | Attractive pasta tray: `cooked_then_cooled`, cold holding `unknown`, no temperature log, sesame `unknown`. Gate → `needs_review` with four plain-language reasons. No offer is created; no "dispatch anyway" button. | Row 9 |
| Optional 4 | `previously_served = yes` buffet tray → `rejected`. | Row 9 |

## 5. Workflow alternatives (exactly three; D-008 cites this section)

| | **A. Hybrid: web-verify + iMessage dispatch** | **B. Web-first app + notifications** | **C. Fully conversational iMessage LLM agent** |
|---|---|---|---|
| Donor | Mobile web upload + structured verification form | Web app for upload and verification | Sends photo by iMessage; LLM asks follow-ups in chat |
| Courier | Time-limited iMessage offer; `YES/NO <code>` grammar | Web/PWA list with email or push notifications | Chat with the LLM agent |
| Operator | Web dashboard | Web dashboard | Web dashboard |
| Key risk | Photon beta access and JOIN friction (R-PH-4, R-PH-5) | Looks like incumbents' app-based claiming (R-CMP-1, R-CMP-2, R-CMP-5) | Safety facts parsed from free text by an LLM; hard to fail closed in 21 h (R-AI-3) |

**Scores (1–5; higher is better).** Weights: user value 20%, safety 25%, feasibility for 4 humans in 21.5 build hours 25%, demo polish 15%, sponsor fit 15%.

| Criterion (weight) | A | B | C |
|---|---|---|---|
| User value (20%) | 4: no app install for couriers; structured donor form | 3: requires visiting or installing an app | 5: lowest friction for every role |
| Safety (25%) | 5: typed form with explicit `unknown`; deterministic gate | 5: same gate and form | 2: an LLM interprets attestations; ambiguity in free text |
| Feasibility (25%) | 4: Photon spike + JOIN + text grammar, with a labeled fake fallback | 5: fewest external dependencies | 2: dialogue state, parsing and evaluation on top of everything else |
| Demo polish (15%) | 4: real phone buzzing plus dashboard | 4: clean but familiar | 3: impressive when it works, fragile live |
| Sponsor fit (15%) | 5: Photon (R-SP-1/R-SP-2), Gemini, VEYZL, Community Kitchen | 2: no Photon track | 4: strong Photon story, but weak on R-SP-2 "thoughtful safety" if parsing fails |
| **Weighted total** | **4.40** | 4.00 | 3.05 |
| Raw sum (/25) | 22 | 19 | 16 |

**Recommendation — DESIGN DECISION (D-008, refined by D-031):** choose **A**, with C's donor entry point. The donor **texts the photo** (C's low friction) but verifies on A's **structured checklist**, opened from a one-time link, so no safety fact is parsed from free text. Web upload stays the fully supported fallback. B is the fallback shape if Photon access fails: offers then go through the labeled simulated phone, and the Photon track is not claimed (AC-10). C's conversational verification stays out of scope (MVP_SCOPE §6).

## 6. Perishables scoping options

| Option | Upside | Downside | Verdict |
|---|---|---|---|
| **1. Refrigerated, prepared-cold or commercially packaged only** | Matches the team's perishables problem. One holding mode (41 °F, R-REG-2). No cooling history to verify. One courier capability (`cold_transport`). | Excludes hot catering; cooked-then-cooled trays go to review. | **CHOSEN — DESIGN DECISION (D-007)** |
| 2. Mixed hot + cold | Covers more real surplus | Hot holding ≥ 135 °F in transport (R-REG-2, R-REG-7), recipient reheating to 165 °F (R-REG-12), cooling history for cooked food (R-REG-4), more matching dimensions. Too much unverifiable state for 21 h. | Rejected for P0 |
| 3. Shelf-stable only | Lowest risk; simplest gate | Weak fit with the stated problem. No real time pressure, so TTL offers and cutoffs look artificial in the demo. | Rejected |

Consequences: `hot_held`, `ambient` and `frozen` → `HANDLING_OUT_OF_SCOPE` (reject). `cooked_then_cooled` → `COOLING_HISTORY_REVIEW`. This is a **prototype restriction, not a statement of law** (D-007).

## 7. Dispatch-model options

| Option | How it works | Pros | Cons | Verdict |
|---|---|---|---|---|
| **1. Recipient-first, sequential courier offers** | Pick a compatible approved recipient; offer one affiliated courier at a time (`offer_wave_size = 1`) | Fewest messages; minimal disclosure; matches scene 2; logic still tested with wave size 2 | Slower fill if couriers ignore offers | **CHOSEN — DESIGN DECISION (D-009)** |
| 2. Courier broadcast | Offer every feasible courier at once | Fastest fill; visible race | Many "already claimed" replies; offer details sent to more people; Photon shared lines have no groups, so it is N direct messages, each needing JOIN (R-PH-4) | Kept as config only (`offer_wave_size > 1`) |
| 3. Recipient self-pickup | The recipient's own staff collect | No separate courier matching | Loses the courier claim flow that carries the Photon story; recipient staff availability unknown | Not separate in P0: recipient staff can be seeded as couriers affiliated with that recipient (M-06) |

## 8. Non-goals (hackathon)

- Any claim that food is safe, allergen-free, compliant or certified. No shelf-life or "safe until" estimate from images or AI.
- Hot-held, ambient, frozen, home-prepared, previously served or WAC-excluded food (rejected). Cooked-then-cooled food (review).
- Real donors, recipients, couriers, outreach or food movement. Only opted-in teammates receive messages, after JOIN.
- SMS, voice, Telegram or group offers. Verifying safety facts in chat text (photos arrive by message; facts are confirmed on the checklist).
- Real authentication; live GPS or routing; payments; impact or CO₂ metrics; multi-region or multi-tenant.
- LLM conversational verification; multi-agent orchestration inside the product.
- Replacing food banks or rescue networks. Integrations with them are BACKLOG, not claims.

## 9. Measurable success criteria (from MVP_SCOPE §8; targets, not results)

| Measure | Target | How shown |
|---|---|---|
| Photo → editable draft | ≤ 10 s with the real model, or labeled fake | Live demo + audit timestamps |
| Unknowns blocked | 100% of T-CO-11 single-field-unknown mutations are not `eligible` | Test output |
| Explainable rejection | Every `needs_review`/`rejected` card lists ≥ 1 plain-language reason | Scene 3 |
| Claim correctness | 1 winner across N concurrent claims (N ≥ 10) | Test output (T-CO-16) |
| Escalation | Offer B sent ≤ 1 tick interval after A expires | Scene 2 + audit timeline |
| Real messaging evidence | ≥ 1 real Photon round trip with recorded provider message IDs | T-MS-13 / T-E2E-04, or the Photon track is not claimed |

## 10. Competitive positioning

| What exists (VERIFIED SOURCE unless noted) | What it does | Implication for Annona |
|---|---|---|
| Food Rescue US (R-CMP-1) | Volunteers claim rescues in a web app; multi-state | Volunteer claiming is not new |
| Food Rescue Hero (R-CMP-2) | Rescue-ops platform, volunteer app, dashboards; 25 partner orgs | Dispatch + dashboard is not a differentiator |
| Feeding America MealConnect (R-CMP-3) | Free donor↔food bank↔agency platform; real-time donations; in-app chat since 2023 | Real-time matching and messaging both exist; our angle is no-install iMessage + TTL + atomic claim |
| Replate, Copia, Goodr, Spoiler Alert (R-CMP-4) | Managed pickups; enterprise chain-of-custody; B2B logistics + tax reporting; CPG liquidation | Don't pitch audit trails, tax tooling or matching as novel |
| Food Lifeline, Northwest Harvest, Eat Happy Now (R-CMP-5) | Regional hub; statewide network; King County volunteer app (mostly scheduled) | Seattle has rescue capacity; position as complementary |
| UW Food Pantry / gleaning; FRN chapters (R-CMP-6) | Campus pantry and dining-surplus gleaning | Never claim UW surplus goes unrecovered |
| Too Good To Go, OLIO (R-CMP-7) | Consumer resale; peer-to-peer sharing | Annona routes to approved organizations, not the public |

**Narrow niche (R-CMP-9):** a messaging-native intake-and-offer layer for last-minute small lots from licensed kitchens: AI draft → donor verification → fail-closed deterministic gate → TTL offer → atomic first claim. It complements incumbents. "We did not find" ≠ "does not exist".

**Claims we must not make:** "first food rescue app"; "first real-time donation matching"; "Seattle has no prepared-food rescue"; "UW surplus goes unrecovered"; "AI determines safety or allergen-free status"; "certified" or "compliant"; any partnership with a real organization; "replaces food banks"; "no one uses messaging for rescue"; any impact numbers (lbs, meals); that Annona confers Good Samaritan protection (R-REG-11).

## 11. Startup and business hypotheses (SideShift R-SP-4, DubHacks NEXT R-SP-6)

All rows are **ASSUMPTIONS**. No customers, interviews, sign-ups, pilots or partners exist.

| Topic | Hypothesis |
|---|---|
| Target buyer | Licensed kitchens with recurring, unpredictable surplus: campus caterers, event venues, corporate dining |
| Who pays | Donor-side kitchens and venues (subscription). Recipient DFDOs and couriers use it free, to preserve access. Alternative to test: rescue networks license the intake + gate layer. |
| Value propositions to test | Less staff time coordinating; faster confirmation; a documented record of donor-attested facts and handoffs; fewer missed donations. Never "legal protection" (R-REG-11). |
| Pricing (**UNVALIDATED, from PROJECT_IDEA §9**) | Small kitchens $49–$99/month; larger venues/caterers $149–$299/month. Experiments, not research-backed prices. |
| Distribution | Campus event organizers and sustainability groups introduce affiliated caterers. No-install iMessage lowers courier onboarding. Hand-off into existing networks (BACKLOG). |
| OPEN RISK | Willingness to pay is unknown; liability and regulatory status of platforms and couriers is unaddressed in rule text (R-REG-7, R-REG-11); the name has a prior adjacent use (R-CMP-8). |

**Post-event validation plan (only with consent; record real quotes):**

1. Interview **8 licensed kitchens/caterers**: how often do small lots go unrescued, and who coordinates today?
2. Interview **5 registered DFDOs**: what unscheduled prepared food can they receive (equipment, hours, allergen policies)?
3. Interview **2 operations contacts at existing rescue networks**: do last-minute small lots miss scheduled routes (R-CMP-5 spike)?
4. Ask the local health jurisdiction and partners about courier and platform roles before any real use (R-REG-7).
5. Kill or pivot if fewer than half of kitchens report a recurring unscheduled-surplus pain.

## 12. Track-fit narrative (D-001)

| Track | Criteria (source) | Annona evidence to show | Honesty rule |
|---|---|---|---|
| **Community Kitchen** (title) | Sustainability, community support, social good, coordination tools, equity (R-DH-7) | Coordination tool that routes surplus to community organizations with explicit safety-aware refusal | No impact numbers |
| **Photon** | Built on Photon 2.0 and live on ≥ 1 channel (R-SP-1); Vision, Craft, Depth, Traction; human-in-the-loop and safety fallback (R-SP-2) | Real iMessage JOIN → offer → YES round trip; `provider_message_id`s; STOP/HELP; late-reply handling | Claim only after T-MS-13 succeeds; traction = none beyond teammates |
| **VEYZL** | Real audit on a PR; evidence that findings changed the build (R-SP-3) | Evidence PR = the first intake/AI PR opened after CP2 (normally Dev 1's Gemini adapter); a real finding fixed by a follow-up commit on that PR before merge, with before/after (D-022) | Dropped if no actionable finding by Sun 3:00 AM |
| **SideShift** | Best startup idea; distribution story (R-SP-4) | §11 hypotheses and validation plan | No invented customers |
| **MLH Gemini API** | Real Gemini API use (R-SP-5) | Real `gemini-*` call with recorded model ID (T-IN-10) | Fake-mode output is never presented as Gemini |
| **DubHacks NEXT** | Target user, iteration, revenue potential, drive to continue (R-SP-6) | JTBD (§3.3), alternatives scoring (§5), pricing hypotheses, post-event plan | Hypotheses labeled as such |
| MLH Commit Fellowship | Working prototype + opt-in + form (R-SP-7) | Only if the team intends to continue (D-001) | — |

## 13. Proposed vs implemented

| Item | State | Evidence |
|---|---|---|
| Everything in this brief (users, flows, gate, offers, pitch, business model) | **PROPOSED** | None. No code exists as of 2026-10-15. |
| Real Gemini call, real Photon round trip, deployment, tests | **Not attempted** | Recorded only in `docs/handoffs/dev-N.md` after kickoff, as VERIFIED or UNVERIFIED |
| Customer demand, pricing, partnerships | **Unvalidated hypotheses** | §11 validation plan |

Implemented behavior is defined only by code and tests merged on `main` after Sat Oct 17, 12:30 PM PDT. The captain records it in `docs/PROJECT_STATE.md` and ARCHITECTURE §15.
