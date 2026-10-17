REQUEST: Add the messaging env names to getEnv() (src/server/env.ts) so the internal-secret routes and the worker can read them
LANE: Dev 3
STATUS: approved
CONTRACT SECTION: docs/CONTRACTS.md §12 (env), src/server/env.ts
CHANGE: Add to the zod schema and to `Env`, all optional and treating "" as unset like the existing names:
  - `ANNONA_INTERNAL_SECRET` -> `internal_secret: string | undefined` (server-only, never NEXT_PUBLIC_*)
  - `TICK_INTERVAL_MS` -> `tick_interval_ms: number` (default 5000)
  - `PHOTON_INBOUND_MODE` -> `photon_inbound_mode: "poll" | "socket"` (default "poll"; webhook stays closed until its signature scheme is verified)
  - `PHOTON_WEBHOOK_SECRET` -> `photon_webhook_secret: string | undefined` (shown once at destination creation)
WHY (which acceptance criterion needs it): AC-12 (tick liveness) and AC-11 (inbound). `POST /api/internal/tick` and `POST /api/messaging/photon/inbound` authenticate the relay worker with `x-annona-internal-secret`, and `pnpm worker` needs the interval and mode.
COMPATIBILITY: additive. Until it lands, messaging reads `internal_secret` through a typed-loosely accessor (`src/workflows/http/auth.ts`), which returns undefined, so the internal-secret path stays CLOSED (every secret is rejected). The operator-session path ("Run tick now") is unaffected.
TESTS AFFECTED: none in other lanes. Dev 3 adds env-driven route tests once the names exist.
DECISION: Captain, PR #12 conversation, 2026-10-17: approved in principle; now PR #14 (getEnv() gains internal_secret, tick_interval_ms, photon_inbound_mode, photon_webhook_secret). Remove the as-unknown casts in src/workflows/http/auth.ts and src/workflows/worker.ts once #14 is on main.
MERGED SHA:
