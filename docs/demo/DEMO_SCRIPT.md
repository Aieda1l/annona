# Annona demo script (DRAFT, not yet rehearsed)

Owner: Dev 4. Written 2026-10-17 from `docs/MVP_SCOPE.md` §5, `docs/CONTRACTS.md` and the UI on `main` plus open PRs.
**Status: every step below is UNVERIFIED until T-E2E-06, T-E2E-02, T-E2E-03 (CP2) and T-E2E-01 (CP3) pass on integrated `main`.**
Several live routes were still 501 stubs when this was written, and `LinkVerification` (the `/v` checklist) was a placeholder. When a step is rehearsed, replace its `UNVERIFIED` tag with the date, the commit and who ran it.

## 0. What we say, and what we never say

- Say: "AI describes, humans verify, the backend enforces." "Eligible" means *eligible for dispatch under the prototype operator policy, based on donor-attested records*.
- Say: every donor, recipient and courier is synthetic. Pickup and delivery are **simulated**. The banner shows which providers are fake.
- Never say: safe, allergen-free, certified, compliant, or that claims are "race-safe" or "concurrency-tested" (D-033: T-CO-17 on real Postgres has not passed). Never present the simulated phone as iMessage or Photon, a fake AI draft as Gemini, or a simulated handoff as real food movement.
- Photon track claim needs a real `provider_message_id` and phone screenshots (T-E2E-04). Gemini track needs a real call (`ai_suggestion.mode = "real"`). If the banner says FAKE or SIMULATED, we are showing the labeled fallback, and we say so.

## 1. Words to avoid in anything typed or captioned during the demo

D-039 (narrowed): `STOP`, `STOPALL` and `UNSUBSCRIBE` in a short text message opt that phone out, and "stop by / at / in / off / over" is exempt. Do not type those words in courier or donor messages. An image caption is never an opt-out, but keep captions plain anyway ("sandwich platter, 24 portions"). A false opt-out is recovered by texting `JOIN`. D-039 requires the reply to a STOP to say so, but that is UNVERIFIED until PR #16 matches the narrowed rule, so do not rely on it.

## 2. Before each judge (checklist, 2 minutes)

1. Open `/operator`. Read the banner: AI mode, Messaging mode, store, "DEMO: accelerated timers".
   - "Scheduler stalled" or "no tick recorded" means the worker is not running. Start `pnpm worker` on the demo laptop (with `APP_BASE_URL` set to the URL the donor phone can open), or press **Run tick now**.
   - "MISCONFIGURED" on a provider means a real provider was selected without its key. Do not demo it as real; fix the env and restart, or switch to fake explicitly and announce it.
2. Press **Reset demo** (confirm). Identities are kept.
3. Every phone sends a fresh `JOIN` and waits for the reply (Photon's send window after JOIN is unknown, RESEARCH SP-3): donor, courier A, courier B. In fake mode use `/operator/phone`: pick the contact, press JOIN.
4. `/operator` Messaging identities list shows all three as **Joined** (handles masked to the last 4 characters).
5. Keep the backup video open on a second device.

## 3. Setup facts

| Thing | Value |
|---|---|
| Sign in | `/` profile picker, demo passcode from the captain (never in git) |
| Donor | Rainier Catering (synthetic) |
| Recipient | Eastlake Community Pantry (synthetic) |
| Couriers | Courier A and Courier B (synthetic, cold transport) |
| Operator | Operator (synthetic) |
| Fixture photos (fake mode) | `sandwich_platter` (scene 1), `pasta_tray` (scene 3) |
| Offer window | 60 s in demo mode (accelerated, labeled) |
| Example offer code | `K7M3` style: 4 characters, the real code is shown in the courier's thread |

## 4. Scene 1: success (by message, with web upload as fallback)

Expected end state: donation `claimed`, then `collected` (simulated), then `delivered` (simulated).

| # | Action | What the audience sees | Server state | Check |
|---|---|---|---|---|
| 1 | Donor phone texts the sandwich-platter photo. Fake mode: `/operator/phone`, contact = donor, "Fixture photo id" = `sandwich_platter`, **Send fixture photo**. | Reply: an AI *guess* (assorted sandwiches/wraps, about 18 to 30 servings, possible wheat, milk, eggs, "please confirm") and a checklist link. Banner says AI: FAKE if fake. | `draft`, `ai_suggestion.mode` shown | UNVERIFIED (T-E2E-01) |
| 1b | **Fallback:** donor opens `/donor/new`, uploads the same photo. | Same draft, same checklist, labeled "web upload". | `draft` | UNVERIFIED (T-E2E-06) |
| 2 | Open the checklist (`/v#token` from the message, or the review screen on the fallback). Correct servings to 24, declare **all nine** allergens from the recipe sheet, answer every handling question, attest. Submit. | AI values appear only as labeled "(unverified)" hints; every field starts at `unknown`. Donor lands on `/donor/donations/:id`: "can be offered to a courier... waits for the next scheduler run". | `eligible` | UNVERIFIED (T-E2E-01/06) |
| 3 | Wait for the tick, or on `/operator` press **Run tick now**. | Card moves to **Offered**. Courier A's thread shows the offer with allergens, deadline and `YES <code>` / `NO <code>`. No street address yet. | `offered` | UNVERIFIED |
| 4 | Courier A replies `YES <code>` (fake mode: type the code in the phone page, press **YES**). | "Claimed" result; the reply carries the pickup address. Dashboard card moves to **Claimed**. | `claimed` | UNVERIFIED |
| 5 | `/operator` -> open the card -> **Mark collected (simulated)**, then **Mark delivered (simulated) - recipient accepted after inspection**. | Each step is labeled simulated. If the server refuses a step (for example the cutoff passed) the exact `INVALID_TRANSITION` message shows. | `collected`, `delivered` | UNVERIFIED |

Say at step 2: "The AI only suggested. The donor confirmed every fact, and the backend, not the AI, decided eligibility."

## 5. Scene 2: no response, then a late reply

Expected: A's offer expires, B is offered and claims, A's late `YES` loses cleanly.

| # | Action | Expected | Check |
|---|---|---|---|
| 1 | Run scene 1 steps 1 to 3 again with a fresh donation. | Offer to courier A (60 s window). | UNVERIFIED |
| 2 | Do nothing for 60 s, then **Run tick now**. | A's offer shows **Expired**; a new offer goes to courier B. Dashboard offer list shows both. | UNVERIFIED (T-E2E-02) |
| 3 | Courier B replies `YES <code B>`. | Donation `claimed` by B. | UNVERIFIED |
| 4 | Courier A now replies `YES <code A>`. | "Expired - no assignment made" in a neutral/warning style (never a success message). No address, no second assignment. | UNVERIFIED |

Do not call this "race-safe". It shows the late-reply rule, not concurrency.

## 6. Scene 3: responsible refusal

Expected: `needs_review` with four plain-language reasons, no offer, no "dispatch anyway".

| # | Action | Expected | Check |
|---|---|---|---|
| 1 | Send the `pasta_tray` photo (fixture or upload). | An AI guess: baked pasta tray, possible wheat and milk. | UNVERIFIED (T-E2E-03) |
| 2 | On the checklist mark: prepared **cooked then cooled**, continuous cold holding **unknown**, temperature log **no**, sesame **unknown**. Submit. | Donor page: "A person needs to look at this", with "what is still missing". | UNVERIFIED |
| 3 | `/operator` -> Needs review group. | Four reasons verbatim: cooling history review, cold holding unknown, temperature log missing, sesame unknown. Actions offered: Reject, Return to donor, Cancel only. **No dispatch, approve or retry control exists.** | UNVERIFIED |
| 4 | Press **Run tick now**. | Nothing is offered. | UNVERIFIED |

Say: "The photo looked appetizing. The system still refused, because the facts that matter were unknown."
Optional fourth scene: a buffet tray marked `previously_served = yes` is `rejected`.

## 7. Unmatched (only if asked)

If no cold-capable courier and recipient pair is feasible, the donation becomes **Unmatched - needs couriers**, shown neutrally and not as a safety finding. Actions: Retry matching, Cancel.

## 8. Fallback ladder (D-017)

1. Vercel + Supabase, with `pnpm worker` on the demo laptop. The browser is always the demo laptop.
2. `pnpm build && pnpm start` locally against Supabase (tunnel only if webhooks are needed).
3. Fully local, fake providers, clearly labeled. Backup: the recorded video.
If real photo intake by iMessage fails (T-MS-19 not green), open the demo on web upload and say why.

## 9. If something goes wrong

| Symptom | Do |
|---|---|
| Dashboard shows an error code and "stale since" | The server is unhappy. Say so. Do not read stale data as live. Press Run tick now once; if it persists, switch to the next fallback step. |
| A page shows `NOT_IMPLEMENTED` | That route is not wired yet: do not demo it. |
| Courier phone gets no offer | Check the identity is **Joined** on the dashboard; resend `JOIN`; press Run tick now. |
| Checklist link says expired or already used | Text the photo again for a new link (the old one is single-use). |
| Banner says MISCONFIGURED | Stop. Fix the key or switch to fake explicitly and announce it. |

## 10. Rehearsal log (fill in)

| Date/time | Commit | Who | Scenes passed | Mode (fake/real) | Notes |
|---|---|---|---|---|---|
| | | | | | |
