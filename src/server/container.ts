import type { Clock, Services } from "@/contracts";
import { createVisionProvider } from "@/lib/ai";
import { createDispatchStore } from "@/db";
import { createMessagingGateway } from "@/integrations/photon";
import { getEnv } from "./env";

// Composition root (CONTRACTS §9.0). Memoized on globalThis so Next dev reuses it.
// This file never changes when lanes add real adapters (OWNERSHIP §2).

const systemClock: Clock = { now: () => new Date() };

const globalForServices = globalThis as unknown as { __annonaServices?: Services };

export function getServices(): Services {
  if (!globalForServices.__annonaServices) {
    const env = getEnv();
    globalForServices.__annonaServices = {
      vision: createVisionProvider({ mode: env.vision_provider, api_key: env.gemini_api_key, model: env.gemini_model }),
      store: createDispatchStore({ kind: env.store, database_url: env.database_url, pglite_dir: env.pglite_dir }),
      messaging: createMessagingGateway({
        mode: env.messaging_provider,
        project_id: env.photon_project_id,
        api_key: env.photon_api_key,
      }),
      clock: systemClock,
    };
  }
  return globalForServices.__annonaServices;
}
