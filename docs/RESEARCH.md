# RESEARCH.md — Annona evidence ledger

> **Status:** PRE-EVENT IDEATION, 2026-10-15. Markdown only. Nothing is implemented: no code, account, API call, build, test or deployment exists. DubHacks Rule 10 forbids coding before Sat Oct 17, 12:30 PM PDT (R-DH-3; D-002).
> **Every source in this file was accessed on 2026-10-15** (America/Los_Angeles). Re-verify anything mutable (versions, prices, docs) at kickoff.
> **Not legal advice.** Regulatory rows frame a prototype policy and the questions in §4. They are not a compliance determination.
> IDs `R-*` are binding (cited by CONTRACTS, DECISIONS, ARCHITECTURE, MVP_SCOPE, PRODUCT_BRIEF). Do not renumber. Append new rows at the end of their group.

## 0. Method and labels

**Method (2026-10-15):**

- 8 research areas, each with 1 researcher subagent and 1 adversarial verifier that re-fetched the primary sources: A1 DubHacks rules, A1b sponsor tracks, A2 WA/King County regulation, A3 competition and naming, A4a Photon 2.0, A4b Gemini, A4c infrastructure, A5 Claude Code tooling.
- Where the verifier's correction or "missed" finding conflicts with the researcher, **the verifier wins**. §7 lists every material correction.
- **Notion pages** (Hacker Guide, judging, track and prize pages, Photon guide) are JS-rendered. WebFetch returned an empty shell, so content was read through Notion's public page-chunk API (`loadCachedPageChunk`, `queryCollection`).
- **Devpost** returned HTTP 403 (Cloudflare) to WebFetch at first. The overview and dates pages were later reached with curl. The rules page's IP/license terms were not fully read (R-DH-12).
- npm metadata came from `registry.npmjs.org` (npmjs.com returned 403).
- Several Google and infrastructure pages were read through a fetch tool's summary. **Re-check exact field names against installed SDK typings.**
- Local-machine facts come from the organizer's machine only (R-TOOL-10). They are not true for teammates by default.

**Labels:**

| Label | Meaning |
|---|---|
| VERIFIED SOURCE | Read on an official or primary page and re-checked by the verifier, unless the row says otherwise |
| VERIFIED SOURCE — CONFLICT | Primary sources disagree. The row says which one Annona follows. |
| SECONDARY | Third-party page, aggregator or search snippet only |
| UNVERIFIED | Not confirmed. Treat as a hypothesis until a spike (§5) settles it. |
| NOT FOUND | Searched, nothing found. Absence of evidence is not evidence of absence. |
| LOCAL OBSERVATION | Inspected on the organizer's machine on 2026-10-15 |
| DESIGN DECISION | Annona's choice; cites `D-*` in `docs/DECISIONS.md` |
| ASSUMPTION | Believed but not evidenced |
| OPEN RISK | Unresolved; has a spike or a fallback |

**Confidence:** High = primary source, re-checked verbatim. Med = primary but summarized, partly re-checked, or interpreted. Low = secondary, snippet or inference.

## 1. Headline conclusions

1. **Deadlines (VERIFIED SOURCE).** Hacking starts Sat 12:30 PM PDT. Devpost draft due Sat 10:30 PM, with **all contributors and their Discord handles plus declared tracks**; no draft means no judging. Final submission **10:00 AM Sun is binding**, although the Devpost platform window closes 10:30 AM. A presentation video is mandatory. (R-DH-1, R-DH-2, R-DH-4, R-DH-5; D-003)
2. **Pre-event work is ideation only (VERIFIED SOURCE).** No code, manifests, scaffolds, migrations or source commits before 12:30 PM Sat. (R-DH-3; D-002)
3. **Track set is valid (VERIFIED SOURCE).** Community Kitchen + Photon + VEYZL + SideShift fits "1 title, ≤ 3 sponsored". Gemini API, NEXT and Commit are non-sponsored. Photon and VEYZL each require hard evidence (live Photon 2.0 channel; a PR audit that changed code). (R-DH-6, R-DH-7, R-SP-1..R-SP-7; D-001)
4. **Photon 2.0 means the Photon Beta platform (VERIFIED SOURCE)**: `app.beta.photon.codes`, `api.photon.codes/v1`, `pho_prj_` projects. Not Spectrum/`spectrum-ts`. The guide's `photon.co/beta` link is a parked domain. (R-PH-1; D-011)
5. **A shared iMessage line cannot send first (VERIFIED SOURCE).** Each courier must be an iMessage-capable identity, be assigned, and text `JOIN` before any offer. There are no buttons, so claims are free-text `YES <code>`. (R-PH-4, R-PH-5, R-PH-9; D-011)
6. **Every inbound transport is at-least-once (VERIFIED SOURCE).** Dedupe on the provider message ID, and decide the winner inside one Postgres transaction. (R-PH-6, R-INF-6; CONTRACTS §8)
7. **Gemini output is a hypothesis (VERIFIED SOURCE).** Google says JSON is syntactically valid but values must be validated. Use `@google/genai` 2.30.0 and `gemini-3.5-flash-lite` by default. Free-tier inputs may be used by Google, so send synthetic photos only. (R-AI-1..R-AI-5; D-012, D-016)
8. **Timers cannot be trusted to fire (VERIFIED SOURCE).** Vercel Hobby cron runs at most daily, and Vercel cannot hold a persistent connection. Correctness comes from lazy checks in the claim transaction. Liveness comes from an idempotent `tick`. Supabase `pg_cron` on the Free plan is UNVERIFIED. (R-INF-2, R-INF-3, R-INF-5; D-010)
9. **WA/King County framing (VERIFIED SOURCE).** Licensed establishments may donate to 501(c) DFDOs that notify the regulator and register annually with PHSKC. Cold holding is ≤ 41 °F. Cooling history is unverifiable by the app. **No official text covers app-dispatched couriers or coordination platforms (NOT FOUND).** (R-REG-1..R-REG-8, R-REG-13; D-007)
10. **No legal-protection claims (VERIFIED SOURCE).** RCW 69.80.031 and 42 USC 1791 protect good-faith donors of apparently wholesome food, and neither names couriers or platforms. (R-REG-11)
11. **The field is crowded (VERIFIED SOURCE).** Food Rescue Hero (25 partner orgs), MealConnect (real-time donations plus in-app chat since 2023) and Eat Happy Now (King County) exist. The defensible niche is a **no-install iMessage TTL offer plus a fail-closed gate after an AI draft** (ASSUMPTION; "we did not find" ≠ "does not exist"). (R-CMP-1..R-CMP-9)
12. **Tooling cost traps (VERIFIED SOURCE).** On Pro, `default` resolves to Opus 5.5. Limits are shared with claude.ai. A set `ANTHROPIC_API_KEY` switches billing to API rates. Each human installs ECC at user or local scope. (R-TOOL-1..R-TOOL-7; D-014)

## 2. Source ledger

All rows accessed **2026-10-15**. The "Source URL(s)" column uses short keys that resolve to full URLs in §8.

### 2.1 DubHacks rules and logistics (R-DH)

| ID | Finding (≤ 30 words) | Label | Source URL(s) | Decision relevance | Fallback | Confidence |
|---|---|---|---|---|---|---|
| R-DH-1 | Hacking begins Sat Oct 17, 12:30 PM. The guide states all its times are PDT. | VERIFIED SOURCE | HG, JO | D-002 (no code before); CP0a 1:15 PM / CP0b 1:30 PM (OWNERSHIP §8) | A Discord-announced change wins | High |
| R-DH-2 | Organizers set final submission at 10:00 AM Sun Oct 18 as a HARD deadline. dh26 site says "10:30AM Submissions Due!"; Devpost platform period ends 10:30 AM PDT. | VERIFIED SOURCE — CONFLICT | HG, JO, DP, DPD, DH26 | D-003: 10:00 binding, 9:30 internal (CP6) | Never use the 10:00–10:30 window | High |
| R-DH-3 | Rule 2: started and completed during the event. Rule 10: no coding or building before 12:30 PM Sat; ideation allowed. Rule 7: ≤ 30% code not written during the event. | VERIFIED SOURCE | HG, DP | D-002; first commit at or after 12:30 PM | Ask in #ask-dh if unsure | High |
| R-DH-4 | Draft due 10:30 PM Sat: overview, every member as contributor with Discord handle, declared tracks. No draft means no judging. | VERIFIED SOURCE | HG, JO, DP | D-003 (internal 9:30 PM); CP4 | Captain submits a placeholder draft early | High |
| R-DH-5 | Recorded presentation video mandatory for every team: "TEAMS WHO DO NOT SUBMIT A VIDEO WILL NOT BE ALLOWED TO JUDGE". Live pitch < 3 min. No general length cap found (Visa: 3 min). Re-checked 2026-10-16. | VERIFIED SOURCE | JO, HG | AC-16; CP5 freeze starts recording | Backup recording Sat night; keep ≤ 3:00 | High |
| R-DH-6 | Exactly 1 title track, ≤ 3 sponsored, unlimited non-sponsored. ≤ 4 hackers per team; one project per hacker; no double submission. | VERIFIED SOURCE | HG, JO, DP | D-001 | Drop a sponsored track rather than fake it | High |
| R-DH-7 | Title tracks: Community Kitchen, Chef's Choice, Cook Smarter, Visa. Community Kitchen: "Build technology that helps people thrive"; topics include sustainability, social good, coordination tools, equity. | VERIFIED SOURCE | TT, HG | D-001 title; pitch vocabulary | Cook Smarter, decided before the draft | High |
| R-DH-8 | Rubric: Functionality 30%, Design 20%, Creativity 20%, Track Applicability 30%; each scored /8 in bands 1-2, 3-4, 5-6, 7-8. | VERIFIED SOURCE | RUB | Reliability over integrations (ARCHITECTURE §1) | Cut integrations before core-flow polish | High |
| R-DH-9 | In-person expo judging, HUB Ballroom: 3 × 50-min rounds, one random round per team; side-track judges come anytime; workshop 10:30 AM, arrive ~10:20; ≥ 1 member for prizes. | VERIFIED SOURCE | JO, HG | D-003; demo must be resettable (`resetDemo`) | Second device with recorded video | High |
| R-DH-10 | All code uploaded before the deadline and linked on Devpost; no code means disqualified. A PUBLIC GitHub repo is recommended, not strictly required. | VERIFIED SOURCE | HG | Repo public from kickoff (D-023); canonical secret scan in ARCHITECTURE §9 before every push, full-history scan Sun 9:00 AM; VEYZL needs a public repo (D-022) | Rotate a leaked key immediately (history rewriting does not un-leak a public push) | High |
| R-DH-11 | Devpost eligibility: ages 18+, college students only. | VERIFIED SOURCE | DP | Every listed contributor must qualify | Ask organizers before the draft | High |
| R-DH-12 | No rule found on AI coding tools. Devpost IP/license terms not fully read. | NOT FOUND | HG, JO, DPR | Disclose AI assistance in README and Devpost | Ask #ask-dh; choose a license deliberately | Med |
| R-DH-13 | No overnight space at HUB. Overnight workspace Gates Center CSE G01 opens 11:00 PM; sleeping not permitted. | VERIFIED SOURCE | HG, JO | Plan laptop and worker relocation ~11 PM | Worker on any always-on machine | High |
| R-DH-14 | Only the Visa title track judges virtually (3-min Devpost video). In-person side tracks: DubHacks NEXT, T-Mobile, Cloudforce, SideShift, Perceptron, Photon, VEYZL; the rest (incl. MLH) use Devpost plus main-track judging. | VERIFIED SOURCE (2026-10-16) | JO, DP | Community Kitchen, Photon, VEYZL, SideShift, NEXT all judge in person; the video is still mandatory (R-DH-5); MLH Gemini relies on the write-up and video (R-SP-5). Devpost's "some side tracks will use a video submission in place of an in-person judging round" matches this and exempts no team from the video. | MLH may visit select tables; be there anyway | High |

### 2.2 Sponsor and prize tracks (R-SP)

| ID | Finding (≤ 30 words) | Label | Source URL(s) | Decision relevance | Fallback | Confidence |
|---|---|---|---|---|---|---|
| R-SP-1 | Photon: built on Photon 2.0, live on ≥ 1 Photon channel; iMessage = home base. Prizes: winner $400 + $300 credits + interview; runner-up $200 + $100; voice $300 + $100. | VERIFIED SOURCE | PG, SST, PRZ | D-001, D-011; claim only after T-MS-13 | Labeled fake mode; drop the Photon track | High |
| R-SP-2 | Photon judging: Vision, Craft, Depth (real-world context, edge cases), Traction. "Great" includes human-in-the-loop and thoughtful safety/fallback behavior. | VERIFIED SOURCE | PG | Pitch the fail-closed gate and late-claim handling (PRODUCT_BRIEF §12) | — | High |
| R-SP-3 | VEYZL: working AI project; real audit (GitHub connected, check visible on a PR); evidence findings changed the build; issue→fix demo; free; prizes TBD; Free plan advisory; optional `@veyzl/sdk` wraps Gemini. | VERIFIED SOURCE | SST, VZ, PRZ | D-022 (supersedes D-018's timing) | Drop by Sun 3:00 AM if no actionable finding | High |
| R-SP-4 | SideShift "Best Startup Idea": open prize, no integration required; favors a distribution story. 1st $1,500 + work trial, 2nd $500 + interview, 3rd interview. | VERIFIED SOURCE | SST, DP | PRODUCT_BRIEF §11 hypotheses | — | High |
| R-SP-5 | MLH Best Use of Gemini API is a DubHacks non-sponsored track: build with the Gemini API; swag; judged mainly from the Devpost write-up. | VERIFIED SOURCE | NST, MLHP | D-012; T-IN-10 evidence in write-up and video | Don't list it without a real call | High |
| R-SP-6 | DubHacks NEXT (judged in person): meaningful problem, clear user, builder energy, iteration, revenue potential, drive to continue. 1st $200 + guaranteed Batch 6 interview. | VERIFIED SOURCE | NST | PRODUCT_BRIEF §11 | — | High |
| R-SP-7 | MLH Commit Fellowship: working prototype, Devpost opt-in, supplemental form (mlh.link/commit-fellowship-form); winner chosen post-event; program Nov 2–20. | VERIFIED SOURCE | NST, MLHP, CF | D-001 (only if continuing) | Form is JS-only; ask MLH on site | Med |
| R-SP-8 | Perceptron perception track (Mk1.5 API via workshop; prizes TBD) duplicates Gemini. T-Mobile is phone shopping. Cloudforce criteria NOT FOUND (attachment unreadable). | VERIFIED SOURCE | SST, PRZ, PCP | D-001 alternatives rejected | — | Med |
| R-SP-9 | Devpost prize list omits Photon, VEYZL and Perceptron (re-checked 2026-10-16; MLH prizes, incl. Gemini API and Commit Fellowship, are now listed). Devpost form track options may differ from the Notion guide. | VERIFIED SOURCE | DP | Captain checks track checkboxes Sat (CP4) | Ask organizers on Discord | High |

### 2.3 Photon 2.0 (R-PH)

| ID | Finding (≤ 30 words) | Label | Source URL(s) | Decision relevance | Fallback | Confidence |
|---|---|---|---|---|---|---|
| R-PH-1 | Photon 2.0 = Beta platform (`app.beta.photon.codes`, `api.photon.codes/v1`, `pho_prj_`, Bearer `pho_sk_`/`pho_ask_`), not Spectrum. Launch post: public beta, $100 credit. `photon.co/beta` is parked. | VERIFIED SOURCE | PLL, PBL, PBETA, PPROJ | D-011. Beta docs tell coding agents to default to Stable; ignore that. | Confirm with Photon mentors at kickoff | High |
| R-PH-2 | Onboarding: create org + project in the Beta dashboard, copy Project ID, create project key (project:read/write, platforms:read/write). Key shown once; server-side only. | VERIFIED SOURCE | PPROJ, PCRED | CONTRACTS §12 env vars | Dashboard UI if the API call fails | High |
| R-PH-3 | `@photon-ai/api` 0.5.0 published 2026-10-16T01:42Z (Oct 15 evening PDT); six releases Oct 10–16; engines node>=22 (docs say 24). Published clients may lack messaging methods. | VERIFIED SOURCE | PNPM, PPROJ, PIDX | D-004, D-011: HTTP via `fetch`, SDK optional | Pin exactly or skip the SDK | High |
| R-PH-4 | Shared line sends only in direct Spaces, to an assigned peer who messaged it since assignment. No unsolicited first message; no groups. 403 `SHARED_LINE_INBOUND_REQUIRED`, 422 `SHARED_LINE_GROUP_UNSUPPORTED`. | VERIFIED SOURCE | PIM, POA | D-011 JOIN; `MessagingIdentityStatus`; T-MS-15 | Dedicated line is Business-only; not used | High |
| R-PH-5 | Assignments map an E.164 phone or Apple-ID email to a pooled line (server-allocated number; Free 25/project). Participant must be iMessage-capable; Android cannot. `SHARED_LINE_POOL_EXHAUSTED`, `BILLING_NOT_PROVISIONED` possible. | VERIFIED SOURCE | POA, PIM, PPB | Couriers = opted-in teammates with iPhones (D-011) | Labeled simulated phone | High |
| R-PH-6 | Inbound: webhook destinations (secret shown once; Standard-Webhooks-compatible; at-least-once, retries, dead-letter, head-of-line ordering), Socket.IO (persistent; cursor replay with opaque integer cursors that may have gaps: persist the last processed cursor and resume from it; may redeliver) or polling. Dedupe required. | VERIFIED SOURCE | POA, PWS, PBL | D-011 transport order; ARCHITECTURE §6; T-MS-03 | Worker Socket.IO relay, then poll relay | High (exact retry/signature: Med) |
| R-PH-7 | Send: `POST /v1/projects/{id}/messages`, required `Idempotency-Key`, body `spaceId`/`senderId`/`content`. 202 = persisted, not delivered. 422 `IDEMPOTENCY_KEY_REUSED`; 409 in progress; 429 `Retry-After`. | VERIFIED SOURCE | POA, PRT, PIM | CONTRACTS §8.3; T-MS-05 byte-identical text per key | Retry with the same key | High |
| R-PH-8 | Envelope `{id, type, apiVersion '2026-07-01', source 'imessage.photon', timestamp, data}`; `message.received/.dispatched/.accepted/.delivered/.failed`; failure codes include `recipient_opted_out`; delivery confirmation may be unavailable. | VERIFIED SOURCE | POA | T-MS-14 normalizer; T-MS-10 `send_failed` | Deadlines never wait on delivery events | High |
| R-PH-9 | No buttons or quick replies. Inbound iMessage content: text, attachment, message.read, typing, group; no tapbacks or polls. Attachments downloadable (may be HEIC; `ATTACHMENT_NOT_READY`). | VERIFIED SOURCE | POA | D-011 text grammar; T-MS-01; photo intake is P0 by D-031, time-boxed by SP-14 (T-MS-18) | Web upload is the fully supported fallback | High |
| R-PH-10 | Free plan $0; no per-message fee for iMessage. SMS $0.01/part plus 10DLC. ToS: no spam, keep consent records, honor opt-out, disclose automation; beta for evaluation; usage may train ML. | VERIFIED SOURCE | PPB, PTOS, POA | SMS out of scope (MVP §6); JOIN/STOP/disclosure (T-MS-15) | No billing without human approval | High |
| R-PH-11 | Beta "Messaging" docs section is being rewritten. The OpenAPI spec is the most reliable source; a hands-on spike is required. | VERIFIED SOURCE | PMSG, POA | Spikes SP-1..SP-3 (§5) | Labeled fake gateway | High |

### 2.4 Gemini vision (R-AI)

| ID | Finding (≤ 30 words) | Label | Source URL(s) | Decision relevance | Fallback | Confidence |
|---|---|---|---|---|---|---|
| R-AI-1 | Recommended stable: `gemini-3.5-flash-lite` (fast/cheap, thinking minimal) and `gemini-3.8-flash` (quality, thinking medium); `3.6-flash` previous gen. No shutdown dates; 2.5 access-limited; `3.1-flash-lite` shuts 2027-05-07. | VERIFIED SOURCE | GMOD, GDEP, GTH | D-012 `GEMINI_MODEL` default; avoid routed aliases | Other stable ID, then labeled fake | High |
| R-AI-2 | Image MIME png/jpeg/webp/heic/heif. Inline data ≤ 20 MB total request. ≤ 384 px = 258 tokens; larger images tiled. | VERIFIED SOURCE | GIMG | D-006 downscale; T-IN-09 (≤ 1.5 MB web, ≤ 5 MB messaging); HEIC behavior with our model and adapter is **UNTESTED** until SP-14 | Manual entry on unsupported input | High |
| R-AI-3 | Interactions API GA since June 2026 and recommended; `generateContent` "legacy" but fully supported. JSON Schema subset. Output is valid JSON, but "always validate values". | VERIFIED SOURCE | GSO, GINT, GMIG | D-016 strict Zod; `AI_OUTPUT_INVALID` (T-IN-04) | Other API surface; manual entry | High |
| R-AI-4 | `@google/genai` GA; npm latest 2.30.0 (Node >= 20). Unreleased 3.0.0 will need Node 22. `@google/generative-ai` deprecated 2025-11-30. Never expose keys client-side. | VERIFIED SOURCE | GLIB, GJS | D-012 pin 2.30.0; server-only | Direct REST via `fetch` | High |
| R-AI-5 | Free-tier content "used to improve our products"; humans may review; no personal data; users 18+. Limits per project, shown in AI Studio, reset midnight PT. Interactions stores by default. | VERIFIED SOURCE | GPR, GTOS, GRL, GINT | D-012: synthetic photos, per-dev projects, `store:false` | Human-approved billing or labeled fake | High |
| R-AI-6 | Safety blocks: Interactions → HTTP 400 (`safety`, `prohibited_content`…); `generateContent` → `finishReason` SAFETY etc. Default thresholds Off for 2.5+. No official latency figures. | VERIFIED SOURCE | GSAF, GMOD | `PROVIDER_UNAVAILABLE` (T-IN-05); 15 s timeout | Measure latency at kickoff (SP-4) | Med |

### 2.5 Infrastructure (R-INF)

| ID | Finding (≤ 30 words) | Label | Source URL(s) | Decision relevance | Fallback | Confidence |
|---|---|---|---|---|---|---|
| R-INF-1 | Supabase Free: 2 active projects/account, 500 MB DB, paused after 1 week inactive (1-year restore), no automatic backups, 1-day logs. | VERIFIED SOURCE | SBP, SBU | Create the project at kickoff; replayable migrations (ARCHITECTURE §13) | `STORE=pglite` local stack | High |
| R-INF-2 | Vercel Functions: Hobby max 300 s. Inbound WebSockets in beta, closed at max duration. Vercel cannot hold a persistent provider connection. | VERIFIED SOURCE | VFL, VWS | D-004 worker; D-017 | Worker on the demo laptop | High |
| R-INF-3 | Vercel Hobby cron: at most once per day, ±59 min precision; more frequent schedules fail deployment. | VERIFIED SOURCE | VCR | D-010 rules out Vercel Cron | — | High |
| R-INF-4 | Body limit 4.5 MB. Hobby: non-commercial, 1 h runtime logs, 100 deploys/day, 4 active CPU-h/month; overage can lock ~30 days; only the owner triggers Git deploys. | VERIFIED SOURCE | VFL, VHB, VKB | D-006 downscale; `audit_events` as evidence; D-017 | Captain CLI deploy; local `next start` | High |
| R-INF-5 | Supabase Cron: `[1-59] seconds` on Postgres 15.1.1.61+. `pg_net` is fire-and-forget (lost on crash). Cron is Beta; **Free-plan availability UNVERIFIED**; disabling `pg_cron` deletes jobs. | VERIFIED SOURCE (Free plan: UNVERIFIED) | SBC, SBF, SBN | D-010 tick driver 2, scheduled by migration | Worker loop; "Run tick now" button | Med |
| R-INF-6 | READ COMMITTED: a concurrent UPDATE/`FOR UPDATE` waits, then re-checks WHERE on the new row. Partial unique indexes; `ON CONFLICT DO NOTHING`; `FOR UPDATE SKIP LOCKED`. | VERIFIED SOURCE | PGTX, PGIX, PGINS, PGSEL | CONTRACTS §8.1–8.2; T-CO-16, T-CO-17 | — | High |
| R-INF-7 | Serverless: transaction pooler port 6543 (IPv4), prepared statements off. Direct connections IPv6-only without add-on. Persistent IPv4 servers: session pooler 5432. | VERIFIED SOURCE | SBCX | ARCHITECTURE §3 `prepare: false`; worker uses session pooler | — | High |
| R-INF-8 | Supabase CLI local stack needs a Docker-compatible runtime (Docker Desktop, Rancher or Podman on Windows). Windows CLI install via Scoop. | VERIFIED SOURCE | SBCLI | D-006 PGlite for zero-setup dev | Personal hosted project | High |
| R-INF-9 | Railway trial $5/30 days then $1/month (card UNVERIFIED); Render Free sleeps 15 min, no workers; Fly no free tier; Neon scales to zero; Inngest Free 50k; QStash `Upstash-Not-Before`, 1,000/day. | VERIFIED SOURCE | RW, RND, FLY, NEON, ING, QS | D-010, D-017 alternatives rejected | QStash single-call add-on (D-010) | Med |
| R-INF-10 | npm latest observed: next 16.4.2, @supabase/supabase-js 2.118.0, supabase CLI 2.121.0, inngest 4.24.0, @upstash/qstash 2.12.0, @neondatabase/serverless 1.2.0. | VERIFIED SOURCE | NPM | Pin exact versions at kickoff (ARCHITECTURE §3) | Re-resolve at kickoff | High |

### 2.6 Washington / King County food donation (R-REG) — prototype framing, not legal advice

| ID | Finding (≤ 30 words) | Label | Source URL(s) | Decision relevance | Fallback | Confidence |
|---|---|---|---|---|---|---|
| R-REG-1 | WA DOH guidance: licensed establishments encouraged to donate (incl. prepared) to 501(c) DFDOs. Donors state source, preparation, holding, danger-zone time; full ingredients. Discard after 4 h in danger zone. | VERIFIED SOURCE (guidance, not rule) | DOH | `VerifiedFacts` fields; G-05, G-06, G-13 | `needs_review` on any unknown | High |
| R-REG-2 | WAC 246-215-03525: TCS food held cold ≤ 41 °F, hot ≥ 135 °F (130 °F exceptions). Effective 2022-03-01. | VERIFIED SOURCE | WAC-03525 | D-007 refrigerated only; G-02; M-07 | — | High |
| R-REG-3 | WAC 246-215-03530 time as a public health control: optional, written procedures, ≤ 4 h with marking and discard, specific contexts only. No 6-hour variant. | VERIFIED SOURCE | WAC-03530 | Not modeled; no AI or app countdown (MVP §6) | — | High |
| R-REG-4 | WAC 246-215-03515 cooling: 135→70 °F within 2 h and ≤ 41 °F within 6 h total (ambient ingredients 4 h). The app cannot verify cooling history. | VERIFIED SOURCE (researcher only; verifier did not re-fetch) | WAC-03515 | G-03 `COOLING_HISTORY_REVIEW` (D-007) | — | Med |
| R-REG-5 | WAC 246-215-09400: DFDOs exempt from permit but must notify the regulator (501(c) or sponsorship letter) and report annually. PHSKC requires free annual registration. | VERIFIED SOURCE | WAC-09400, KC | M-01 `registered_dfdo` (operator-set, synthetic) | Label as simulated verification | High |
| R-REG-6 | WAC 09415/09420: approved sources; previously served only under an approved plan; home kitchens limited; DFDO inspects on receipt (temperatures, intact packaging, separate containers, clean vehicle). | VERIFIED SOURCE | WAC-09415, WAC-09420 | G-01, G-07, G-08; S-10 "recipient accepted after inspection" | — | High |
| R-REG-7 | WAC 246-215-09407 transport: cold ≤ 41 °F / hot ≥ 135 °F, separate containers, clean vehicles; no maximum transport time. No official text on volunteer/app couriers or platforms. | VERIFIED SOURCE + NOT FOUND | WAC-09407 | M-07; `max_transit_minutes` is operational only (CONTRACTS §3.12) | Questions Q1–Q2 (§4) | Med |
| R-REG-8 | WAC 246-215-09425: DFDOs may not accept home-canned, specialized-processing (e.g., ROP/vacuum) donor-kitchen food, damaged cans, unapproved distressed food, expired infant formula, raw milk. | VERIFIED SOURCE | WAC-09425 | G-04 `EXCLUDED_CATEGORY` | — | High |
| R-REG-9 | FDA nine major allergens: milk, eggs, fish, crustacean shellfish, tree nuts, peanuts, wheat, soybeans, sesame (FASTER Act; labeling 2023-01-01). WAC 01115 definition lists eight. | VERIFIED SOURCE — CONFLICT | FDAA, WAC-01115 | `Allergen` enum uses federal nine; G-11; M-03 | — | High (WAC eight-list: Med) |
| R-REG-10 | WA Retail Food Code = ch. 246-215 WAC, based on the 2017 FDA Food Code (adopted 2020-10-13). FDA 2022 and 2026 (2026-09-17) editions are model codes, not WA law. | VERIFIED SOURCE | DOHFC, FDAFC | Cite WAC sections, never FDA editions | Re-check before any real use | High |
| R-REG-11 | RCW 69.80.031 (amended 2022) and 42 USC 1791 (Pub. L. 117-362) protect good-faith donors of apparently wholesome food, except gross negligence; neither names couriers or platforms. | VERIFIED SOURCE (USC via LII reproduction) | RCW, USC | §6 forbidden claims; PRODUCT_BRIEF §11 | Counsel and partner review (§4) | High |
| R-REG-12 | DFDO duties: receiving records (origin, quantity, type, date) kept 90 days; repackaged allergen disclosure; reheat rescued TCS to 165 °F within 2 h; HSP definition. | VERIFIED SOURCE (09406 not re-checked) | WAC-09435, WAC-09430, WAC-09406, WAC-01115 | M-01 excludes HSP recipients; receiving-record export goes to BACKLOG | — | Med |
| R-REG-13 | King County: TCS foods a DFDO may serve depend on its kitchen equipment; accept only approved sources; Good Samaritan Act doesn't remove the duty to act responsibly. | VERIFIED SOURCE | KC | M-02 handling-mode match; fail-closed framing | — | High |

### 2.7 Competition and naming (R-CMP)

| ID | Finding (≤ 30 words) | Label | Source URL(s) | Decision relevance | Fallback | Confidence |
|---|---|---|---|---|---|---|
| R-CMP-1 | Food Rescue US: volunteers claim one-time or recurring rescues in a web app. Homepage claims 53 locations, 25 states + DC; no WA site confirmed. | VERIFIED SOURCE | FRUS | Volunteer claiming is not novel | — | High |
| R-CMP-2 | Food Rescue Hero (by 412 Food Rescue): rescue-ops platform, volunteer app, dashboards; 25 partner orgs, ~63k volunteers, 1M rescues (Aug 2026 release); no WA partner. | VERIFIED SOURCE | FRH | Dispatch + dashboard is not a differentiator | — | High |
| R-CMP-3 | Feeding America MealConnect: free donor↔food bank↔agency platform; scheduled or real-time donations; in-app chat since 2023. | VERIFIED SOURCE | MC | Messaging alone is not novel; our angle is no-install iMessage + TTL + atomic claim | — | High |
| R-CMP-4 | Replate (managed pickups; no Seattle listed), Copia (enterprise redistribution, chain-of-custody), Goodr (B2B logistics, tax reporting), Spoiler Alert (CPG liquidation). | VERIFIED SOURCE | REP, COP, GOODR, SPA | No novelty claims for audit trails, matching or tax tooling | — | Med |
| R-CMP-5 | Seattle: Food Lifeline (regional hub; "Seattle's Table" only in ~2014 sources), Northwest Harvest (statewide), Eat Happy Now (Bellevue; mostly scheduled; 675k lbs, 475 volunteers, June 2025). | VERIFIED SOURCE (Seattle's Table: SECONDARY, 2026 status UNVERIFIED) | FLL, NWH, EHN | Position as complementary; post-event interviews (PRODUCT_BRIEF §11) | — | Med |
| R-CMP-6 | UW: Any Hungry Husky / UW Food Pantry (Poplar Hall); CSF-funded gleaning of prepared dining items; FRN UW Seattle chapter Inactive, UW Bothell Active. | VERIFIED SOURCE | UW | Never claim UW surplus goes unrecovered; no UW partnership | — | Med |
| R-CMP-7 | Too Good To Go: consumer surplus bags, Seattle launch 2021 (current status UNVERIFIED). OLIO: UK peer-to-peer sharing plus volunteer collection. | SECONDARY (TGTG); VERIFIED SOURCE (OLIO) | TGTG, OLIO | Annona routes to approved organizations, not the public | — | Low |
| R-CMP-8 | "Annona" used by an agri supply-chain traceability company (annona.co, possibly closed). No US surplus-food product found. No USPTO search done. | SECONDARY | ANN | D-019 hackathon codename only | Trademark search before any post-event use | Low |
| R-CMP-9 | Niche: messaging-native, no-install iMessage intake-and-offer layer for last-minute small lots; AI draft → donor verification → fail-closed gate → TTL offer → atomic claim; complements incumbents. | ASSUMPTION (synthesis of R-CMP-1..8) | — | PRODUCT_BRIEF §10 pitch | Say "we did not find", never "none exist" | Med |

### 2.8 Claude Code tooling (R-TOOL)

| ID | Finding (≤ 30 words) | Label | Source URL(s) | Decision relevance | Fallback | Confidence |
|---|---|---|---|---|---|---|
| R-TOOL-1 | ECC 2.2.3 (2026-10-01): guided `npx ecc-universal@2.2.3 setup` (installs, moves scope, repairs) or native `/plugin install ecc@ecc`. One method; never `install.sh --profile full` after the plugin. | VERIFIED SOURCE | ECC | D-014 | Re-run the guided setup to repair scope | High |
| R-TOOL-2 | Plugin scopes: user → `~/.claude/settings.json`; project → committed `.claude/settings.json`; local → `settings.local.json`. Project-only enablement of a git-sourced plugin is not fetched. | VERIFIED SOURCE | CCP | D-014 user or local scope only | `claude plugin enable ecc@ecc --scope local` | High |
| R-TOOL-3 | ECC hook profiles minimal / standard (default) / strict via `ECC_HOOK_PROFILE` or plugin options; `ECC_DISABLED_HOOKS` disables individual hooks. | VERIFIED SOURCE | CCH, ECC | D-014 minimal profile | Disable a noisy hook by ID | Med |
| R-TOOL-4 | Superpowers via `superpowers@claude-plugins-official`; core skills include brainstorming, writing-plans, TDD, systematic-debugging; v7.0.0 2026-10-09 (Windows hook fixes); auto-triggers can duplicate ECC rituals. | VERIFIED SOURCE | SP | D-014, D-020 one workflow per phase | Skip Superpowers | Med |
| R-TOOL-5 | If `ANTHROPIC_API_KEY` is set, Claude Code uses it instead of the subscription and bills at API rates. | VERIFIED SOURCE | CCS | D-014; CONTRACTS §12 | `/logout`, `claude update`, re-login | High |
| R-TOOL-6 | Pro: five-hour session limit plus weekly limit, shared across Claude apps and Claude Code. `/status` shows remaining. At the limit: wait, usage credits, upgrade, Console API. | VERIFIED SOURCE | CCS | D-014; handoffs let another human continue | Stagger heavy work | High |
| R-TOOL-7 | Aliases sonnet/opus/haiku/opusplan/best/fable (+[1m]); `default` = account runtime default (Pro → Opus 5.5 since v2.1.280). Sonnet 5.5 needs v2.1.284+. Effort low…max, default medium. | VERIFIED SOURCE | CCM | D-014 `/model sonnet` + `/effort medium` | — | High |
| R-TOOL-8 | `claude --worktree <name>` creates `.claude/worktrees/<name>` on `worktree-<name>` from the remote default branch (falls back to local HEAD). Manual `git worktree add` also documented. | VERIFIED SOURCE (zero-commit failure is inference) | CCW | OWNERSHIP §1; needs a pushed baseline | Separate clones per human | Med |
| R-TOOL-9 | `autoMemoryEnabled: false` is the official key; memory is machine-local and shared across worktrees. A CLAUDE.md suppresses automatic AGENTS.md loading. | VERIFIED SOURCE | CCMEM | Committed `.claude/settings.json` (D-014) | — | High |
| R-TOOL-10 | Organizer machine: Claude Code 2.1.301; ecc@ecc 2.2.3 recorded project-scope, no `enabledPlugins` entry; superpowers 6.4.1; model opus + effort xhigh pinned; Node 22.23.2; repo `master`, zero commits. | LOCAL OBSERVATION | LOCAL | Fix before kickoff (SP-13) | — | High |
| R-TOOL-11 | Repository `.claude/settings.json` may set `extraKnownMarketplaces` + `enabledPlugins`. The marketplace registers only after the contributor accepts workspace trust; a plugin the marketplace lists by relative path then loads from the marketplace copy, while an externally sourced plugin shows "enabled in project settings but isn't installed". ECC's `marketplace.json` lists `ecc` with `source: "./"`. Refines R-TOOL-2. | VERIFIED SOURCE (docs read 2026-10-16) | code.claude.com/docs/en/plugins/org, /settings | D-030 | Fresh-clone check on a teammate machine | High |

## 3. Recommended stack and explicit fallbacks

One stack, consistent with D-004, D-010, D-011, D-012 and D-017. All rows are **DESIGN DECISION (PROPOSED)**. Versions are pinned at kickoff.

| Layer | Recommended | Evidence | Explicit fallback |
|---|---|---|---|
| Runtime and language | TypeScript on Node 22 LTS; pnpm | R-PH-3 (engines >= 22), R-AI-4 (>= 20) | — |
| Web | Next.js App Router (16.4.2 observed), Zod, Vitest, Tailwind + shadcn/ui; route handlers on Node runtime | R-INF-10 | — |
| Data | Supabase Postgres Free, **created at kickoff**, via Drizzle + postgres.js on transaction pooler 6543 with `prepare: false`. **PGlite** for tests and zero-setup local dev (same repository code). | R-INF-1, R-INF-6, R-INF-7, R-INF-8 | `STORE=pglite` local; personal Supabase project (D-006) |
| Claims and idempotency | Row lock + conditional updates + partial unique index; inbound dedupe via `ON CONFLICT DO NOTHING` | R-INF-6, R-PH-6 | — (correctness never depends on a provider) |
| Timers | Lazy expiry in claim/decline transactions. Liveness by idempotent `tick`: worker every 5 s; `pg_cron` + `pg_net` if Free supports it; operator "Run tick now". | R-INF-2, R-INF-3, R-INF-5 | QStash `Upstash-Not-Before` as a single-call add-on (D-010). No Inngest, Vercel Cron or Vercel Workflows. |
| Messaging | Photon 2.0 Beta HTTP API via `fetch`; iMessage shared line; JOIN opt-in; `YES/NO <code>`, STOP, HELP. Inbound: webhook → worker Socket.IO relay → worker poll relay. | R-PH-1..R-PH-11 | Labeled **simulated phone** (fake gateway, same inbound handler). Photon track not claimed without T-MS-13. No SMS. |
| Vision | `@google/genai` 2.30.0, server-only; `gemini-3.5-flash-lite` default, `gemini-3.8-flash` alternative; JSON schema + strict Zod; 15 s timeout; `store:false` on Interactions | R-AI-1..R-AI-6 | Labeled fake adapter; manual entry path always works (AC-03) |
| Hosting | Vercel Hobby (web) + worker on the demo laptop; captain owns the Vercel project | R-INF-2, R-INF-4 | Ladder (D-017): (2) `next start` + worker locally against Supabase (cloudflared quick tunnel only if webhooks are needed); (3) fully local, fake providers, labeled |
| Dashboard updates | Poll every 2 s (no Supabase Realtime) | D-006 | — (see OPEN RISK on Vercel CPU budget, §5) |

**Rejected (with evidence):** Vercel Cron (R-INF-3), Inngest (extra vendor, Deployment Protection pitfall, R-INF-9), Railway/Render/Fly as primary host (R-INF-9), Neon (no cron or storage, R-INF-9), Supabase Realtime (setup cost; D-006), SMS (10DLC + cost, R-PH-10), `spectrum-ts` (legacy, R-PH-1), Perceptron (duplicates Gemini, R-SP-8).

## 4. Questions a qualified operator, receiving partner or PHSKC must answer before any real deployment

Prototype answers are synthetic. None of these is answered by this repo. (Sources: R-REG-1..R-REG-13, R-PH-10.)

| # | Question | Who answers | Evidence gap |
|---|---|---|---|
| Q1 | Does a platform that relays donor-attested facts and dispatches couriers need any registration, permit or notification in King County? | PHSKC | R-REG-7 NOT FOUND |
| Q2 | Under whose authority may volunteer couriers carry TCS food for a DFDO? What vehicle, container and temperature-control standards, and what records? | PHSKC, receiving partner | R-REG-7 |
| Q3 | Which donor facts must the DFDO obtain before acceptance, and would a structured digital record support its receiving inspection and 90-day records? | Receiving partner, PHSKC | R-REG-6, R-REG-12 |
| Q4 | Which food types and handling modes can each partner accept with its actual equipment (cold storage, hot holding, reheating to 165 °F)? | Receiving partner | R-REG-12, R-REG-13 |
| Q5 | Is a temperature log required? Which readings, at which steps (holding, pickup, receipt), and who measures at receipt? | Operator, partner | R-REG-1, R-REG-2 |
| Q6 | What maximum transit time and insulated or refrigerated container standard will the partner require? WAC states none. | Partner, operator | R-REG-7 |
| Q7 | Which donor date-marking or discard-by source is acceptable? May Annona ever display it to couriers? | Operator, PHSKC | R-REG-1, R-REG-3 |
| Q8 | Can cooked-then-cooled food ever be accepted? What cooling documentation would satisfy WAC 246-215-03515? | PHSKC, partner | R-REG-4 |
| Q9 | How must unknown allergens, cross-contact and ingredient lists be handled and disclosed to end clients? | Partner | R-REG-9, R-REG-12 |
| Q10 | Which partners serve highly susceptible populations, and what extra restrictions apply? | Partner, PHSKC | R-REG-12 |
| Q11 | Does any liability protection extend to couriers or the platform? What insurance and counsel review are needed? | Counsel, partner | R-REG-11 |
| Q12 | Confirm exclusions (previously served, distressed, specialized processing) and whether any donor holds an approved plan. | PHSKC | R-REG-6, R-REG-8 |
| Q13 | What contact and location data may be shared with couriers? What consent, opt-out and retention rules apply? | Operator, counsel | R-PH-10 |
| Q14 | Which WA Food Code edition and any pending rulemaking apply on the deployment date? | PHSKC / WA DOH | R-REG-10 |
| Q15 | Who is the accountable human for `needs_review` decisions, with what documented authority? | Operator, partner | D-007 |

## 5. Unresolved risks and kickoff spikes

**Open risks (OPEN RISK unless labeled):**

- **Photon access and behavior.** Sign-up latency is untested (beta looks ungated, per the launch post). It is unknown how long a JOIN keeps send permission, whether every participant gets the same pooled number, and what the webhook signature header is (R-PH-4..R-PH-6, R-PH-11). Mitigation for send permission (DESIGN DECISION): each courier phone sends a fresh inbound (JOIN) shortly before each judge demo, unless SP-3 shows permission lasts at least 3 hours.
- **Socket.IO replay retention is unstated** in Photon docs (R-PH-6). ARCHITECTURE §6 checkpoints the last relayed cursor to `.data/photon-cursor` and resubscribes from it; with no checkpoint it back-fills with one poll using `createdSince = now − 10 min`. That window is an ASSUMPTION; dedupe absorbs overlap.
- **Supabase `pg_cron` on Free is UNVERIFIED** (R-INF-5). `pg_net` requests can be lost on crash. Correctness is unaffected (lazy enforcement).
- **Vercel Hobby budget (ASSUMPTION, estimate).** 2 s dashboard polling, the 5 s worker tick and a 10 s `pg_cron` tick all hit Vercel functions. Several open tabs over ~20 h could approach the 4 active CPU-hours/month; overage can lock features ~30 days (R-INF-4). Mitigation: develop against local `next dev`; only judge-facing tabs poll the deployment; pause polling when the tab is hidden.
- **Vercel deploys** from non-owner commits are blocked on Hobby; commit email must match (R-INF-4).
- **Gemini latency and quota** are unknown until measured; quotas are per project (R-AI-5, R-AI-6).
- **VEYZL may produce no actionable finding** in time (R-SP-3; D-022).
- **Pro usage limits** may stall a lane; this machine pins Opus at xhigh effort (R-TOOL-6, R-TOOL-10).
- **Organizer interpretation.** Whether pre-event docs may sit in the repo, and whether sponsor accounts may be created before 12:30 PM, is unconfirmed (R-DH-3, R-DH-12).
- **Devpost form** may lack some track checkboxes or impose a video cap (R-DH-5, R-SP-9).
- **Regulatory gray area** for couriers and platforms (R-REG-7). Real use is not authorized by anything here.

**Kickoff spikes (all at or after Sat 12:30 PM PDT; record VERIFIED or UNVERIFIED in `docs/handoffs/dev-N.md`):**

| Spike | Owner lane | Timebox | Decides |
|---|---|---|---|
| SP-1 Photon Beta sign-up, project, key, one assignment, JOIN → reply round trip | Dev 3 | 30 min | Real vs labeled-fake messaging (D-011); whether the Photon track can be claimed |
| SP-2 Photon inbound transport: webhook destination to a deployed route with signature check; else Socket.IO; else poll | Dev 3 (+ Dev 4 for URL) | 45 min | ARCHITECTURE §6 transport choice; worker scope |
| SP-3 Send permission longevity: offer sent ≥ 30 min after JOIN; failure code for a never-joined peer; pooled number per participant | Dev 3 | 20 min + re-test Sat night | Demo-day JOIN timing (default: fresh JOIN from each courier phone before each judge demo); T-MS-10 failure mapping |
| SP-4 Gemini: Interactions vs `generateContent` with schema + inline image (+ `store:false`) on 2.30.0; p50 latency on venue Wi-Fi; AI Studio quota | Dev 1 | 30 min | Adapter API surface, `GEMINI_MODEL`, 15 s timeout (D-012) |
| SP-5 Supabase project at kickoff: pooler 6543 + `prepare:false`; `cron.schedule('…','10 seconds',…)` | Dev 2 (+ captain for project) | 30 min | D-010 tick driver 2; connection settings |
| SP-6 PGlite inside `next dev` with Drizzle | Dev 2 | 30 min | D-006 local-dev path, or personal Supabase projects |
| SP-7 Two-connection claim race on real Postgres (20 runs), through the transaction pooler like the demo | Dev 2 | 20 min | T-CO-17, **required** before any race-safety claim (D-033) |
| SP-8 Vercel project, first deploy, merge from a non-owner commit, `/api/health` | Dev 4 | 30 min | D-017 ladder step; captain-CLI deploys |
| SP-9 Photo downscale stays ≤ 1.5 MB on a real phone | Dev 1 (+ Dev 4) | 15 min | T-IN-09 limits; Vercel 4.5 MB safety |
| SP-10 Devpost: track checkboxes, video cap, rules/IP text in a real browser | Dev 4 (captain) | 15 min | Final track list (D-001); R-DH-12 |
| SP-11 VEYZL GitHub App on the public repo; time from PR to check | Dev 4 (captain) | 20 min | D-022 schedule |
| SP-12 #ask-dh: pre-event docs in repo; sponsor accounts before 12:30 PM | Dev 4 (captain), before kickoff | 10 min | D-002 README wording |
| SP-13 Tooling check per human: `/status`, `claude plugin list`, ECC enabled at user/local scope, `/model sonnet`, `/effort medium`, `ANTHROPIC_API_KEY` unset | Each human | 10 min | D-014 compliance |
| SP-14 **Photo intake** (D-031), 12:30–1:15 PM, outside the repo: the donor iPhone (after JOIN) texts a synthetic platter photo to the Photon line; download the attachment through the API; record MIME (HEIC or JPEG), byte size, `ATTACHMENT_NOT_READY` retries and time to bytes. Dev 1 sends those exact bytes to the real Gemini model and records whether HEIC is accepted. R-AI-2 lists HEIC/HEIF as supported, but nobody has tested it here. | Dev 3 + Dev 1 | 15 min | Pass: photo-by-message is the primary demo path; `HEIC_ACCEPTED` may be set from the result. Fail or unreliable: web upload first; photo intake resumes only after CP2 is green; the demo may open on web upload. Fallback without code: set the donor iPhone's camera to "Most Compatible" (JPEG). |

## 6. Claims Annona must not make

| Do not say | Why | Say instead |
|---|---|---|
| "Safe", "allergen-free", "certified", "compliant", "approved by King County" | AI and photos cannot establish these (R-AI-3); no review happened (R-REG-10) | "Eligible for dispatch under a prototype operator policy, based on donor-attested records" |
| "AI detects allergens / ingredients" or any shelf-life / "safe until" countdown | R-AI-3; R-REG-3 | "AI suggests possible allergens; the donor declares them" |
| "Annona gives donors/couriers Good Samaritan protection" | R-REG-11 names neither | "Annona documents donor-attested facts; it provides no legal protection" |
| "Verified DFDO / registered with PHSKC" for any profile | Synthetic seed (R-REG-5) | "Synthetic, operator-set status" |
| "First food rescue app" / "first real-time matching" / "no one uses messaging for rescue" | R-CMP-1..R-CMP-3 | "We did not find a no-install iMessage offer flow" |
| "Seattle has no prepared-food rescue" / "UW surplus goes unrecovered" | R-CMP-5, R-CMP-6 | "Scheduled programs exist; we target unscheduled small lots (hypothesis)" |
| Partnership with Food Lifeline, UW, Feeding America or any real org | None exists | Fictional "(synthetic)" names only |
| Impact numbers (lbs, meals, CO₂) | No real rescues | Test outcomes only (MVP §8) |
| "Live on Photon" / "real Gemini" without recorded evidence | R-SP-1, R-SP-5 | Show `provider_message_id`s and model ID, or label fake mode |
| "Delivered" because Photon returned 202 | 202 ≠ delivered (R-PH-7) | Show `delivery_status` from events |
| "VEYZL certifies EU AI Act / NIST / ISO 42001 compliance" | The audit cites controls; it is not certification (R-SP-3) | "A VEYZL audit finding changed this code" |
| "Replaces food banks" | R-CMP-5 | "Complements existing networks" |
| Any trademark or naming clearance | R-CMP-8 | "Hackathon codename" (D-019) |

## 7. Verification notes

### 7.1 What the adversarial pass corrected

| Area | Researcher said | Verifier found (adopted) | Affects |
|---|---|---|---|
| A1 | Devpost unreachable; site's 10:30 AM was probably the judging workshop; "Devpost locks at 10:00" | Devpost dates page reachable via curl: platform period ends **10:30 AM PDT**. Organizer text (guide, judging page, Devpost overview) says 10:00 AM hard. 10:00 stays binding. | R-DH-2; D-003 |
| A1 | Draft needs overview + tracks | Also **all contributors with Discord handles**; no draft means no judging; eligibility 18+ college students | R-DH-4, R-DH-11 |
| A1 | Community Kitchen topic list on title-tracks page | Longer list (social good, coordination tools, sustainability) is in the main guide | R-DH-7 |
| A1b | Swap in another sponsored track if one fails | Spine chose **drop, not swap** (D-001, D-018). Researcher fallback not adopted. | R-SP-3 |
| A1b | Video must show Photon/VEYZL; account setup before 12:30 is "not code" | Both are inferences, not rules; account timing goes to #ask-dh (SP-12) | R-DH-5, R-DH-12 |
| A4a | Beta "apply for early access" may gate access | Phrase exists only in meta tags; launch post (Oct 15, 2026) says **public beta, $100 credit**. Sign-up still untested. | R-PH-1 |
| A4a | Which SDK is "Photon 2.0" is ambiguous | Largely settled by the launch post and docs: **Beta API = 2.0**; guide's `app.photon.codes` link is the Stable dashboard | R-PH-1 |
| A4a | 2.0 webhook semantics undocumented | **Partly documented:** Standard-Webhooks-compatible, retries with backoff, retry budget, dead-letter, per-destination head-of-line ordering. Signature header still unconfirmed. | R-PH-6 |
| A4a | Content union lists "typing" | Actual type `space.typing.update`; `space.participants.update` also exists. Conclusion unchanged: free-text claims. | R-PH-9 |
| A4b | SDK needs Node 22 | `@google/genai` **2.30.0** is latest (Node >= 20); **3.0.0 is unreleased** | R-AI-4; D-012 |
| A4b | 3.5 Flash-Lite is the cheapest model | Cheapest of the **recommended** models; `3.1-flash-lite` is cheaper but shuts down 2027-05-07 | R-AI-1 |
| A4b | Interactions API status unclear; storage not mentioned | GA since June 2026; **stores by default** (1 day on free tier) → `store:false` | R-AI-3, R-AI-5 |
| A4b | MLH Gemini prize unconfirmed for DubHacks | Confirmed on the DubHacks non-sponsored tracks page (A1b) | R-SP-5 |
| A4c | Vercel non-owner deploy block from a 2024 community thread | **Official KB** confirms owner-only deploys on Hobby and commit-email matching. "Make the repo public" fix is not official. | R-INF-4 |
| A4c | Vercel WebSockets exclude outbound | Inference; conclusion holds because connections end at max duration | R-INF-2 |
| A4c | Missed | Hobby overage lockout (~30 days), 100 deploys/day; Supabase no backups; disabling `pg_cron` deletes jobs | R-INF-1, R-INF-4, R-INF-5 |
| A2 | TPHC is a general 4 h allowance | Optional, written-procedure control in specific contexts only | R-REG-3 |
| A2 | Home kitchens give only non-TCS and intact packages | Also commercially packaged frozen; intact packages limited to non-TCS RTE | R-REG-6 |
| A2 | RCW 69.80.031 cited without amendment | **Amended 2022** (qualified direct donors; past-date perishables need good-faith evaluation) | R-REG-11 |
| A2 | 4 h "cumulative" danger-zone limit | "Cumulative" is an interpretation of DOH guidance, not rule text | R-REG-1 |
| A3 | Food Rescue Hero has 23 partners | **25 partner orgs**, ~63k volunteers, 1M rescues (Aug 2026 release) | R-CMP-2 |
| A3 | Eat Happy Now: ASAP rescues; 16k vs 140k lbs | June 2025 report: **mostly scheduled**, **675k lbs, 475 volunteers**; 16k is stale, 140k not found | R-CMP-5 |
| A3 | Seattle's Table is a current program | Sources ~2014–2015; absent from current Food Lifeline pages → 2026 status UNVERIFIED | R-CMP-5 |
| A3 | No messaging-based incumbent | MealConnect has in-app chat since 2023 → differentiator narrowed to no-install iMessage + TTL + atomic claim | R-CMP-3, R-CMP-9 |
| A5 | Don't use the npx installer | `npx ecc-universal@2.2.3 setup` is ECC's **official scope/repair tool**, not a duplicate install; `install.sh --profile full` after the plugin is the duplicate | R-TOOL-1; D-014 |
| A5 | `default` is an alias; 5.5 models default to medium | `default` is a special value (runtime default). This machine overrides to opus + xhigh. | R-TOOL-7, R-TOOL-10 |
| A5 | Worktrees fail with zero commits (documented); ECC entry "overwritten" | Both are inferences. ECC was loaded in the session; verify with `claude plugin list`. | R-TOOL-8, R-TOOL-10 |

### 7.2 Still UNVERIFIED after both passes (hypotheses, not facts)

- Photon: sign-up latency; send-permission lifetime after JOIN; pooled-number behavior; webhook signature header; delivery-event reliability; real latency; replay retention (SP-1..SP-3).
- Supabase `pg_cron` on the Free plan (SP-5). PGlite under `next dev` (SP-6).
- Gemini numeric free-tier limits and real latency (SP-4).
- Devpost video length cap, track checkboxes and IP terms (SP-10).
- Railway card requirement (R-INF-9). Current status of Seattle's Table and TGTG Seattle (R-CMP-5, R-CMP-7).
- Not re-fetched by the verifier: WAC 246-215-03515 (cooling), -09406 (reheating), and the -01115 eight-allergen definition (R-REG-4, R-REG-9, R-REG-12).
- Whether organizers treat pre-event planning docs and sponsor account creation as "ideation" (SP-12).

### 7.3 Unreachable or partly read sources

- `dubhacks-2026.devpost.com` (rules, dates, overview): 403 to WebFetch; overview and dates later read via curl. Rules IP/license terms not fully read. `/details/prizes` returned 404.
- Hacker Guide child block `c7fff32c-1d7e-82ac-8152-017564a1d1fc` was never returned by the Notion API.
- T-Mobile brief (`.docx`) and Cloudforce description (`.html`) attachments: Notion signed URL returned null.
- `photon.co` and `photon.co/beta`: parked domain (redirect to a for-sale page). `app.beta.photon.codes`: authenticated dashboard; no account created.
- `photon.codes/docs/beta/messaging/index.md`: placeholder only. `asyncapi.yaml`: transport frames only.
- `mlh.link/commit-fellowship-form`: JS-only Typeform; fields and deadline unread.
- `npmjs.com` package pages: 403 (registry API used instead).
- USDA FNS, USDA food-loss and FSIS leftovers pages: 403. Federal statute read via Cornell LII (secondary reproduction). `congress.gov` S.5329: snippet only.
- `app.leg.wa.gov` WAC 246-215-01115: first ~100k of ~125k characters read.
- `toogoodtogo.com`: 429. `rescuingleftovercuisine.org`: 403. `replatefood.com`: DNS failure. `foodrescue.us/locations/`: 404. Idealist Eat Happy Now posting: 404.
- `aistudio.google.com` rate-limit page: requires sign-in (not attempted).
- Upstash QStash cancel docs: 404.
- ECC README, Claude Code model-config and Superpowers release notes: first ~100k characters only.

## 8. Source key

WAC sections use `https://app.leg.wa.gov/wac/default.aspx?cite=246-215-<section>` (e.g., `WAC-03525` → `cite=246-215-03525`).

| Key | Source | URL |
|---|---|---|
| HG | DubHacks '26 Hacker Guide (Notion) | https://dubhacks.notion.site/The-DubHacks-26-Hacker-Guide-15dff32c1d7e83748aac8154036aa658 |
| JO | Submissions and Judging Overview | https://dubhacks.notion.site/14eff32c1d7e837793e2018a30a234cb |
| RUB | Official Judges Rubric | https://dubhacks.notion.site/154ff32c1d7e8304a76b011636f6732f |
| TT | Title tracks | https://dubhacks.notion.site/bbaff32c1d7e8308be7d8185bd983487 |
| SST | Sponsored side tracks | https://dubhacks.notion.site/5e3ff32c1d7e834d9844812256c9fa06 |
| NST | Non-sponsored side tracks | https://dubhacks.notion.site/cc7ff32c1d7e83f7a1c9818214afba7f |
| PRZ | Prizes page | https://dubhacks.notion.site/7f2ff32c1d7e83cbb22981e0c329c033 |
| DP | Devpost overview | https://dubhacks-2026.devpost.com/ |
| DPD | Devpost dates | https://dubhacks-2026.devpost.com/details/dates |
| DPR | Devpost rules | https://dubhacks-2026.devpost.com/rules |
| DH26 | DubHacks site schedule | https://dh26.dubhacks.co/ |
| MLHP | MLH prize categories | https://www.mlh.com/events/prizes |
| CF | MLH Commit Fellowship | https://fellowship.mlh.com/commit-fellowship |
| VZ | VEYZL home and developer docs | https://veyzl.ai/ ; https://veyzl.ai/developers.md |
| PCP | Perceptron Mk1.5 scaling | https://docs.perceptron.inc/perceptron-mk1.5/guides/scaling.md |
| PG | Photon hackathon guidelines (Notion) | https://somethingreat.notion.site/Hackathon-Guidelines-for-Photon-2-0-3f8e443f36bb81f9893fed0d08a4c01d |
| PLL | Photon docs index | https://photon.codes/docs/llms.txt |
| PBL | "Introducing Photon 2.0" (Oct 15, 2026) | https://photon.codes/blog/introducing-photon-2.0 |
| PBETA | Photon beta landing | https://photon.codes/beta |
| PIDX | Photon Beta docs index | https://photon.codes/docs/beta/index.md |
| PPROJ | Photon Beta project setup | https://photon.codes/docs/beta/get-started/project.md |
| PCRED | Photon Beta credentials | https://photon.codes/docs/beta/api-client/credentials.md |
| PIM | Photon Beta iMessage guide | https://photon.codes/docs/beta/get-started/imessage.md |
| POA | Photon OpenAPI spec | https://api.photon.codes/openapi.json |
| PWS | Photon websocket docs | https://photon.codes/docs/beta/websocket/connect.md ; …/cursors.md ; …/frames.md |
| PRT | Photon retries and problem catalog | https://photon.codes/docs/beta/api-client/retries-and-timeouts.md ; https://photon.codes/docs/beta/problems/catalog.md |
| PPB | Photon plans and billing | https://photon.codes/docs/beta/plans-and-billing.md |
| PTOS | Photon terms | https://photon.codes/terms-of-services |
| PMSG | Photon Beta messaging (placeholder) | https://photon.codes/docs/beta/messaging/index.md |
| PNPM | npm registry `@photon-ai/api` | https://registry.npmjs.org/@photon-ai%2fapi |
| GMOD | Gemini models | https://ai.google.dev/gemini-api/docs/models |
| GDEP | Gemini deprecations | https://ai.google.dev/gemini-api/docs/deprecations |
| GTH | Gemini thinking | https://ai.google.dev/gemini-api/docs/thinking |
| GIMG | Gemini image understanding | https://ai.google.dev/gemini-api/docs/image-understanding |
| GSO | Gemini structured output | https://ai.google.dev/gemini-api/docs/structured-output |
| GINT | Gemini Interactions overview | https://ai.google.dev/gemini-api/docs/interactions-overview |
| GMIG | Migrate to Interactions | https://ai.google.dev/gemini-api/docs/migrate-to-interactions |
| GLIB | Gemini libraries | https://ai.google.dev/gemini-api/docs/libraries |
| GJS | js-genai README; npm latest | https://github.com/googleapis/js-genai ; https://registry.npmjs.org/@google/genai/latest |
| GPR | Gemini pricing | https://ai.google.dev/gemini-api/docs/pricing |
| GTOS | Gemini API terms | https://ai.google.dev/gemini-api/terms |
| GRL | Gemini rate limits | https://ai.google.dev/gemini-api/docs/rate-limits |
| GSAF | Gemini safety settings | https://ai.google.dev/gemini-api/docs/safety-settings |
| SBP | Supabase pricing | https://supabase.com/pricing |
| SBU | Supabase upgrading / pause restore | https://supabase.com/docs/guides/platform/upgrading |
| SBC | Supabase Cron, quickstart, install | https://supabase.com/docs/guides/cron ; …/cron/quickstart ; …/cron/install |
| SBF | Supabase Cron feature page | https://supabase.com/features/supabase-cron |
| SBN | Supabase pg_net | https://supabase.com/docs/guides/database/extensions/pg_net |
| SBCX | Supabase connecting to Postgres | https://supabase.com/docs/guides/database/connecting-to-postgres |
| SBCLI | Supabase CLI getting started | https://supabase.com/docs/guides/local-development/cli/getting-started |
| VFL | Vercel Functions limitations | https://vercel.com/docs/functions/limitations |
| VWS | Vercel WebSockets KB | https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections |
| VCR | Vercel cron usage and pricing | https://vercel.com/docs/cron-jobs/usage-and-pricing |
| VHB | Vercel Hobby plan | https://vercel.com/docs/plans/hobby |
| VKB | Vercel commits not triggering deployments | https://vercel.com/kb/guide/commits-not-triggering-deployments |
| PGTX / PGIX / PGINS / PGSEL | PostgreSQL docs | https://www.postgresql.org/docs/current/transaction-iso.html ; …/indexes-partial.html ; …/sql-insert.html ; …/sql-select.html |
| RW / RND / FLY / NEON | Railway, Render, Fly.io, Neon pricing | https://docs.railway.com/reference/pricing/free-trial ; https://render.com/docs/free ; https://docs.fly.io/about/pricing ; https://neon.com/pricing |
| ING / QS | Inngest pricing and Vercel deploy; QStash delay | https://www.inngest.com/pricing ; https://www.inngest.com/docs/deploy/vercel ; https://upstash.com/docs/qstash/features/delay |
| NPM | npm registry latest (per package) | https://registry.npmjs.org/<package>/latest |
| DOH | WA DOH charity food donations | https://doh.wa.gov/community-and-environment/food/food-worker-and-industry/charity-food-donations |
| DOHFC | WA DOH Food Code rule revision | https://www.doh.wa.gov/CommunityandEnvironment/Food/FoodWorkerandIndustry/FoodSafetyRules/FoodCodeRuleRevision |
| KC | King County donating food | https://kingcounty.gov/en/dept/dph/health-safety/food-safety/donating-food |
| FDAA | FDA food allergies | https://www.fda.gov/food/nutrition-food-labeling-and-critical-foods/food-allergies |
| FDAFC | FDA Food Code | https://www.fda.gov/food/retail-food-protection/fda-food-code |
| RCW | RCW 69.80.031 | https://app.leg.wa.gov/RCW/default.aspx?cite=69.80.031 |
| USC | 42 USC 1791 (Cornell LII reproduction) | https://www.law.cornell.edu/uscode/text/42/1791 |
| FRUS | Food Rescue US | https://foodrescue.us/ |
| FRH | Food Rescue Hero | https://foodrescuehero.org/ ; https://foodrescuehero.org/one-million-food-rescues/ |
| MC | MealConnect; Feeding America release | https://mealconnect.org/ ; https://www.feedingamerica.org/about-us/press-room/mealconnect-5-billion-pounds-rescued |
| REP / COP / GOODR / SPA | Replate, Copia, Goodr, Spoiler Alert | https://www.replate.org/ ; https://www.gocopia.com/ ; https://goodr.co/ ; https://www.spoileralert.com/ |
| FLL | Food Lifeline; Edible Seattle (~2014) | https://foodlifeline.org/donate-food ; https://www.edibleseattle.com/explore/origin-story/the-logistical-link |
| NWH | Northwest Harvest | https://www.northwestharvest.org/ |
| EHN | Eat Happy Now; Snoho.com (June 2025) | https://eathappynow.org/ ; https://www.snoho.com/news/2025/jun/11/novel-food-rescue-program-has-volunteers-deliver-from-store-to-food-bank-by-app/ |
| UW | Any Hungry Husky; CSF grant; FRN WA | https://www.washington.edu/anyhungryhusky/ ; https://csf.uw.edu/node/1002 ; https://frnconnect.foodrecoverynetwork.org/state/wa |
| TGTG / OLIO | Issaquah Reporter (2021); OLIO | https://www.issaquahreporter.com/2021/06/14/too-good-to-go-app-aims-to-creatively-reduce-food-waste/ ; https://olioapp.com/en/ |
| ANN | Annona company profile (aggregator snippet) | https://www.cbinsights.com/company/annona |
| ECC | ECC repository README | https://github.com/affaan-m/ECC |
| CCH | ECC hooks README | https://github.com/affaan-m/ECC/blob/main/hooks/README.md |
| SP | Superpowers README and release notes | https://github.com/obra/superpowers ; https://github.com/obra/superpowers/blob/main/RELEASE-NOTES.md |
| CCP | Claude Code plugins docs | https://code.claude.com/docs/en/discover-plugins ; https://code.claude.com/docs/en/plugins/loading |
| CCS | Claude Code with Pro/Max | https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan |
| CCM | Claude Code model configuration | https://code.claude.com/docs/en/model-config |
| CCW | Claude Code worktrees | https://code.claude.com/docs/en/worktrees |
| CCMEM | Claude Code memory and settings | https://code.claude.com/docs/en/memory ; https://code.claude.com/docs/en/settings |
| LOCAL | Organizer machine inspection (no URL) | `~/.claude/plugins/installed_plugins.json`, `~/.claude/settings.json`, repo `.claude/settings.json`, `git`, `node --version` |
