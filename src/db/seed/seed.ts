import { sql } from "drizzle-orm";
import { DEMO_ACTORS, type DispatchStore } from "@/contracts";
import { DEMO_POLICY } from "@/core/types";
import { storeInternals } from "../internal";
import { couriers, donors, messaging_identities, policy_config, recipients } from "../schema";

// ARCHITECTURE §7 seed: deterministic, synthetic, times relative to `now`. Every persona ID comes from DEMO_ACTORS.
// Real handles arrive only through `handles` (read from env by the CLI) and never enter git.

export type SeedHandles = {
  donor?: string;
  courier_a?: string;
  courier_b?: string;
};

export type SeedOptions = {
  now: Date;
  /** Which messaging provider the demo runs on. `photon` needs every handle (it never falls back to a fake handle). */
  messaging_provider: "fake" | "photon";
  handles?: SeedHandles;
};

/** Fixed identity IDs so the seed is deterministic. Personas themselves use DEMO_ACTORS IDs. */
export const SEED_IDENTITY_IDS = {
  donor: "00000000-0000-4000-8000-0000000000a1",
  courier_a: "00000000-0000-4000-8000-0000000000a2",
  courier_b: "00000000-0000-4000-8000-0000000000a3",
} as const;

const actorId = (key: string): string => {
  const a = DEMO_ACTORS.find((x) => x.key === key);
  if (!a) throw new Error(`DEMO_ACTORS has no persona '${key}'`);
  return a.actor_id;
};

const loc = (lat: number, lng: number, area_label: string, address_line: string) => ({ lat, lng, area_label, address_line });
const hoursFrom = (now: Date, h: number) => new Date(now.getTime() + h * 3_600_000);

// Synthetic fallbacks use the reserved .invalid TLD (usable only with fake messaging).
const SYNTHETIC_HANDLES = {
  donor: "donor@example.invalid",
  courier_a: "courier-a@example.invalid",
  courier_b: "courier-b@example.invalid",
} as const;

export function resolveHandles(opts: Pick<SeedOptions, "messaging_provider" | "handles">) {
  const given = opts.handles ?? {};
  if (opts.messaging_provider === "photon") {
    const missing = (["donor", "courier_a", "courier_b"] as const).filter((k) => !given[k]);
    if (missing.length > 0) {
      throw new Error(
        `Seed: messaging is 'photon' but handles are missing for ${missing.join(", ")}. Set DEMO_DONOR_HANDLE, DEMO_COURIER_A_HANDLE and DEMO_COURIER_B_HANDLE.`,
      );
    }
    return { provider: "photon" as const, donor: given.donor!, courier_a: given.courier_a!, courier_b: given.courier_b! };
  }
  return {
    provider: "fake" as const,
    donor: given.donor ?? SYNTHETIC_HANDLES.donor,
    courier_a: given.courier_a ?? SYNTHETIC_HANDLES.courier_a,
    courier_b: given.courier_b ?? SYNTHETIC_HANDLES.courier_b,
  };
}

/** Builds the rows. Pure and deterministic for a given `now` and handles. */
export function buildSeed(opts: SeedOptions) {
  const { now } = opts;
  const h = resolveHandles(opts);
  const closes = hoursFrom(now, 8);
  const eastlake = actorId("recipient_eastlake");

  const donorRows = [
    { id: actorId("donor_rainier"), display_name: "Rainier Catering (synthetic)", org_type: "caterer", licensed_food_establishment: true, approval_status: "approved", location: loc(47.6205, -122.3493, "Seattle Center area", "100 Demo Way (synthetic)"), is_synthetic: true },
    { id: actorId("donor_pending"), display_name: "Capitol Hill Bakery (synthetic, approval pending)", org_type: "restaurant", licensed_food_establishment: true, approval_status: "pending", location: loc(47.6253, -122.3222, "Capitol Hill area", "200 Demo Ave (synthetic)"), is_synthetic: true },
    { id: actorId("donor_suspended"), display_name: "Harbor Deli (synthetic, suspended)", org_type: "restaurant", licensed_food_establishment: true, approval_status: "suspended", location: loc(47.6062, -122.3376, "Downtown area", "300 Demo St (synthetic)"), is_synthetic: true },
  ];

  // Capacity is large enough for every demo scene in sequence: M-04 counts delivered donations until resetDemo.
  const shared = { accepts_handling_modes: ["refrigerated"], capacity_servings_available: 200, receiving_closes_at: closes, is_synthetic: true };
  const recipientRows = [
    { id: eastlake, display_name: "Eastlake Community Pantry (synthetic)", approval_status: "approved", registered_dfdo: true, serves_highly_susceptible_population: false, excluded_allergens: [] as string[], location: loc(47.635, -122.325, "Eastlake area", "400 Demo Blvd (synthetic)"), ...shared },
    { id: actorId("recipient_youth"), display_name: "Youth Meals Program (synthetic)", approval_status: "approved", registered_dfdo: true, serves_highly_susceptible_population: false, excluded_allergens: ["peanuts", "tree_nuts"], location: loc(47.6097, -122.3331, "First Hill area", "500 Demo Ct (synthetic)"), ...shared },
    { id: actorId("recipient_unregistered"), display_name: "Northgate Meal Share (synthetic, not registered)", approval_status: "approved", registered_dfdo: false, serves_highly_susceptible_population: false, excluded_allergens: [] as string[], location: loc(47.7064, -122.328, "Northgate area", "600 Demo Rd (synthetic)"), ...shared },
    { id: actorId("recipient_hsp"), display_name: "Lakeview Senior Kitchen (synthetic, serves highly susceptible population)", approval_status: "approved", registered_dfdo: true, serves_highly_susceptible_population: true, excluded_allergens: [] as string[], location: loc(47.64, -122.3, "Lakeview area", "700 Demo Ln (synthetic)"), ...shared },
  ];

  const availableUntil = hoursFrom(now, 8);
  const courier = (key: string, name: string, cold: boolean, where: ReturnType<typeof loc>) => ({
    id: actorId(key),
    display_name: name,
    approval_status: "approved",
    affiliated_recipient_ids: [eastlake],
    capabilities: { cold_transport: cold },
    available_until: availableUntil,
    location: where,
    is_synthetic: true,
  });
  const courierRows = [
    courier("courier_a", "Courier A (synthetic, cold transport)", true, loc(47.622, -122.34, "South Lake Union area", "n/a (synthetic)")),
    courier("courier_b", "Courier B (synthetic, cold transport)", true, loc(47.63, -122.335, "Eastlake area", "n/a (synthetic)")),
    courier("courier_c", "Courier C (synthetic, no cold transport)", false, loc(47.615, -122.33, "Denny Triangle area", "n/a (synthetic)")),
  ];

  const identity = (id: string, actor_role: "donor" | "courier", actor_id: string, handle: string) => ({
    id,
    actor_role,
    actor_id,
    provider: h.provider,
    handle,
    status: "awaiting_join",
    provider_space_id: null,
    provider_sender_id: null,
    joined_at: null,
    opted_out_at: null,
  });
  const identityRows = [
    identity(SEED_IDENTITY_IDS.donor, "donor", actorId("donor_rainier"), h.donor),
    identity(SEED_IDENTITY_IDS.courier_a, "courier", actorId("courier_a"), h.courier_a),
    identity(SEED_IDENTITY_IDS.courier_b, "courier", actorId("courier_b"), h.courier_b),
  ];

  const policyRow = { policy_id: DEMO_POLICY.policy_id, policy_version: DEMO_POLICY.policy_version, config: DEMO_POLICY, active: true };

  return { donorRows, recipientRows, courierRows, identityRows, policyRow };
}

const fromExcluded = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, sql.raw(`excluded."${k}"`)]));

/**
 * Writes the seed into a migrated store. Safe to run again: profiles and policy are refreshed (times move with `now`),
 * while a joined phone stays joined (resetDemo keeps identities). Identities awaiting JOIN pick up a changed provider or handle.
 */
export async function seedStore(store: DispatchStore, opts: SeedOptions): Promise<void> {
  const { db } = storeInternals(store);
  const { donorRows, recipientRows, courierRows, identityRows, policyRow } = buildSeed(opts);
  await db.transaction(async (tx) => {
    await tx
      .insert(donors)
      .values(donorRows)
      .onConflictDoUpdate({ target: donors.id, set: fromExcluded(["display_name", "org_type", "licensed_food_establishment", "approval_status", "location"]) });
    await tx
      .insert(recipients)
      .values(recipientRows)
      .onConflictDoUpdate({
        target: recipients.id,
        set: fromExcluded(["display_name", "approval_status", "registered_dfdo", "serves_highly_susceptible_population", "accepts_handling_modes", "excluded_allergens", "capacity_servings_available", "receiving_closes_at", "location"]),
      });
    await tx
      .insert(couriers)
      .values(courierRows)
      .onConflictDoUpdate({ target: couriers.id, set: fromExcluded(["display_name", "approval_status", "affiliated_recipient_ids", "capabilities", "available_until", "location"]) });
    // Identities still awaiting JOIN follow the current provider and handles; a joined or opted-out phone is never touched.
    await tx
      .insert(messaging_identities)
      .values(identityRows)
      .onConflictDoUpdate({
        target: messaging_identities.id,
        set: fromExcluded(["provider", "handle"]),
        setWhere: sql`${messaging_identities.status} = 'awaiting_join'`,
      });
    await tx.update(policy_config).set({ active: false });
    await tx
      .insert(policy_config)
      .values(policyRow)
      .onConflictDoUpdate({ target: [policy_config.policy_id, policy_config.policy_version], set: { config: policyRow.config, active: true } });
  });
}
