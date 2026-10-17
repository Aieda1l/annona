import { inArray, sql } from "drizzle-orm";
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

/** A seeded identity that is no longer awaiting JOIN and whose stored provider/handle differ from what this seed wanted. */
export type StaleIdentity = {
  id: string;
  actor_role: string;
  status: string;
  provider_differs: boolean;
  handle_differs: boolean;
};

/** What `seedStore` left alone. Never carries a handle value (they are personal data). */
export type SeedReport = { stale_identities: StaleIdentity[] };

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

const clean = (v: string | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};

// photon inbound senders arrive as E.164 phones or lowercased emails (the messaging normalizer), so a seeded handle in any
// other shape would never match and its owner would be silently ignored as an unknown sender.
const E164 = /^\+[1-9][0-9]{7,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HANDLE_VARS = { donor: "DEMO_DONOR_HANDLE", courier_a: "DEMO_COURIER_A_HANDLE", courier_b: "DEMO_COURIER_B_HANDLE" } as const;

/** Returns the handle in the form Photon will present it, or throws naming the variable (never the value). */
function photonHandle(persona: keyof typeof HANDLE_VARS, value: string): string {
  if (E164.test(value)) return value;
  if (EMAIL.test(value)) return value.toLowerCase();
  throw new Error(
    `Seed: ${HANDLE_VARS[persona]} must be an E.164 phone number (+, country code, then digits only) or an email address when messaging is 'photon'. Any other form would never match an inbound sender.`,
  );
}

export function resolveHandles(opts: Pick<SeedOptions, "messaging_provider" | "handles">) {
  if (opts.messaging_provider !== "fake" && opts.messaging_provider !== "photon") {
    throw new Error(`Seed: unknown messaging_provider '${String(opts.messaging_provider)}' (expected 'fake' or 'photon').`);
  }
  // Blank or whitespace-only values count as unset; real values are trimmed.
  const given = { donor: clean(opts.handles?.donor), courier_a: clean(opts.handles?.courier_a), courier_b: clean(opts.handles?.courier_b) };
  let out: { provider: "fake" | "photon"; donor: string; courier_a: string; courier_b: string };
  if (opts.messaging_provider === "photon") {
    const missing = (["donor", "courier_a", "courier_b"] as const).filter((k) => !given[k]);
    if (missing.length > 0) {
      throw new Error(
        `Seed: messaging is 'photon' but handles are missing for ${missing.join(", ")}. Set DEMO_DONOR_HANDLE, DEMO_COURIER_A_HANDLE and DEMO_COURIER_B_HANDLE.`,
      );
    }
    out = {
      provider: "photon",
      donor: photonHandle("donor", given.donor!),
      courier_a: photonHandle("courier_a", given.courier_a!),
      courier_b: photonHandle("courier_b", given.courier_b!),
    };
  } else {
    out = {
      provider: "fake",
      donor: given.donor ?? SYNTHETIC_HANDLES.donor,
      courier_a: given.courier_a ?? SYNTHETIC_HANDLES.courier_a,
      courier_b: given.courier_b ?? SYNTHETIC_HANDLES.courier_b,
    };
  }
  // UNIQUE (provider, handle): one phone cannot play two personas.
  const lowered = [out.donor, out.courier_a, out.courier_b].map((x) => x.toLowerCase());
  if (new Set(lowered).size !== lowered.length) {
    throw new Error("Seed: the donor, courier A and courier B handles must differ from each other.");
  }
  return out;
}

/** Builds the rows. Pure and deterministic for a given `now` and handles. */
export function buildSeed(opts: SeedOptions) {
  const { now } = opts;
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("Seed: `now` must be a valid Date.");
  const h = resolveHandles(opts);
  const closes = hoursFrom(now, 8);
  const eastlake = actorId("recipient_eastlake");

  const donorRows = [
    { id: actorId("donor_rainier"), display_name: "Rainier Catering (synthetic)", org_type: "caterer", licensed_food_establishment: true, approval_status: "approved", location: loc(47.6205, -122.3493, "Seattle Center area", "100 Demo Way (synthetic)"), is_synthetic: true },
    { id: actorId("donor_pending"), display_name: "Capitol Hill Bakery (synthetic, approval pending)", org_type: "restaurant", licensed_food_establishment: true, approval_status: "pending", location: loc(47.6253, -122.3222, "Capitol Hill area", "200 Demo Ave (synthetic)"), is_synthetic: true },
    { id: actorId("donor_suspended"), display_name: "Harbor Deli (synthetic, suspended)", org_type: "restaurant", licensed_food_establishment: true, approval_status: "suspended", location: loc(47.6062, -122.3376, "Downtown area", "300 Demo St (synthetic)"), is_synthetic: true },
  ];

  // Capacity is large enough for every demo scene in sequence. M-04 (net of committed servings) is not enforced yet
  // (claim step 8 will), so nothing decrements this until then.
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
 * An identity that is no longer awaiting JOIN keeps its stored provider and handle even if this seed wanted different
 * ones; the report names it (no handle values) so the caller can tell the operator instead of failing silently.
 */
export async function seedStore(store: DispatchStore, opts: SeedOptions): Promise<SeedReport> {
  const { db } = storeInternals(store);
  const { donorRows, recipientRows, courierRows, identityRows, policyRow } = buildSeed(opts);
  return db.transaction(async (tx) => {
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

    const stored = await tx
      .select({ id: messaging_identities.id, status: messaging_identities.status, provider: messaging_identities.provider, handle: messaging_identities.handle })
      .from(messaging_identities)
      .where(inArray(messaging_identities.id, identityRows.map((r) => r.id)));
    const stale_identities: StaleIdentity[] = [];
    for (const want of identityRows) {
      const have = stored.find((r) => r.id === want.id);
      if (!have || have.status === "awaiting_join") continue;
      const provider_differs = have.provider !== want.provider;
      const handle_differs = have.handle !== want.handle;
      if (provider_differs || handle_differs) stale_identities.push({ id: want.id, actor_role: want.actor_role, status: have.status, provider_differs, handle_differs });
    }
    return { stale_identities };
  });
}
