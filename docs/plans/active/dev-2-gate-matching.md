# Dev 2 plan: slice 1a (pure gate + clock), then matching + state

Outcome: `pnpm test tests/core` shows T-CO-01..T-CO-11 passing; typecheck and lint clean.

1. `src/core/clock.ts`: `createTestClock(start)` (fixed, advanceable), `systemClock`.
2. `src/core/types.ts`: lane-local `DonorProfile`, `PolicyConfig`, `DEMO_POLICY` (CONTRACTS §3.1/§3.12) until contracts-2 types them.
3. RED `tests/core/eligibility.test.ts` for T-CO-01..T-CO-11 from `scene1_eligible_facts`.
4. GREEN `src/core/eligibility.ts`: G-01..G-13, all rules evaluated, precedence reject > review > eligible, `field_states`.
5. Export from `src/core/index.ts` (keep names stable). Then matching (T-CO-12/13), state table (T-CO-15), PR 1a.
6. Then PR 1b: schema, migrations, seed, PGlite store (T-CO-23 PGlite half).

Done when: tests above green, `pnpm typecheck` + `pnpm lint` pass, PR 1a open with the handoff block.
No client time anywhere; the gate is pure and never accepts a VisionSuggestion.
