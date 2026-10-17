# Dev 4 handoff log

## Slice 1 — operator dashboard on typed fixtures (feat/dashboard)

LANE / BRANCH / COMMIT: Dev 4 / feat/dashboard / see PR head

DELIVERED:
- `src/components/dashboard/`: StatusBadge, FieldStateBadge, ReasonList, DonationCard, DonationBoard (`unmatched` in its own neutral group), AllergenGrid (all nine allergens, AI hint beside donor statement), OfferList, Countdown (display only), AuditTimeline, IdentityList (masked handles), OperatorActions (offers controls only; server enforces), OperatorDashboard, format (America/Los_Angeles).
- `src/components/layout/`: ModeBanner (fake / real / MISCONFIGURED, stalled scheduler from server times), SyntheticBadge, LiveModeBanner (polls `/api/health`, shows an unavailable state instead of fabricating labels), ProfilePicker.
- `src/components/phone/ClaimResultView.tsx`.
- Pages: `/` (pitch, synthetic notice, profile picker), `/operator` (fixture data, labeled "FIXTURE DATA").
- Tests: T-UI-01..T-UI-05 plus AllergenGrid and OfferList/format tests under `tests/ui/`.

EVIDENCE (run locally in the feat/dashboard worktree; fixtures only, no real providers):
- `pnpm test`: 9 files, 105 tests passed. `pnpm typecheck`: exit 0. `pnpm lint`: exit 0. `pnpm build`: exit 0 (`/operator` prerendered static).
- Canonical secret scan (unpushed commits, `.env*` files): clean.

CONTRACT CHANGES OR REQUESTS: none filed. Observation: `tests/setup-jsdom.ts` lacks RTL auto-cleanup (vitest globals are off); each UI test file calls `afterEach(cleanup)`. Captain follow-up could add it to the setup file.

BLOCKERS + SAFETY RISKS:
- UNVERIFIED: live `/api/dashboard` wiring, polling, demo controls, simulated phone page, `/v` and donor pages (Slice 2, waiting on Dev 2's 2(c) and other lane PRs).
- `/api/health` currently returns `last_tick_at: null`, so the banner shows "Scheduler stalled — no tick recorded" until `getSystemStatus()` lands. This is truthful, not a bug.
- Components use plain Tailwind; they have not been migrated to the shadcn kit (PR #1, pending Dev 1 review).

INTEGRATION STEPS: merge PR #1 (ui-kit) first if desired, then rebase this branch on `main`.

NEXT SMALLEST ACTION: Slice 2 item 2: poll `GET /api/dashboard` every 2 s on `/operator` with a stale-data error panel.

## Slice 2a — polling + demo controls (feat/dashboard, PR #4)

DELIVERED: PR #1 (ui-kit) and #2 (slice 1 + polling) merged. `/operator` polls `GET /api/dashboard` every 2 s (pauses while hidden, stale/error panel, never fabricates). Demo controls (Run tick now, Reset demo with confirm, per-card Dispatch now on `eligible` cards only) appear only when `modes.demo_accelerated` is true. `/operator?fixture=1` renders labeled fixtures.

EVIDENCE: `pnpm test` 121 tests (11 files) passed, typecheck/lint/build exit 0, secret scan clean. Everything above is tested against mocked `fetch` only. UNVERIFIED against the real routes (`/api/internal/tick`, `/api/demo/reset`, `/api/donations/:id/dispatch`, `/api/dashboard`), which are still 501 stubs on main.

CONTRACT CHANGES OR REQUESTS: `TickReport` is not in `@/contracts` yet (planned for chore/integration-contracts-2). `postJson` summarizes the numeric fields of whatever the server returns; switch to the typed `TickReport` once it lands.

NEXT SMALLEST ACTION: simulated phone page `/operator/phone` (Slice 2 item 6), then operator detail page.

## Slice 2b — simulated phone (feat/dashboard-phone, stacked on PR #4)

DELIVERED: `/operator/phone` (`SimulatedPhone`, `PhoneThread`): header "SIMULATED PHONE — not iMessage"; one thread per identity from the dashboard snapshot (couriers and donor, masked handles only); JOIN / STOP / HELP / YES <code> / NO <code> / free text / fixture photo posted as `{ identity_id, text, fixture_id? }` to `POST /api/messaging/simulated/inbound`; `claim_result` rendered with `ClaimResultView`; disabled notice when messaging is real or the server answers 403; `/v` links in thread messages opened same-origin. Dashboard links to the phone only when messaging is fake.

EVIDENCE: `pnpm test` 131 tests passed (12 files) after the final edit, typecheck/lint/build exit 0 (see PR). Mocked `fetch` only: UNVERIFIED against the real inbound/thread routes (501 stubs on main).

CONTRACT CHANGES OR REQUESTS: `docs/requests/dashboard-phone-thread-shape.md` (thread element type is undefined in CONTRACTS §10). Fixture photo ids depend on Dev 1's `fixtures/intake/images/` (empty on main).

NEXT SMALLEST ACTION: operator detail page `/operator/donations/[id]`.

## Slice 2c - operator detail page (feat/dashboard-detail)

DELIVERED: `/operator/donations/[id]` (`LiveDonationDetail`, `DonationDetail`, `HandoffControls`, `FactsList`, `FixtureDonationDetail`). Polls `GET /api/donations/:id` every 2 s (pauses while hidden, stale/error panel, never invents a card; "stale since" uses the server `Date` header). Shows reasons verbatim, field states, donor-attested facts (labeled as stated by the donor, not checked), allergen table (expanded), offers, assignment, full audit timeline with AI/messaging mode labels, donor photo or "No image on file", operator actions, and simulated handoff buttons ("Mark collected (simulated)" on `claimed`, "Mark delivered (simulated) - recipient accepted after inspection" on `collected`) that post `{ step }` to the handoff route and show a refused step verbatim (e.g. `INVALID_TRANSITION`). Dashboard card titles link to the page. `?fixture=1` renders a loudly labeled fixture card with all actions disabled.

EVIDENCE: `pnpm test` 986 passed + 1 todo (37 files), lint/typecheck/build exit 0. Dev server run: fixture pages for claimed, eligible and needs_review return 200 and their server-rendered HTML has the expected labels and none of the forbidden safety words. That run found a real bug unit tests could not (a server page passed function props to a client component, 500); fixed by `FixtureDonationDetail`.
UNVERIFIED: 375 px visual layout (no Chrome on this machine for the devtools tool), and every live call (donation, handoff, operator-actions, images routes) is tested with mocked `fetch` only; the real routes are still 501 stubs on main.

NOTES: `next dev` generates an untracked `AGENTS.md` in the repo root; it must not be committed (CLAUDE.md). A captain follow-up could set `agentRules: false` in next.config or ignore the file.

CONTRACT CHANGES OR REQUESTS: none. Tests derive any missing status card from the 3 baseline fixtures until contracts-2 (#10) lands.

NEXT SMALLEST ACTION: `/v` page mounting Dev 1's `LinkVerification` (needs no session, no-referrer + no-store headers, T-UI-07), then `/donor/new` and the donor status page.
