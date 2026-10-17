import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { getEnv } from "@/server/env";
import { internalSecretFromEnv } from "./http/auth";
import { createRelay } from "./relay";

// `pnpm worker`: drives POST /api/internal/tick every TICK_INTERVAL_MS and, with MESSAGING_PROVIDER=photon, relays
// inbound Photon messages by polling (ARCHITECTURE §6). Run it on the demo laptop next to `pnpm start`.

const CURSOR_FILE = ".data/photon-cursor"; // gitignored
const DEFAULT_TICK_INTERVAL_MS = 5000;

const fileCursor = {
  async load(): Promise<string | null> {
    try {
      return (await readFile(CURSOR_FILE, "utf8")).trim() || null;
    } catch {
      return null;
    }
  },
  async save(iso: string): Promise<void> {
    await mkdir(dirname(CURSOR_FILE), { recursive: true });
    await writeFile(CURSOR_FILE, iso, "utf8");
  },
};

function fail(message: string): never {
  console.error(`[worker] ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const env = getEnv();
  const internalSecret = internalSecretFromEnv();
  if (!internalSecret) {
    fail("ANNONA_INTERNAL_SECRET is not available to the worker (see docs/requests/messaging-env-names.md). Not starting.");
  }
  if (!env.app_base_url) fail("APP_BASE_URL is not set. Not starting.");

  const photon =
    env.messaging_provider === "photon" && env.photon_project_id && env.photon_api_key
      ? { projectId: env.photon_project_id, apiKey: env.photon_api_key }
      : null;
  if (env.messaging_provider === "photon" && !photon) {
    fail("MESSAGING_PROVIDER=photon but PHOTON_PROJECT_ID or PHOTON_API_KEY is missing. Not starting.");
  }

  const tickIntervalMs =
    (getEnv() as unknown as { tick_interval_ms?: number }).tick_interval_ms ?? DEFAULT_TICK_INTERVAL_MS;
  const relay = createRelay({
    appBaseUrl: env.app_base_url,
    internalSecret,
    photon,
    clock: { now: () => new Date() },
    cursor: fileCursor,
  });

  const controller = new AbortController();
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => controller.abort());

  console.log(`[worker] started: tick every ${tickIntervalMs} ms, ${photon ? "polling Photon" : "fake messaging (tick only)"}`);
  await relay.run({ tickIntervalMs, signal: controller.signal });
  console.log("[worker] stopped");
}

void main();
