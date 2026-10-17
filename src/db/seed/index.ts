import { getEnv } from "@/server/env";
import { createDispatchStore } from "../index";
import { closeStore } from "../internal";
import { runMigrations } from "../run-migrations";
import { seedStore } from "./seed";

// `pnpm db:seed`. Handles are personal data: read from env only, never written to git (CONTRACTS §12).
// getEnv() does not parse DEMO_*_HANDLE yet, so this CLI is the only reader until the captain adds them
// (see docs/requests/dev2-demo-handle-env.md).
const pick = (v: string | undefined) => (v && v.trim() !== "" ? v.trim() : undefined);

async function main() {
  const env = getEnv();
  const store = createDispatchStore({ kind: env.store, database_url: env.database_url, pglite_dir: env.pglite_dir });
  try {
    await runMigrations(store);
    await seedStore(store, {
      now: new Date(),
      messaging_provider: env.messaging_provider,
      handles: {
        donor: pick(process.env.DEMO_DONOR_HANDLE),
        courier_a: pick(process.env.DEMO_COURIER_A_HANDLE),
        courier_b: pick(process.env.DEMO_COURIER_B_HANDLE),
      },
    });
    console.log(`seeded (${store.kind}, messaging ${env.messaging_provider})`);
  } finally {
    await closeStore(store);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
