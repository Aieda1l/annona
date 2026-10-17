# Dev 2 handoff log (append-only)

## PR 1a: pure gate + matching + state (slice 1)

LANE / BRANCH / COMMIT: Dev 2 (gate, matching, state, DB) / feat/dispatch / see PR head

DELIVERED:
- `src/core/clock.ts`: `createTestClock`, `systemClock`.
- `src/core/eligibility.ts`: `evaluateEligibility`, G-01..G-13, all rules evaluated, reject > review > eligible, `field_states`.
- `src/core/matching.ts`: `findCandidates` (M-01..M-10), `classifyUnmatched` (NO_ELIGIBLE_MATCH vs CANDIDATES_EXHAUSTED).
- `src/core/state.ts`: S-01..S-18 and offer transition tables with pure guards (`canTransition`, `canOfferTransition`).
- `src/core/types.ts`: lane-local mirrors of DonorProfile, PolicyConfig, RecipientOrg, CourierProfile, MatchCandidate until contracts-2.
- Tests: T-CO-01..T-CO-11, T-CO-12, T-CO-13, T-CO-14 (pure part), T-CO-15 (table part).

EVIDENCE (commands run locally on this branch; pure functions, no database, nothing real):
- `pnpm typecheck`: exit 0
- `pnpm lint`: exit 0
- `pnpm test`: 6 files, 310 tests passed. Extra check outside the repo: seeded random fuzz (16,000 gate inputs, 6,000 matching inputs, 60,000 transitions) against an independent oracle, all passed.
- Secret scan (ARCHITECTURE §9) over unpushed commits: clean; no tracked `.env*`.
- NOT RUN / UNVERIFIED: T-CO-15 persistence half (owning functions), T-CO-16, T-CO-17 (real Postgres), T-CO-23. Claim race safety is UNVERIFIED (D-033).

CONTRACT CHANGES OR REQUESTS (captain):
- Type `DonorProfile`, `PolicyConfig`, `RecipientOrg`, `CourierProfile`, `MessagingIdentity`, `MatchCandidate` in `@/contracts`; `src/core/types.ts` mirrors them for now.
- CONTRACTS §6 `findCandidates` input is implemented EXACTLY as listed (no added keys). Two gaps follow from that, captain to decide: (a) M-04 net of committed servings and M-09 busy couriers cannot be decided from the §6 input, so `findCandidates` uses raw capacity and ignores busy couriers; the claim transaction (step 8) and the courier unique index in `createNextOffers` must enforce them (PR 1b). (b) `donation` needs the donor location to compute distance; it is typed `{ id, donor_location }` inside the existing `donation` key, but §6 does not say where it comes from.
- Confirm the NO_ELIGIBLE_MATCH vs CANDIDATES_EXHAUSTED rule (exhausted = feasible without exclusions, none left with them).
- Confirm `field_states` mapping: `unknown` for unknown/null, `needs_review` for a concrete value needing a person, `rejected` for a reject, else `donor_verified`.
- G-01 for a pending donor with `licensed_food_establishment=false` is unspecified; implemented as review (DONOR_APPROVAL_PENDING).
- Review fixes in this PR: S-03/S-18 target status must equal `gate_outcome`; operator triggers (`operatorCancel`, `operatorReject`, `returnToDonor`, `retryMatching`) need `actor_role = operator`; a collected `needs_review` donation (S-17) no longer expires via S-08; M-04 and policy numerics fail closed on NaN; times must be UTC ISO strings (`Date.parse` leniency such as `12345` or `"1"` no longer counts); plain-order rank tie-break. The `@/core` barrel exports only what CONTRACTS §9.3 lists (`evaluateEligibility`, `findCandidates`, `createTestClock(start: Date)`); other core modules are reached by path inside this lane.
- OPEN, needs captain: the §6 input has no active-provider value, so `findCandidates` assumes `identities` are already filtered to the active provider (M-05); the caller must do that. S-08 has no `donor_pickup_by` fallback when `effective_cutoff_at` is null (null never expires).

BLOCKERS + SAFETY RISKS:
- Gate rules need Dev 3's explicit OK (OWNERSHIP §6). Claim race safety UNVERIFIED until T-CO-17 passes on real Postgres.
- PR is larger than 400 lines (about 1,400, roughly 700 of them tests) because three vertical pure modules are bundled.

INTEGRATION STEPS: none required. Other lanes can import `evaluateEligibility`, `findCandidates`, `createTestClock`, `canTransition` from `@/core`.

NEXT SMALLEST ACTION: PR 1b (schema, migrations, deterministic seed, PGlite store, T-CO-23 PGlite half).
