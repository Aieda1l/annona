# Request: parse DEMO_*_HANDLE and TEST_DATABASE_URL in `getEnv()` (CONTRACTS §12)

Lane: Dev 2. For: captain (`src/server/env.ts` is captain-controlled).

- `pnpm db:seed` needs `DEMO_DONOR_HANDLE`, `DEMO_COURIER_A_HANDLE`, `DEMO_COURIER_B_HANDLE` (CONTRACTS §12). `getEnv()` does not parse them yet.
- Until it does, only the seed CLI (`src/db/seed/index.ts`) reads them from `process.env`, trimmed, never logged. Nothing else in Dev 2 code reads `process.env` except the gated test, which reads `TEST_DATABASE_URL`.
- Needed: add the four names to `EnvSchema` and `Env` (handles optional, empty string counts as unset). Dev 2 then switches the seed CLI and the test to `getEnv()`.
