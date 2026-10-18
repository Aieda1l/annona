# VIDEO_SCRIPT.md — Annona demo video (DRAFT v0)

> **Status:** DRAFT v0, 2026-10-17. Author: Dev 1 (script text, per `docs/ROADMAP.md`). Dev 4 commits to `docs/demo/` and owns the final cut.
> **Consumer:** a code-driven video generator (Opus 5.5 writing the render code). No video model. Everything below is specified as data plus rules so it can be turned into a render script without guessing.
> **Hard constraints:** total ≤ **3:00** (target **2:45**). Mandatory for judging (R-DH-5). Synthetic data only. Every non-real element on screen is labeled.
> **Source of truth for behavior:** `docs/MVP_SCOPE.md` §5 scenes 0–3, `docs/CONTRACTS.md`. If the built app differs, the app wins and this script is edited.

## 1. Generator contract (read first)

1. **Spec, not vibes.** Render exactly the `scenes` in §4. Durations are targets; narration length decides final timing (see rule 5).
2. **Visual sources, in priority order:** (a) real screen captures of the running app, recorded by a deterministic script (Playwright against the demo URL in fake or real mode); (b) HTML/CSS title and caption cards rendered to frames; (c) simple vector diagrams. Never fabricate UI that does not exist. If a capture is missing, render a clearly marked placeholder card, do not invent a screenshot.
3. **Provider mode honesty.** Each scene declares `mode: real | fake | simulated`. The renderer must overlay the matching badge for the whole scene (see §3). A `fake` scene must never be narrated as a real Photon or Gemini call.
4. **Conditional lines.** Narration tagged `[real_photon]`, `[real_gemini]` or `[race_verified]` is spoken only if the matching flag in `flags` (§2) is `true`; otherwise use the `else:` line. Default every flag to `false`. Dev 4 flips a flag only after the evidence exists in a handoff (CLAUDE.md "no false claims").
5. **Timing.** Narration drives timing at 150 words per minute (0.4 s per word) plus 0.4 s padding between lines. If a scene's narration is longer than its target, extend the scene; if the total exceeds 180 s, fail the build and print the overage. Do not speed up the voice.
6. **Voice.** Prefer a human recording (Dev 1 or Dev 4) dropped into `audio/vo_<scene>.wav`; fall back to a TTS engine selected by the generator and named in the build log. The script words are identical either way. Captions are always burned in (judges watch muted).
7. **Output:** 1920×1080, 30 fps, H.264 MP4, plus `captions.srt`. Write a `build-report.json` listing per-scene duration, mode badge, flags used, and any placeholder cards that were rendered.
8. **Forbidden on screen or in audio:** the words "safe", "certified", "compliant", "allergen-free" or "guaranteed" about any food or about Annona, except inside the explicit disclaimer line in scene 8 ("does not certify food safety"). No real names, phone numbers, addresses or handles. The renderer should grep captions and narration for these before encoding and fail on a hit.

## 2. Flags (Dev 4 edits before render)

```yaml
flags:
  real_photon: false      # true only if a real Photon round trip has recorded provider_message_ids (T-MS-13)
  real_gemini: false      # true only if a real Gemini call is recorded with model ID (T-IN-10)
  race_verified: false    # true only if T-CO-17 passed on real Postgres (D-033)
  scene1_by_message: false  # true if photo arrived by iMessage; false = web upload fallback (T-E2E-06)
  demo_url: ""            # deployed or local URL the capture script drives
```

## 3. Visual system

- **Palette (tokens, reuse the dashboard's if available):** background `#0F1A17`, surface `#16241F`, text `#EAF2EE`, muted `#8FA79D`, accent (go) `#4ADE80`, caution (needs review) `#F5B942`, stop (rejected) `#F87171`, neutral (unmatched) `#94A3B8`.
- **Type:** one sans family for everything; captions 40 px, lower third, max 2 lines, 90% opacity plate.
- **Badges (top-right, always visible within their scene):**
  - `SYNTHETIC DATA` — every scene.
  - `REAL: GEMINI` / `REAL: PHOTON iMESSAGE` — only if the flag is true and the scene is `real`.
  - `SIMULATED PHONE` — fake or simulated messaging.
  - `DEMO: ACCELERATED TIMERS` — scene 5.
  - `SIMULATED HANDOFF` — pickup/delivery steps.
- **Motion:** 250 ms cross-fades, no zoom spam. Highlight rings (2 px accent) on the element being discussed, appearing on the word that names it. Cursor and typing in captures are real recorded input, not animated overlays.
- **Evidence beats:** whenever narration cites a recorded fact (provider message ID, model ID, test result), cut to a 2-second monospace card showing that exact string read from the handoff file. If the value is not available, skip the beat; never invent it.

## 4. Scenes

Narration word counts are budgeted so the default (all flags false) path totals about 330 words ≈ 2:15 of speech, leaving room for pauses and the conditional lines.

```yaml
scenes:
  - id: 1
    name: hook
    target_s: 14
    mode: simulated
    visual: |
      Black to dark-green. Three fast cards, 3 s each, typeset: "A caterer ends an event." / "Trays of good refrigerated food." / "Forty minutes to find it a home."
      Last card cross-fades to a stylized empty phone thread titled "Annona".
    narration: >
      A caterer finishes an event with trays of good food and about forty minutes before it's waste.
      Rescue networks exist, but small last-minute lots slip through.
    # NOTE: "forty minutes" is an illustrative scenario, not a statistic. Keep the card text "Forty minutes" labeled
    # as an example by rendering the caption suffix " (example)". Do not present it as data.

  - id: 2
    name: photo_to_guess
    target_s: 24
    mode: fake            # promoted to real by flags.real_photon / flags.real_gemini
    capture: |
      If flags.scene1_by_message: the simulated-phone page (or real iPhone screen recording) where donor "Rainier Catering (synthetic)" sends fixtures/intake/images/sandwich_platter.jpg, a photo of a refrigerated sandwich-and-wrap platter.
      Else: the web upload page (/intake) with the same photo chosen and submitted.
      Then the AI-guess reply: "AI guess: assorted sandwiches/wraps, ~18-30 servings, possible wheat/milk/eggs. Please confirm." plus the checklist link.
    highlight: ["AI guess", "~18-30 servings", "Please confirm"]
    narration: >
      The donor texts a photo. Gemini replies with what it sees, and says plainly that it's a guess:
      sandwiches and wraps, somewhere between eighteen and thirty servings, maybe wheat, milk, eggs.
      A photo can't show hidden ingredients, so nothing here counts yet.
    conditional:
      - tag: real_gemini
        append: "That draft came from a live Gemini call."   # also show evidence beat: model ID
      - tag: real_photon
        else_badge: SIMULATED PHONE

  - id: 3
    name: donor_verifies
    target_s: 28
    mode: fake
    capture: |
      The checklist (/v/...). Start on first paint: AI value and donor value side by side; servings AI "18-30", donor field empty.
      Recorded input: donor types 24 in servings. Chip "edited from AI" appears on servings.
      Scroll the nine-allergen grid. Every row reads "unknown" on first paint (record this frame, then hold 2 s).
      Donor sets each allergen from the recipe sheet, ticks every handling attestation (cold-prepared, held at or below the kitchen's limit, kitchen-supplied discard-by time), submits.
    highlight: ["unknown (all nine)", "edited from AI", "attestations"]
    narration: >
      Now a human takes over. The donor corrects servings to twenty-four, declares all nine major allergens from the recipe sheet,
      and attests how the food was held. Every field starts as "unknown". Nothing defaults to fine, and nothing is parsed out of chat text.

  - id: 4
    name: deterministic_gate
    target_s: 18
    mode: simulated
    capture: |
      Dashboard card for the donation: status flips to ELIGIBLE (accent green) with a reasons list rendered from the server read model.
      Then a split frame: left "AI said", right "Donor attested", center the gate verdict.
      Caption: "Eligible for dispatch under the prototype policy. Not a safety claim."
    narration: >
      A deterministic rules gate, not the AI, decides. These facts pass the prototype policy, so the lot is eligible for dispatch.
      Eligible, under a policy, based on what the donor attested.

  - id: 5
    name: offer_and_claim
    target_s: 30
    mode: fake            # promoted to real by flags.real_photon
    capture: |
      Split screen: dashboard left, courier phone right (real iPhone recording if flags.real_photon, else the simulated phone page with SIMULATED PHONE badge).
      Courier A receives: the offer with area only (no street address), a code, a deadline, and an automated-assistant disclosure.
      Courier A replies "YES K7M3". Reply arrives: assignment confirmed with the pickup address.
      Dashboard: status -> claimed, offer timeline updates, countdown shown (server-derived).
      Then the operator marks pickup then delivery; show badge SIMULATED HANDOFF.
    highlight: ["area only", "YES K7M3", "claimed", "SIMULATED HANDOFF"]
    narration: >
      An eligible courier with cold transport, tied to an approved pantry, gets a time-limited offer.
      It shows the area only; the street address comes after the claim.
      One reply, "yes" with the code, and the claim lands atomically. The dashboard shows what the server says.
    conditional:
      - tag: real_photon
        append: "This message went out over Photon iMessage."   # evidence beat: provider_message_id
        else: "Here the phone is simulated, and it's labeled."
      - tag: race_verified
        append: "Two couriers racing for the same lot: exactly one wins."  # show test output card for T-CO-17
        else: ""

  - id: 6
    name: no_response_and_late_reply
    target_s: 22
    mode: simulated
    badge_extra: DEMO: ACCELERATED TIMERS
    capture: |
      A second donation. Courier A's offer countdown (accelerated, 60 s) runs out on the dashboard timeline.
      Tick fires; offer to Courier B appears; B replies YES; claimed by B.
      Then A's late reply "YES K7M3" on A's phone; response: "This offer expired — no assignment was made."
    highlight: ["expired", "Courier B", "no assignment"]
    narration: >
      If a courier doesn't answer, the offer expires and moves to the next one, only while the pickup cutoff hasn't passed.
      When the first courier replies late, the answer is clear: no assignment was made.

  - id: 7
    name: responsible_refusal
    target_s: 26
    mode: simulated
    capture: |
      Pasta tray photo. AI draft looks confident. Checklist: "cooked then cooled", cold-holding history "unknown", no temperature log, sesame "unknown".
      Submit. Card turns NEEDS REVIEW (caution amber) with four plain-language reasons listed.
      Pan the dashboard card: no offer created. Zoom on the action row: there is no "dispatch anyway" control.
    highlight: ["cooked then cooled", "unknown", "NEEDS REVIEW", "no dispatch-anyway button"]
    narration: >
      Now the part that matters most. A pasta tray that looks great, but it was cooked and cooled, the holding history is unknown, and sesame is unknown.
      The gate says needs review, in four plain reasons. No offer goes out, and there's no dispatch-anyway button.
      Unknown means stop.

  - id: 8
    name: close
    target_s: 20
    mode: simulated
    visual: |
      Left: three bullet rows that appear on the narrated words: "AI describes" / "Humans verify" / "Backend enforces".
      Right: a "What's real" panel read from flags: Gemini (real | not shown live), Photon iMessage (real | simulated), first-claim-wins race test (verified | not claimed).
      Final card: "Annona — prototype. Synthetic data. Does not certify food safety." + repo URL (from handoff) + team handles (from Devpost, if provided).
    narration: >
      AI describes. Humans verify. The backend enforces.
      Annona is a weekend prototype on synthetic data. It does not certify food safety, and it's built to say no when facts are missing.
    conditional:
      - tag: real_gemini
        prepend: "Built with Gemini and Photon."   # only the tracks whose flag is true
```

## 5. Narration, flat (for TTS or recording, flags all false)

1. "A caterer finishes an event with trays of good food and about forty minutes before it's waste. Rescue networks exist, but small last-minute lots slip through."
2. "The donor texts a photo. Gemini replies with what it sees, and says plainly that it's a guess: sandwiches and wraps, somewhere between eighteen and thirty servings, maybe wheat, milk, eggs. A photo can't show hidden ingredients, so nothing here counts yet."
3. "Now a human takes over. The donor corrects servings to twenty-four, declares all nine major allergens from the recipe sheet, and attests how the food was held. Every field starts as unknown. Nothing defaults to fine, and nothing is parsed out of chat text."
4. "A deterministic rules gate, not the AI, decides. These facts pass the prototype policy, so the lot is eligible for dispatch. Eligible, under a policy, based on what the donor attested."
5. "An eligible courier with cold transport, tied to an approved pantry, gets a time-limited offer. It shows the area only; the street address comes after the claim. One reply, yes with the code, and the claim lands atomically. The dashboard shows what the server says. Here the phone is simulated, and it's labeled."
6. "If a courier doesn't answer, the offer expires and moves to the next one, only while the pickup cutoff hasn't passed. When the first courier replies late, the answer is clear: no assignment was made."
7. "Now the part that matters most. A pasta tray that looks great, but it was cooked and cooled, the holding history is unknown, and sesame is unknown. The gate says needs review, in four plain reasons. No offer goes out, and there's no dispatch-anyway button. Unknown means stop."
8. "AI describes. Humans verify. The backend enforces. Annona is a weekend prototype on synthetic data. It does not certify food safety, and it's built to say no when facts are missing."

Word count (flags false): about 330. Speech ≈ 2:15 at 150 wpm; with scene padding and evidence beats the cut lands near 2:45.

## 6. Capture requirements (for Dev 4 / the capture script)

| Need | Source | Status |
|---|---|---|
| Demo URL with seeded scenes 0–3 | Dev 4 deployment; `resetDemo` between takes | UNVERIFIED (not integrated yet) |
| Sandwich/wrap platter photo and pasta tray photo | `fixtures/intake/images/sandwich_platter.jpg`, `fixtures/intake/images/pasta_tray.jpg` (provenance: `fixtures/intake/PROVENANCE.md`) | Exist in repo |
| Simulated phone page | Dev 4 `feat/dashboard-phone` | In progress on branch |
| Real iPhone screen recording of a Photon round trip | Teammate phone | Only if `flags.real_photon` |
| Recorded evidence strings (model ID, `provider_message_id`, T-CO-17 result) | `docs/handoffs/dev-N.md` | Pending; evidence beats skipped until present |
| Accelerated 60 s timer for scene 6 | Demo env setting; badge required | Pending |

Capture script rules: deterministic seeds, fixed viewport 1920×1080, wait on server state (not sleeps), save each take as `captures/<scene>.webm` plus a JSON log of the server state transitions observed, so the build report can prove each on-screen status came from the server.

## 7. Open questions for the team

1. Is the live pitch the primary artifact and this video the backup (R-DH-14)? If so, keep as is; if the video is the main pitch, add 15 s on the market gap and Devpost track fit.
2. Which tracks does the video name aloud? The close line is conditional on the real-integration flags; no sponsor is named unless its flag is true.
3. Do we show the VEYZL finding (before/after) in a 10 s beat? Only if a real finding changed code (D-022); otherwise omit.
4. Voice: human recording or TTS? Human recording is preferred for judge trust.
5. Confirm the Devpost video host and any length cap (SP-10) before the final render.
