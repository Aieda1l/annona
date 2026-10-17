import { SystemModes, ok } from "@/contracts";
import { getEnv } from "./env";
import { getServices } from "./container";
import { toResponse } from "./http";

/** GET /api/health → SystemModes (CONTRACTS §3.13). Never claims a mode it did not read from the providers. */
export async function GET(_request: Request): Promise<Response> {
  const { vision, messaging, store } = getServices();
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
    // Until Dev 2's getSystemStatus() lands (OWNERSHIP §7): no made-up values.
    last_tick_at: null,
    policy_version: "unavailable",
  });
  return toResponse(ok(modes));
}
