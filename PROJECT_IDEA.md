# PROJECT_IDEA.md — Annona

> **Status:** Initial project context and hypothesis backlog, captured from the team's early DubHacks 2026 discussion on October 15, 2026. **Not** a finalized specification, implementation record, legal assessment, customer validation, or confirmation of sponsor API access. Read this **before** research, brainstorming, system design, and creation of the four developer prompts. Challenge its assumptions, retain its intent, and record accepted choices in `docs/PRODUCT_BRIEF.md`, `docs/MVP_SCOPE.md`, `docs/RESEARCH.md`, `docs/ARCHITECTURE.md`, and `docs/DECISIONS.md`.
>
> **Naming:** The team chose **Annona** to replace the working name **RescueRelay**. Annona is the Roman personification of Rome's grain supply and food provisioning. The name invokes connecting food supply with people who need it. A prior brainstorming pass suggested the tagline **“Good food finds its way.”** Naming/trademark/domain clearance is **not** complete; a food-related product using “Annona” was noted in the earlier discussion and should be checked before any commercial use.

## 1. The original idea, before refinement

**Working concept supplied by the team:**

> **Surplus food dispatcher.** A cafe, caterer, or event organizer texts a photo of leftover food. The agent identifies the dishes, estimates portions, flags common allergens, and offers the pickup to nearby volunteers or pantries by text until someone accepts. This keeps a foot in the food theme. Lanes: dish classification and portion estimates, volunteer matching, dispatch flow.

**The team's two explicit problems to solve:**

1. **Allergen identification:** Food photos cannot reveal hidden ingredients or cross-contact; inaccurate allergen conclusions can put recipients at risk.
2. **Short-lived cooked/perishable food:** Volunteers may not respond quickly enough. Food can be mishandled or held too long while the dispatcher waits, resulting in unsafe delivery. A simple “keep offering until accepted” loop is unacceptable.

The initial desired experience is **messaging-first** and ideally requires almost no new app installation for a kitchen or courier. It is an **AI-assisted coordination system**, not an AI food-safety certifier.

### One-sentence framing

**Annona turns last-minute surplus food into coordinated, time-bounded donations by combining photo-based intake, human-verified food information, eligible recipient/courier matching, and text-message dispatch.**

Alternative judge-facing pitch explored earlier: **“The AI dispatcher that gets surplus food to people, before the opportunity is lost.”** Both pitches are hypotheses to refine for accuracy and clarity.

### Why this could matter

- Kitchens and event organizers may have unsold or surplus food but insufficient time and staff to locate an appropriate recipient and courier.
- Charitable recipients and volunteers may be available, but coordination by one-off texts and calls can be slow, uncertain, or poorly tracked.
- Prepared/perishable foods make the timing, handling conditions, receiving partner's equipment/capacity, and actual pickup ETA consequential.
- Existing food-rescue services already solve parts of this problem. Annona's proposed differentiation is **low-friction, rapid-response, messaging-first dispatch for small and unpredictable donation windows, with explicit safety/uncertainty handling**—not “food rescue has never existed.”

**Potential starting market:** Licensed commercial kitchens/caterers serving campus events and nearby approved recipient organizations. This is narrower and safer to validate than coordinating arbitrary home-cooked food or sending offers to anyone nearby. A UW/campus-events story may also be compelling at DubHacks, but no partners or pilot commitments have been verified.

## 2. Product principles proposed in the conversation

**Safety-aware, not safety-certifying.** An image model can *suggest* a dish, visible ingredients, and rough serving counts. It cannot verify allergens, precise portions, temperature, cooking time, storage conditions, foodborne pathogens, cross-contact, or legality of donation from the image.

**Human confirms; server enforces.** Donors review the AI draft and supply necessary ingredient/handling facts. A deterministic backend gate, with explicit review and reject paths, applies the accepted MVP policy before any dispatch. No LLM may bypass the gate or unilaterally mark food safe.

**Recipient-first eligibility.** An approved food-distribution organization must be able and willing to accept the food; the matching courier must be authorized and capable of required handling. Do not match to arbitrary nearby people simply because they answer quickly.

**Time-sensitive, fail-closed dispatch.** Keep *handling/safety constraints* distinct from the *donor's practical pickup cutoff*. Re-evaluate state at acceptance and handoff. Missing history, expired deadlines, inappropriate transport, or unknown recipient capability means review or rejection, not an optimistic match.

**Small, real end-to-end slice.** The demo should actually connect photo intake to verification, matching, offer, claim, deadline handling, and visible system state. Reliable P0 functionality matters more than an elaborate multi-agent architecture or speculative extras.

**Truthful simulation.** Use synthetic donors, recipients, couriers, and food scenarios at the hackathon. Display when messages, delivery, timers, ETAs, or external APIs are faked/accelerated. Real perishable-food distribution requires appropriate local/regulatory and partner review and is **not** authorized by this planning document.

## 3. Actors, jobs, and trust boundaries

| Actor | What they need | Proposed capabilities | Important constraint |
|---|---|---|---|
| **Donor** — licensed café, caterer, event kitchen, or approved food source | Quickly offer eligible surplus with minimal friction | Send/upload photo; verify dish, servings, ingredients, storage/holding history, location, pickup window; confirm pickup | Must provide information the model cannot establish |
| **Receiving organization** — pantry, shelter, registered nonprofit, etc. | Know what can be accepted within operating hours and capacity | Maintain accepted categories, hours, storage/receiving ability, location, consent; acknowledge receipt | Food-source and handling requirements vary; eligibility needs verification |
| **Volunteer courier** — authorized by relevant organization | Make a quick, clear decision about a feasible rescue | Receive a time-limited offer; accept/decline; view necessary instructions; confirm pickup/drop-off | May require appropriate transport, temperature control, authorization and availability |
| **Dispatcher/operator** | See and resolve exceptions | Review unknowns, monitor offers/timeouts, cancel/pause dispatch, audit events | Cannot infer safety or override required facts without documented authority |

The SMS/messaging channel is a convenience layer, **not** an authorization mechanism by itself. Protect recipient information, volunteer location/contact details, and role-specific actions; reveal the minimum details required for a legitimate assignment.

## 4. Candidate user journey (proposed MVP)

1. **Receive image.** A known donor messages Annona a photo of surplus food (or uploads via a donor web fallback). The real messaging channel should be tested early.
2. **Make a draft.** A multimodal model suggests dish/description, visible ingredients, *possible* allergens, and a portion estimate or range. All AI output is labeled unverified.
3. **Collect key facts.** The agent asks targeted follow-up questions for donor-confirmed quantity, ingredients and cross-contact information, holding/cooling/storage history, donor eligibility, handling requirements, pickup location, and latest pickup availability. An original label/recipe is preferable to image inference for allergens.
4. **Verify/review.** The donor verifies or corrects the draft; unknown fields remain `unknown`. The deterministic safety/eligibility policy decides `eligible`, `needs_review`, or `rejected` for the specific prototype scenario. “Eligible to dispatch according to supplied records” does **not** mean guaranteed safe for consumption.
5. **Find feasible handoff.** Filter approved recipients by accepted food category, capacity, location, business hours, equipment, and required transport; then find eligible couriers. Estimate whether pickup, travel, and handoff fit the documented deadline with a buffer. If no feasible option exists, stop/escalate.
6. **Make offers.** Send a concise, time-limited message to appropriate candidates; include confirmed quantity, pickup window, special requirements, and an accept/decline interaction. If no answer, decline, delivery failure, or timeout, escalate to the next candidate only while still eligible.
7. **Claim atomically.** Exactly one eligible claim wins. Retries, duplicates, concurrent replies, and late accepts must not create multiple active assignments.
8. **Confirm handoff.** Donor/courier/receiving organization record pickup and delivery or cancellation, with an auditable activity log and a dashboard that displays *server truth*. For judging, actual transportation/receipt is simulated and labeled.
9. **Report outcome.** Show count of claimed/completed test rescues, confirmed/estimated portions (appropriately labeled), elapsed time, and explicit unclaimed/rejected outcomes. Do not invent hunger impact or environmental impact figures.

### Example conversation skeleton (illustrative only)

- Donor: *[sends photo of pasta trays]*
- Annona: “This looks like pasta with tomato sauce; I estimate roughly 15–25 servings. Please confirm the dish, number of servings, ingredients/allergens, and how it has been held. A photo cannot verify those.”
- Donor: Supplies verified data and a pickup cutoff.
- Annona: “Thanks. I will offer this only after required information and the participating recipient's acceptance conditions are confirmed.”
- Courier: “Annona offer: approved pickup, 18 confirmed servings, pickup by 6:30 PM, handling requirements attached. Reply ACCEPT or DECLINE.”
- Late courier: “This offer is no longer available; no assignment was made.”

The example is **not** a claim that the food is legally acceptable or safe.

## 5. Allergen and perishability design questions

### Allergens

US FDA major allergen categories commonly used in relevant prompts/UX: **milk, eggs, fish, crustacean shellfish, tree nuts, peanuts, wheat, soy, sesame**. The system should show whether an allergen is `donor_confirmed_present`, `donor_confirmed_not_in_listed_ingredients`, or `unknown`; it must not equate absent from a photo with truly absent. Ask about ingredient/recipe source and known cross-contact where relevant. Recipient policy should explicitly handle uncertainties; never promise an item is “allergen-free” from AI classification.

### Temperature and time

Important distinction discussed: **cooked food does not necessarily spoil on a fixed countdown from a photo.** Safe handling depends on the food type, prior storage/temperature history, approved processes, hot/cold holding, transport and applicable law. Washington and King County rules may differ in application from general USDA consumer leftovers guidance. **Research exact requirements and have qualified partners review them; do not hardcode a universal ‘2-hour/4-hour safety rule’ as if it applies to all cases.**

Recommended conservative prototype scope for research: **verified refrigerated prepared food from approved commercial sources with compatible, participating recipient organizations**. Hot-held food, mixed handling, foods with uncertain history, and arbitrary homemade leftovers can be explicitly out of scope for P0.

Treat the following as distinct values:

- `handling_limit_at` or recorded eligibility cutoff: only when based on the applicable verified policy and sufficient facts; otherwise **unknown**.
- `donor_pickup_by`: how late the kitchen is willing/able to hand food over.
- `offer_expires_at`: the deadline for one courier/recipient to respond.
- `estimated_arrival_at`, `travel_duration`, and a conservative handoff buffer: operational feasibility, never proof of safety.

An illustrative operational invariant (not a regulation):

`estimated_pickup + travel + handoff + buffer <= applicable_verified_cutoff`

Re-evaluate this before each offer and claim. An acceptance does not reset the food's handling history. If no feasible match exists, close or request review; never dispatch to “save the meal” at the expense of uncertainty.

### Example timed workflow

The prior discussion included **demo-only** example checkpoints: donor confirmation at minute 0; offer near minute 2; unanswered offer escalates around minute 5; broader matching/operator review around minute 10; hard stop by the verified/donor cutoff. These are **sample scheduler intervals, not food safety thresholds**. Choose real retry intervals through testing and demonstrate accelerated intervals transparently during judging.

## 6. Proposed features and scope

| Priority | Proposed feature | Evidence of completion |
|---|---|---|
| **P0** | Image-to-editable food draft | Real or explicitly mocked image call returns structured, visibly uncertain results |
| **P0** | Donor verification/ingredient handling | Server stores donor-confirmed facts distinct from model suggestions |
| **P0** | Deterministic safety/eligibility gate | Missing history and incompatible cases fail closed; tests demonstrate it |
| **P0** | Synthetic approved donors, recipients, couriers | Eligible/ineligible matches are explainable |
| **P0** | Time-bound message offer, claim/decline | Real Photon response is target, honest mocked fallback is separately labeled |
| **P0** | Timeout and next-candidate escalation | No response or decline does not stall forever; cutoff prevents new offers |
| **P0** | First-claim-wins, dedupe, late-claim rejection | Concurrent/duplicate/stale replies tested |
| **P0** | Responsive dashboard/status timeline | User can see donation, safety status, offers and outcomes |
| **P1** | Pickup/delivery confirmation | Actor-associated event log and simulated delivery scenario |
| **P1** | VEYZL PR audit with actual remediation | Audit result, changed code, and recheck shown |
| **P1** | ETA-aware ranking and impact metrics | Measurable ranking logic and honestly labeled analytics |
| **P2** | Portion segmentation, live GPS, voice, multi-agent swarm, broad foods | Backlog only after end-to-end MVP works |

**Illustrative state machine:**

`photo_received → draft_ready → awaiting_donor_verification → eligibility_review → eligible → matching → offer_sent → claimed → pickup_confirmed → delivered`

Branches: `needs_review`, `rejected`, `no_match`, `offer_declined`, `offer_timed_out`, `cutoff_reached`, `cancelled` and `delivery_failed`. These names are placeholders; the four developers must agree on a **single** typed canonical state machine and durable state semantics before implementing separate lanes.

### Risk/edge-case acceptance tests

1. Ambiguous/wrong image or visually plausible dish with hidden allergen.
2. Donor cannot verify allergens or storage/holding history.
3. Unapproved donor, incompatible recipient, or courier missing handling equipment.
4. A courier never responds; alternate offer is sent while within cutoff.
5. Late accept, two simultaneous accepts, duplicate inbound event and retried outbound event.
6. Failed outbound message, provider outage, expired deadline, server restart between sleep and claim.
7. Pickup/arrival facts change after assignment; pause/cancel as appropriate.
8. Unauthorized access to another actor's donation or contact/location details.

Use focused tests with proof of actual execution; no dashboard-only simulation should stand in for backend correctness.

## 7. Four-developer team, tooling and operating model

**Team:** Four developers, all comfortable using Claude Code / “vibecoding,” each with an individual **Claude Pro subscription**. A Pro subscription does not imply unlimited usage or automatically include third-party API credits. Choose model/effort based on availability and cost; do not hardcode access to an unavailable Claude version. Claude Code sessions can use **Everything Claude Code (ECC)** and optionally **Superpowers**, but should not duplicate lengthy planning/review rituals.

**Agreed high-level workflow goal:** One master Claude Code bootstrap conducts **research → bounded brainstorming → system design → shared contracts/ownership → four specialized bootstrap prompts**. After approval and a committed baseline, four humans use their separate Claude Code sessions to implement in parallel on isolated branches/worktrees with mutually exclusive file ownership. They all follow the custom repository `CLAUDE.md` workflow: **understand → scope → plan → test → implement → independent review → verify → handoff**.

| Developer lane | Proposed work | Integration boundary |
|---|---|---|
| **Dev 1: vision and intake** | Gemini image understanding, structured output schema, uncertainty handling, donor correction/verification UX/API | `analyzeFood`, `prepareDraft`, `verifyDonorInput` against shared contract |
| **Dev 2: safety, matching, dispatch state** | Rule gate, approved recipient suitability, candidate ranking, authoritative donation/offer statuses, atomic claims, cutoff invariants | `evaluateEligibility`, `findMatches`, `claimOffer` and persistence semantics |
| **Dev 3: messaging and timers** | Photon 2.0 beta onboarding, inbound/outbound messaging, media support spike, accept/decline parsing, events, retries/escalation and mock adapter | `dispatchOffer`, `onInboundMessage`, timeout events; cannot override server eligibility |
| **Dev 4: dashboard, infra and integration** | Operator dashboard and UI components, deployment, DB wiring as coordinated, E2E flows, Devpost/demo integration | Read-only/review actions through canonical APIs and shared status contract |

**Ownership hazard:** A previous plan used Dev 2 for `src/db/**` and migrations while Dev 4 handles platform integration; coordinate that seam explicitly. Shared files such as `src/contracts/**`, root package/config, global migrations, `docs/ARCHITECTURE.md` and `docs/PROJECT_STATE.md` must have a single owner/integration captain. Preserve real `git` conflicts rather than clobbering teammate changes.

**Planned repo assets:** `CLAUDE.md`; `BOOTSTRAP_MASTER.md`; `PROJECT_IDEA.md` (this file); `prompts/dev-01...04.md`; `.claude/settings.json`; and `docs/` containing `PRODUCT_BRIEF`, `MVP_SCOPE`, `RESEARCH`, `ARCHITECTURE`, `CONTRACTS`, `DECISIONS`, `OWNERSHIP`, `TEST_PLAN`, `ROADMAP`, `BACKLOG`, `PROJECT_STATE`, plans, and handoffs. Treat this file as the **initial seed**; after the master bootstrap, signed-off design artifacts should supersede assumptions while linking back to it.

### Working agreements

- All four branches/worktrees start from the same published baseline commit.
- Shared TypeScript types/contracts and error envelopes are approved before parallel coding. Use deterministic fake adapters where external services are unavailable, but **never imply mocks are real calls**.
- ECC is a skill/tool library, not a reason to spawn agents needlessly. Superpowers is optional and complementary. Subagents are bounded and quota-aware; independent review is required for safety, auth, concurrency and deadline behavior.
- Model providers may be used for **suggestions** and conversational UX, not safety decisions or state transitions that require deterministic policy.
- No unapproved real-person outreach, live perishable rescue, destructive action, spending, secrets in Git, or claims of regulatory certification.
- Prompt development should be measurable: schema-driven outputs, relevant few-shot examples with ambiguous and unsafe cases, prompts versioned in the repo, evaluation cases and prompt changes documented. This approach was informed by the team's attached Google *Prompt Engineering* paper by Lee Boonstra (February 2025), but it needs validation against the chosen model and APIs.

## 8. Candidate system design and technology (NOT locked in)

Initial stack proposed during brainstorming:

| Layer | Candidate | What to validate |
|---|---|---|
| Web/UI | **Next.js + TypeScript + Tailwind + shadcn/ui** | Fast deployment, accessible donor/operator UI, shared types |
| Vision/structured extraction | **Gemini API** + Zod or equivalent validation | Image/media inputs, schema correctness, cost, latency and ambiguous-case behavior; may qualify for MLH Gemini API track |
| Messaging | **Photon 2.0 beta** | Actual qualifying beta integration, supported message channels, media intake, inbound replies, delivery receipts, credentials and event semantics |
| Database / realtime | **PostgreSQL via Supabase** | Transactional first-claim-wins, row-level access, reliability, app synchronization |
| Durable delays | **Inngest** or a simpler persisted deadline + worker | Whether a new service is truly required, after comparing implementation burden |
| Hosting | **Vercel / Railway** or one simpler host | Persistent worker support vs request-based runtime, public webhook/event connectivity |
| Safety audit | **VEYZL** | Actual GitHub-linked audit, PR check, remediation evidence and hackathon access |
| Optional vision alternative | **Perceptron Mk1** | Sponsor eligibility, API access, advantage over Gemini, track cap and workload |

**Simplicity gate:** Do not add a tool/service purely to chase prizes. The master research should compare 2–3 stack/workflow alternatives and select the minimum set supporting a real demo. Photon 2.0 beta is **not interchangeable** with legacy Spectrum SDK docs. API shape, installation, prices and availability must be reverified at setup time. An AI-powered matching explanation is optional; authoritative filters and claim logic should be deterministic.

### Logical architecture (to refine)

```text
DONOR (photo + verified answers)            COURIER (claim/decline)
               \                            /
                       PHOTON 2.0
                    inbound/outbound
                           |
                 INTAKE / MESSAGING API
                           |
               DISPATCH STATE MACHINE  <--- operator dashboard
               /          |          \
      GEMINI draft     POSTGRES       timed workflows
      (unverified)    source of truth  (retry/expiry)
                           |
                 AUDITABLE HANDOFF
```

Potential shared API contracts, to be designed rather than assumed stable: `analyzeFood(image)`, `verifyDonation(data)`, `findMatches(donation)`, `dispatchOffer(donation,candidate)`, `claimOffer(offer,actor)`, `recordHandoff(donation,actor,event)`.

Persist server timestamps in UTC; derive all acceptance and dispatch conditions on the server. A frontend countdown is informational. Real and fake provider adapters must be explicit.

## 9. DubHacks track strategy (initial recommendation)

**One mandatory title track:** **Community Kitchen**. It directly matches accessibility/equity, community support, sustainable food redistribution and food waste reduction. Other titles: **Cook Smarter** also fits agents/automation/logistics; **Chef's Choice** fits creative AI UX; **Visa: Reimagine Shopping** is a weaker fit because the product is not a consumer shopping/payment flow. Submit to **exactly one** title track, not all plausible titles.

**Up to three sponsored side tracks (initial recommended combination):**

1. **Photon 2.0 — Messaging Agent:** The project naturally lives in messaging; must actually use Photon 2.0 and at least one supported channel. Beta was announced for October 15; real access/qualification must be checked.
2. **VEYZL — Best Use of VEYZL:** An unusually relevant reason to show an AI safety/control audit. The sponsor wants an **actual GitHub PR audit and concrete before/after changes**, not merely an installed tool or passing screenshot. Useful example to investigate: a photo-derived allergen absence incorrectly leading to automatic eligibility; verify whether the audit truly detects it before claiming so.
3. **SideShift — Best Startup Idea:** No SideShift integration required per the supplied rules. Show credible buyer, go-to-market strategy, and distribution/virality hypothesis (e.g., campus events and caterers). It is a business concept prize, not evidence of current market traction.

**Sponsored alternate:** **Perceptron AI** could replace one of the above if using Mk1 materially improves image reasoning and the limited-cap event spot is secured. **T-Mobile** focuses on phone-shopping journeys, **SpaceXAI** on Cursor plus Grok Imagine/Voice, and **Cloudforce** lacks sufficient challenge detail in the supplied text, so they were not favored. Do not enter more than three sponsored tracks.

**Non-sponsored tracks (multiple allowed):** prioritize **MLH Best Use of Gemini API**, **DubHacks NEXT** (target customer, iteration, revenue potential), and **MLH Commit Fellowship** if interested and the separate supplement is completed. Possible but lower priority: Tiger Data, Backboard, MongoDB Atlas, Vultr, Solana, GoDaddy Registry, MLH DEV writing challenge; **Best Freshman Beginner's Project** only if all four members are freshmen. Avoid sponsor sprawl: prizes require truthful real usage and consume implementation time.

### Competition and positioning

Known adjacent categories discussed: **Too Good To Go** (discounted excess food sales), **Food Rescue US** (volunteer donor/recipient matching), **Replate** (managed food donations and logistics). The proposed differentiation is **agent-assisted rapid dispatch for small perishable last-minute donations using existing messaging channels and a transparent eligibility gate**. Verify features and local availability before claiming superiority. Annona is not the first food rescue coordination platform.

### Early startup hypothesis (NOT validated pricing)

- Customers: campus event operators, university catering partners, commercial kitchens, venues with recurring last-minute surplus.
- Receiving nonprofits: possible free tier to preserve access.
- Hypothetical small kitchen pricing: **$49–$99/month**; larger venue/caterer plans **$149–$299/month**; these are **experiments, not research-backed prices**.
- Value propositions to test: less staff time coordinating, faster confirmation, documented handoffs, operational reporting, and fewer avoidable missed donations.
- Distribution hypothesis: campus event organizers and sustainability groups introduce Annona to affiliated catering providers; participating organizations may share verified impact reports.
- Research task: speak with real potential donors and recipient nonprofits if permitted, note actual quotations/consent, and do not invent customer interviews, signups or partnerships.

## 10. Hackathon constraints and demo plan

**Event:** DubHacks 2026, Saturday October 17–Sunday October 18, 2026. The team's pasted Hacker Guide supplies the detailed rules. Website/Devpost and guide sometimes display **different Sunday submission times**; use the **earlier 10:00 AM Sunday cutoff**, plus an internal **9:30 AM completed-submission target**, until organizers resolve that discrepancy. The guide provided in chat states:

- Hacking begins **Sat Oct 17 at 12:30 PM**.
- Devpost **draft due Saturday 10:30 PM** with project overview and selected tracks.
- **Final Devpost hard deadline Sunday 10:00 AM** per guide (other materials were previously observed listing 10:30 AM; re-verify).
- Record and submit a **presentation video**; the pasted guide warns that teams without video cannot judge.
- Entire team should be on-site at the HUB Ballroom around **10:20 AM Sunday** for the judging workshop; check the hacker profile for assigned judging/lunch rounds and any Discord changes; stay at assigned table as required.
- Presentation should be **under three minutes** plus Q&A, with judges also covering applicable side tracks. Visa judging follows a separate virtual-video process, not recommended here.
- Scoring weights from the user-provided rubric: **functionality 30%, track applicability 30%, design 20%, creativity 20%**. A robust full workflow is a higher-value target than isolated flashy demos.
- Submission work must comply with official event start/build rules. The bootstrap kit is planning material; confirm whether pre-event scaffolding is permissible before committing submitted code.

**Suggested schedule for the four developers:**

| When (Pacific) | Internal target |
|---|---|
| Sat 12:30–1:30 PM | API credential spikes, repo baseline, agreed contracts/ownership |
| 1:30–4:30 PM | Four independent feature lanes |
| 4:30–6:30 PM | Photo → verification → eligibility → mock dispatch integrated |
| 6:30–8:30 PM | Live Photon claim if feasible; first completed rescue simulation |
| 8:30–10:00 PM | Edge cases; prepare required Devpost draft |
| By 10:30 PM | Draft submitted |
| 10:30 PM–12:30 AM | VEYZL review, targeted fixes, polish |
| Overnight | Preserve working build, rotate breaks/rest, do not risk mainline |
| Sun 7:30–9:00 AM | Record video, confirm deployment and backup demo |
| By Sun 9:30 AM | Final submission checked and locked |

**Three key demo scenes:**

1. **Success:** Known commercial donor uploads a photo; AI drafts a dish/portion hypothesis; donor verifies holding/ingredients; deterministic rules allow an approved recipient/courier offer; courier claims; dashboard moves through simulated handoff to completion.
2. **No response:** First courier ignores or declines a short *accelerated-for-demo* offer; Annona escalates to a second eligible courier and rejects the first person's late reply.
3. **Reject unsafe uncertainty:** Attractive-looking food, but donor cannot establish holding history or ingredients; Annona refuses autonomous dispatch and explains what is missing.

The best demo combines an impressive positive action **and** a responsible refusal. Consider recording a real messaging conversation as a backup if venue connectivity fails. A minimal polished dashboard should show donation photo, proposed vs donor-confirmed data, audit trail, offers, cutoff, and event timeline. Label all numbers/donations as synthetic if synthetic.

## 11. Research questions the master bootstrap MUST answer before locking architecture

- What do **official** DubHacks rules permit before 12:30 PM Saturday, and which submission deadline is authoritative? Are there new sponsor announcements?
- Is Photon 2.0 beta available to the team? Can it receive media over the desired channel and process replies? Which SDK/docs actually apply? What free tiers, limits and setup steps exist?
- What is the simplest durable offer timer that survives deployment restarts? Can a single backend process and Postgres handle it without Inngest?
- What exactly qualifies a Washington/King County donation and receiving organization in this MVP? Which questions require a qualified operator rather than guessed business logic?
- Is the proposed refrigerated-only scope the right demo constraint, and can it be represented honestly using fake records?
- How will allergen uncertainties, quantities, handling evidence, time feasibility and authorization be represented in shared types?
- How should recipient agreement and courier eligibility be modeled without pretending volunteers themselves are food banks?
- How should the transaction handle concurrent claims and duplicate Photon events? What constitutes delivery failure/cancellation?
- Which real sponsor APIs/credits are available, and how many sponsored track requirements can actually be demonstrated?
- What exact file ownership/shared contracts let all four humans work simultaneously with minimal conflicts?
- What will a judge see in the first 20 seconds, and what fallback if a live API goes down?
- Which hypotheses about paying customers and recipient pain are unsupported and need interviews after the event?

## 12. Primary references and status

**Directly supplied by the team:** Detailed pasted DubHacks 2026 title tracks, sponsored/non-sponsored challenges, judging/deadline rules and official rubric; original product paragraph; desired four Claude Pro/vibecoding team workflow; `CLAUDE.md` reference workflow; Google *Prompt Engineering* PDF.

**URLs to independently verify during master research:**

- DubHacks site: <https://dh26.dubhacks.co/>
- DubHacks 2026 Hacker Guide (the prior assistant could not independently open the full Notion page): <https://dubhacks.notion.site/The-DubHacks-26-Hacker-Guide-15dff32c1d7e83748aac8154036aa658>
- DubHacks 2026 Devpost/rules: <https://dubhacks-2026.devpost.com/> and <https://dubhacks-2026.devpost.com/rules>
- Photon 2.0 beta: <https://photon.co/beta> (also check current Photon documentation and channel requirements)
- Photon sponsor guide supplied by team: <https://somethingreat.notion.site/Hackathon-Guidelines-for-Photon-2-0-3f8e443f36bb81f9893fed0d08a4c01d>
- WA DOH food donations: <https://doh.wa.gov/community-and-environment/food/food-worker-and-industry/charity-food-donations>
- King County donated food: <https://kingcounty.gov/en/dept/dph/health-safety/food-safety/donating-food>
- Gemini multimodal docs: <https://ai.google.dev/gemini-api/docs/image-understanding>
- ECC upstream: <https://github.com/affaan-m/ECC>
- Superpowers upstream: <https://github.com/obra/superpowers>

**Important evidence distinction:** Earlier research in the conversation suggested the above technologies, regulations, and competitive context. The master must independently re-check mutable details, confirm sponsor criteria, and distinguish **verified facts**, **assumptions**, **design choices**, and **open risks** in `docs/RESEARCH.md`. Do not treat a link in this seed brief as evidence that the linked content was successfully retrieved today.

---

## Instructions to the future Annona planning session

1. Start by reading this file, then `CLAUDE.md`, `BOOTSTRAP_MASTER.md`, and any current `docs/` state.
2. Keep **Annona** as the project name. Preserve the motivating problem and safety/uncertainty constraints while challenging feature, stack, business, and sponsor recommendations.
3. Research current official sources, generate 2–3 bounded alternatives, make explicit tradeoffs, and **replace hypotheses with agreed, testable requirements**.
4. Produce a shared architecture and exact versioned contracts before dividing coding work.
5. Generate **four developer-specific bootstrap prompts** from the chosen design, with mutually exclusive file ownership, dependencies, tests, a real/mock API plan, integration points, and a common ECC/Claude workflow.
6. Do not assume any application feature has already been built simply because it is described here.
