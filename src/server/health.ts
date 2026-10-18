import { SystemModes, ok, type Services } from "@/contracts";
import { getSystemStatus } from "@/core";
import { getEnv } from "./env";
import { getServices } from "./container";
import { toResponse } from "./http";

type HealthDeps = {
  getServices?: () => Services;
  getSystemStatus?: () => ReturnType<typeof getSystemStatus>;
};

/** GET /api/health → SystemModes (CONTRACTS §3.13). Never claims a mode or a time it did not read. */
export function createHealthHandler(deps: HealthDeps = {}) {
  const services = deps.getServices ?? getServices;
  const readStatus = deps.getSystemStatus ?? (() => getSystemStatus());
  return async function GET(_request: Request): Promise<Response> {
    const { vision, messaging, store } = services();
    // The last tick and the active policy come from core (Dev 2). If that read fails, the banner still shows the
    // provider modes, and the tick and policy say "not known" instead of a guess. The error text can hold a
    // connection string, so only its class name is logged.
    let status: { last_tick_at: string | null; policy_version: string } = { last_tick_at: null, policy_version: "unavailable" };
    try {
      status = await readStatus();
    } catch (error) {
      console.error(`[health] system status unavailable: ${error instanceof Error ? error.name : "unknown error"}`);
    }
    const modes = SystemModes.parse({
      vision: {
        mode: vision.mode,
        provider: vision.mode === "real" ? "gemini" : "fake",
        model: vision.model,
        status: vision.status,
      },
      messaging: {
        mode: messaging.mode,
        provider: messaging.mode === "real" ? "photon" : "fake",
        channel: messaging.channel,
        status: messaging.status,
      },
      store: store.kind,
      demo_accelerated: getEnv().demo_mode,
      last_tick_at: status.last_tick_at,
      policy_version: status.policy_version,
    });
    return toResponse(ok(modes));
  };
}

export const GET = createHealthHandler();
