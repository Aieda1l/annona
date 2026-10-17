import { getEnv } from "@/server/env";
import { createDispatchStore } from "./index";
import { closeStore } from "./internal";
import { runMigrations } from "./run-migrations";

// `pnpm db:migrate` (run from the repo root)
async function main() {
  const env = getEnv();
  const store = createDispatchStore({ kind: env.store, database_url: env.database_url, pglite_dir: env.pglite_dir });
  try {
    await runMigrations(store);
    console.log(`migrations applied (${store.kind})`);
  } finally {
    await closeStore(store);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
