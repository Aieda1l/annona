import { runCli, withEnvStore } from "../cli";
import { runMigrations } from "../run-migrations";
import { describeStaleIdentity, seedStore } from "./seed";

// `pnpm db:seed`. Handles are personal data: read from env only, never written to git, never printed (CONTRACTS §12).
// The handles come from getEnv() (the captain added the DEMO_*_HANDLE names). Blank values count as unset (resolveHandles trims them).
runCli(() =>
  withEnvStore(async (store, env) => {
    await runMigrations(store);
    const report = await seedStore(store, {
      now: new Date(),
      messaging_provider: env.messaging_provider,
      handles: {
        donor: env.demo_donor_handle,
        courier_a: env.demo_courier_a_handle,
        courier_b: env.demo_courier_b_handle,
        recipient: env.demo_recipient_handle,
      },
    });
    console.log(`seeded (${store.kind}, messaging ${env.messaging_provider})`);
    for (const s of report.stale_identities) {
      console.warn(`WARNING: ${describeStaleIdentity(s)}`);
    }
  }),
);
