import { eq, sql } from "drizzle-orm";
import { SystemModes, type Deps, type MessagingGateway, type StoreKind, type VisionProvider } from "@/contracts";
import { policy_config, system_status } from "@/db/schema";
import { getEnv } from "@/server/env";
import { parseUtc } from "../time";
import { runtime } from "./runtime";

// Slice 2(c): last tick and system status (CONTRACTS section 3.13, 9.3). Nothing here is made up: a missing tick is
// null and a missing or unreadable policy is "unavailable".

const LAST_TICK_KEY = "last_tick";

/**
 * Records when Dev 3's tick last finished. Monotonic: a delayed tick that finishes after a newer one never moves the
 * time backwards. `at` is the tick's own Clock time, so it must be a UTC timestamp; anything else is a caller bug.
 */
export async function setLastTick(at: string, deps?: Deps): Promise<void> {
  if (typeof at !== "string" || !Number.isFinite(parseUtc(at))) throw new Error("setLastTick: `at` must be a UTC timestamp");
  const { db, clock } = await runtime(deps);
  const value = { at: new Date(parseUtc(at)).toISOString() };
  await db
    .insert(system_status)
    .values({ key: LAST_TICK_KEY, value, updated_at: clock.now() })
    .onConflictDoUpdate({
      target: system_status.key,
      set: { value, updated_at: clock.now() },
      setWhere: sql`(${system_status.value}->>'at')::timestamptz < ${value.at}::timestamptz`,
    });
}

export async function getSystemStatus(deps?: Deps): Promise<{ last_tick_at: string | null; store: StoreKind; policy_version: string }> {
  const { db, store } = await runtime(deps);
  const [tick] = await db.select().from(system_status).where(eq(system_status.key, LAST_TICK_KEY));
  const [policy] = await db.select({ version: policy_config.policy_version }).from(policy_config).where(eq(policy_config.active, true));
  const raw = (tick?.value as { at?: unknown } | undefined)?.at;
  const last_tick_at = typeof raw === "string" && Number.isFinite(parseUtc(raw)) ? raw : null;
  return { last_tick_at, store: store.kind, policy_version: policy?.version ?? "unavailable" };
}

/** The providers the modes come from: the injected ones (tests), else the composition root. */
async function providers(deps?: Deps): Promise<{ vision: VisionProvider; messaging: MessagingGateway }> {
  if (deps?.vision && deps?.messaging) return { vision: deps.vision, messaging: deps.messaging };
  const { getServices } = await import("@/server/container");
  const services = getServices();
  return { vision: deps?.vision ?? services.vision, messaging: deps?.messaging ?? services.messaging };
}

/** SystemModes as GET /api/health reports them, read from the providers themselves (never a claimed mode). */
export async function systemModes(deps?: Deps): Promise<SystemModes> {
  const [{ vision, messaging }, status] = await Promise.all([providers(deps), getSystemStatus(deps)]);
  return SystemModes.parse({
    vision: { mode: vision.mode, provider: vision.mode === "real" ? "gemini" : "fake", model: vision.model, status: vision.status },
    messaging: { mode: messaging.mode, provider: messaging.mode === "real" ? "photon" : "fake", channel: messaging.channel, status: messaging.status },
    store: status.store,
    demo_accelerated: getEnv().demo_mode,
    last_tick_at: status.last_tick_at,
    policy_version: status.policy_version,
  });
}
