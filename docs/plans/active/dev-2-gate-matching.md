# Dev 2 plan: slice 1a (pure gate + clock), then matching + state

Outcome: `pnpm test tests/core` shows T-CO-01..T-CO-11 passing; typecheck and lint clean.

1. `src/core/clock.ts`: `createTestClock(start: Date)` (fixed, advanceable).
2. `src/core/types.ts`: lane-local `DonorProfile`, `PolicyConfig`, `DEMO_POLICY` (CONTRACTS §3.1/§3.12) until contracts-2 types them.
3. RED `tests/core/eligibility.test.ts` for T-CO-01..T-CO-11 from `scene1_eligible_facts`.
4. GREEN `src/core/eligibility.ts`: G-01..G-13, all rules evaluated, precedence reject > review > eligible, `field_states`.
5. Export from `src/core/index.ts` (keep names stable). Then matching (T-CO-12/13), state table (T-CO-15), PR 1a.
6. PR 1b (open, PR #11, awaiting review; Postgres half of T-CO-23 and the claim race UNVERIFIED): `src/db/{schema,client,cli,internal,index,run-migrations,migrate}.ts`, generated migration, `src/db/seed/`, `tests/core/{db,db-edge,db-fuzz,db-cli,seed-integration}.test.ts` (T-CO-23 PGlite half).
7. Next: slice 2(a) intake-facing core functions (prompt section 6).

Done when: tests above green, `pnpm typecheck` + `pnpm lint` pass, PR 1a open with the handoff block.
No client time anywhere; the gate is pure and never accepts a VisionSuggestion.
