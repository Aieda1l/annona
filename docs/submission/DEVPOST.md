# Devpost submission draft: Annona

**Status: DRAFT for the CP4 deadline.** Everything marked `TODO(...)` must be filled by a human or deleted. Nothing in this file may claim more than the evidence table in section 9 proves. Written 2026-10-17 from the repo; re-check against `docs/PROJECT_STATE.md` before pasting.

## 1. Basics

| Field | Value |
|---|---|
| Project name | Annona |
| Tagline | Surplus food, coordinated with a human in the loop: AI describes, people verify, the backend enforces. |
| Title track | Community Kitchen (exactly one) |
| Other tracks to declare now | SideShift, DubHacks NEXT |
| Add later only with evidence (section 9) | Photon, MLH Best Use of Gemini API, VEYZL, MLH Commit Fellowship (only if the team will continue) |
| Repo | https://github.com/Aieda1l/annona (public) |
| Live demo URL | TODO(captain): deployed URL, or "runs locally; see video" |
| Video | TODO(captain): demo video link (mandatory) |

## 2. Inspiration

Commercial kitchens, caterers and campus dining halls end events with surplus prepared food, and community pantries need it, but the link between them is a phone tree. The hard part is not logistics, it is trust: what exactly is in the tray, was it held cold, and who may receive it. We built the part that is usually skipped: a workflow where the food's facts come from a person, a deterministic gate decides whether the donation may be offered at all, and the offer to a courier is time-limited and fair.

## 3. What it does

1. An approved donor kitchen sends a photo of surplus food (by iMessage through Photon when the live line is on, or by web upload).
2. An AI model writes an **uncertain, editable guess** (what it looks like, rough servings, allergens it *might* contain). It is labeled as a guess and never fills in a fact.
3. The donor opens a one-time checklist and confirms every fact themselves: ingredients, all nine major allergens, cross-contact, how the food was prepared and held, temperature log, pickup cutoff.
4. A **deterministic gate** returns `eligible`, `needs_review` or `rejected` with plain-language reasons. Unknown stays unknown. There is no "dispatch anyway" button.
5. An eligible donation is offered to one cold-capable courier at a time by message, with a deadline. The first valid `YES <code>` wins. Late, duplicate or stale replies lose cleanly.
6. An operator dashboard shows the server's truth: status, reasons, offers, the audit timeline, and a clearly labeled **simulated** collected/delivered handoff.

"Eligible" only means *eligible for dispatch under our prototype operator policy, based on donor-attested records*. It never means safe, allergen-free or compliant.

## 4. The safety design (why this is not a food-safety claim)

- **AI describes, humans verify, the backend enforces.** A photo cannot show ingredients, hidden allergens, cross-contact or holding temperature, and we say so in the product.
- **Fail closed.** If temperature history, allergens, handling, recipient suitability or the pickup cutoff is unclear, the donation goes to human review. Invalid AI output falls back to the manual form.
- **Separate concepts.** Food safety facts and the donor's pickup cutoff are different things; unmatched (no courier available) is shown neutrally and never as a safety finding.
- **Honest labels everywhere.** A persistent banner shows which providers are real or fake; the simulated phone says it is not iMessage; handoff steps say they are simulated; all people and organizations are synthetic.
- This weekend prototype is **not** certified or reviewed for any food-safety regulation and must not be used for real food without qualified local review and partner agreements.

## 5. How we built it

- Next.js 16 (App Router), React 19, TypeScript, Tailwind 4 with shadcn/ui components.
- Zod-validated contracts shared by four developers working in isolated lanes (vision/intake, gate/matching/state, messaging/workflows, dashboard/integration) through typed fixtures and thin routes.
- Drizzle ORM over Postgres (Supabase) with an in-process PGlite store for tests and local runs.
- Gemini through `@google/genai` behind a vision adapter that has a real and a deterministic fake implementation; Photon behind a messaging adapter with a real and a fake implementation. Neither provider is ever silently replaced by its fake: failures surface in the UI.
- Time-sensitive logic is designed around persisted UTC timestamps and server-side checks, never client timers. The UI renders what the server returns and computes no eligibility.
- Test-first development where practical (Vitest, Testing Library) and a documented secret scan before pushes to the public repo.

## 6. Challenges

- Making "unknown" a first-class value all the way from the form to the gate, so a missing answer can never read as "none".
- Keeping the AI useful without letting it become a source of facts (strict output validation, claim-word filtering, literal "unverified" flags).
- First-claim-wins and late-reply handling, and being honest about what has and has not been proven under concurrency.
- Coordinating four parallel branches against shared contracts without stepping on each other.

## 7. What we are proud of

- The refusal scene: an appetizing tray that the system correctly sends to human review with four plain-language reasons.
- The review culture: every lane's code is reviewed by another lane, and cross-lane review found real defects early (for example a possible phone-handle leak in CLI error output, over-eager opt-out matching, and a missing-cutoff gap). TODO(captain): before submitting, state only the ones that are merged and fixed on `main`, with the PR numbers.
- TODO(captain): add one verified number only (for example the final automated test count from the last green run on `main`, with the commit).

## 8. What is real, simulated, and not yet proven

| Capability | Status at submission |
|---|---|
| Photo to editable draft | TODO(fill from PROJECT_STATE): real Gemini call, or labeled fake |
| Donor checklist and deterministic gate | TODO: verified on integrated `main`? |
| Offer by message and first-claim-wins | TODO: real Photon round trip with message IDs, or labeled simulated phone |
| Operator dashboard reflects server state | TODO: verified on integrated `main`? |
| Pickup and delivery | **Always simulated and labeled** |
| Claim race safety | **Not claimed.** Concurrency evidence on real Postgres (T-CO-17) is required before we say it. |
| Food safety, allergen status, regulatory compliance | **Never claimed.** |

## 9. Track evidence (claim a track only when its row is filled)

| Track | What the judges need | Evidence in hand |
|---|---|---|
| Community Kitchen (title) | A working flow for community food coordination | TODO: demo video + scenes 1 to 3 passing |
| SideShift | No integration required | Declared now |
| DubHacks NEXT | Declared now | Declared now |
| Photon | Genuine Photon 2.0 usage: a real offer/claim round trip with provider message IDs and phone screenshots (T-MS-13, T-E2E-04) | TODO: fill or drop the track |
| MLH Best Use of Gemini API | A real Gemini call visible in the product (`ai_suggestion.mode = "real"`) | TODO: fill or drop the track |
| VEYZL | An audit of a PR, and proof the finding changed code | **DROPPED (D-041).** No audit ran; do not list or mention VEYZL as a track or a result |
| MLH Commit Fellowship | Working prototype, Devpost opt-in, supplemental form, intent to continue | TODO: only if the team will continue |

Rule from the team (D-001): a sponsored track is dropped, not swapped, if its evidence is missing by Sunday 8:00 AM.

## 10. What we learned

- Safety-relevant systems are mostly about refusing correctly and saying plainly what is unknown.
- Contracts and fixtures first lets four people build in parallel; independent review catches what the author cannot.

## 11. What's next

- Real partner review of the policy rules, with a food-safety professional and a receiving organization, before any real use.
- Richer matching (multiple stops, real routing), donor and recipient onboarding, and an audit export for partners.
- Concurrency evidence on real Postgres for the claim step, then wider testing with consenting participants.

## 12. Built with

TypeScript, Next.js, React, Tailwind CSS, shadcn/ui, Zod, Drizzle ORM, PostgreSQL (Supabase), PGlite, Vitest, Testing Library, Google Gemini API (`@google/genai`), Photon (iMessage), Vercel.

## 13. Team and disclosures

| Role | Name | Discord handle | Eligible (18+, college student)? |
|---|---|---|---|
| Vision and donor intake | Colin | TODO(Colin) | TODO |
| Safety gate, matching, state, database | Rui | TODO(Rui) | TODO |
| Messaging and scheduled offers | Ronnie | TODO(Ronnie) | TODO |
| Dashboard, deployment, integration | Cyrus | TODO(Cyrus) | TODO |

**AI assistance disclosure.** We used Claude Code (Anthropic) as a coding assistant on every branch, plus AI code-review agents, and Gemini inside the product. Humans reviewed and merged every change. Event rule check: TODO(captain): confirm with organizers that disclosed AI coding assistance is allowed (R-DH-12).

**Data.** Every donor, recipient and courier in the demo is synthetic. Teammates who play couriers or donors on real phones opted in, and their handles are never committed.

## 14. Submission checklist (captain)

- [ ] Draft submitted by Sat 10:30 PM PDT (internal target 9:30 PM; latest 10:15 PM) with all four contributors, Discord handles and tracks.
- [ ] First test in the real Devpost form whether a declared track can be removed later (R-SP-9); then add Photon/Gemini/VEYZL only per section 9.
- [ ] Demo video recorded and linked (mandatory); backup copy on a second device.
- [ ] Repo public, README states the prototype disclaimers, canonical secret scan clean, full-history scan Sunday 9:00 AM.
- [ ] Final submission Sunday by 9:30 AM internal (organizers' hard deadline 10:00 AM, D-003); team at the HUB Ballroom by 10:20 AM.
- [ ] No unfilled `TODO(` left: `grep -n "TODO(" docs/submission/DEVPOST.md` prints nothing, or each remaining one is deleted on purpose.
- [ ] Forbidden claims check: `grep -n -i -E "race-safe|certified|compliant|allergen-free" docs/submission/DEVPOST.md` only matches the "never claimed" lines above.
