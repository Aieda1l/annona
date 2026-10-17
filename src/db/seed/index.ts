import { runCli, withEnvStore } from "../cli";
import { runMigrations } from "../run-migrations";
import { seedStore } from "./seed";

// `pnpm db:seed`. Handles are personal data: read from env only, never written to git, never printed (CONTRACTS §12).
// They come through getEnv() (blank counts as unset; resolveHandles trims and checks the shape).
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
      },
    });
    console.log(`seeded (${store.kind}, messaging ${env.messaging_provider})`);
    for (const s of report.stale_identities) {
      const what = [s.provider_differs ? "provider" : "", s.handle_differs ? "handle" : ""].filter(Boolean).join(" and ");
      console.warn(`WARNING: ${s.actor_role} identity ${s.id} is '${s.status}', so its ${what} was NOT updated to match this seed. resetDemo keeps identities and there is no un-join: delete that messaging_identities row (or, for a local store, remove the PGLITE_DIR folder) and run db:seed again.`);
    }
  }),
);
