import { runCli, withEnvStore } from "./cli";
import { runMigrations } from "./run-migrations";

// `pnpm db:migrate` (run from the repo root)
runCli(() =>
  withEnvStore(async (store) => {
    await runMigrations(store);
    console.log(`migrations applied (${store.kind})`);
  }),
);
