import { runCli, withEnvStore } from "../cli";
import { runMigrations } from "../run-migrations";
import { seedStore } from "./seed";

// `pnpm db:seed`. Handles are personal data: read from env only, never written to git, never printed (CONTRACTS §12).
// getEnv() does not parse DEMO_*_HANDLE yet, so this CLI is the only reader until the captain adds them
// (see docs/requests/dev2-demo-handle-env.md). Blank values count as unset (resolveHandles trims them).
runCli(() =>
  withEnvStore(async (store, env) => {
    await runMigrations(store);
    const report = await seedStore(store, {
      now: new Date(),
      messaging_provider: env.messaging_provider,
      handles: {
        donor: process.env.DEMO_DONOR_HANDLE,
        courier_a: process.env.DEMO_COURIER_A_HANDLE,
        courier_b: process.env.DEMO_COURIER_B_HANDLE,
      },
    });
    console.log(`seeded (${store.kind}, messaging ${env.messaging_provider})`);
    for (const s of report.stale_identities) {
      const what = [s.provider_differs ? "provider" : "", s.handle_differs ? "handle" : ""].filter(Boolean).join(" and ");
      console.warn(`WARNING: ${s.actor_role} identity ${s.id} is '${s.status}', so its ${what} was NOT updated to match this seed. Reset that identity (resetDemo / un-join) before the demo.`);
    }
  }),
);
