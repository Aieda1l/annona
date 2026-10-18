import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DEMO_ACTORS, type DispatchStore } from "@/contracts";
import { scene1_eligible_facts } from "@/contracts/fixtures/scenes";
import { evaluateEligibility, findCandidates } from "@/core";
import { DEMO_POLICY, type CourierProfile, type DonorProfile, type MatchIdentity, type RecipientOrg } from "@/core/types";
import { createDispatchStore } from "@/db";
import { closeStore, storeInternals } from "@/db/internal";
import { runMigrations } from "@/db/run-migrations";
import { seedStore } from "@/db/seed/seed";
import { couriers, donors, messaging_identities, policy_config, recipients } from "@/db/schema";

// Each test file starts one or more WASM Postgres instances. Under the parallel full run that can exceed the 5 s default.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

// The seeded rows must fit the PR 1a pure functions: read them back from the database, map them to the lane types,
// and run the real gate and matcher. This is the guard against the two halves of the lane drifting apart.

const NOW = new Date("2026-10-17T23:10:00.000Z");
const actor = (key: string) => DEMO_ACTORS.find((a) => a.key === key)!.actor_id;
const iso = (d: Date) => d.toISOString();

let store: DispatchStore;
beforeAll(async () => {
  store = createDispatchStore({ kind: "pglite", database_url: undefined, pglite_dir: undefined });
  await runMigrations(store);
  await seedStore(store, { now: NOW, messaging_provider: "fake" });
});
afterAll(async () => closeStore(store));

async function load() {
  const { db } = storeInternals(store);
  const donorList: DonorProfile[] = (await db.select().from(donors)).map((d) => ({ ...d, org_type: d.org_type as DonorProfile["org_type"], approval_status: d.approval_status as DonorProfile["approval_status"], is_synthetic: true }));
  const recipientList: RecipientOrg[] = (await db.select().from(recipients)).map((r) => ({
    ...r,
    approval_status: r.approval_status as RecipientOrg["approval_status"],
    accepts_handling_modes: r.accepts_handling_modes as RecipientOrg["accepts_handling_modes"],
    excluded_allergens: r.excluded_allergens as RecipientOrg["excluded_allergens"],
    receiving_closes_at: iso(r.receiving_closes_at),
    is_synthetic: true,
  }));
  const courierList: CourierProfile[] = (await db.select().from(couriers)).map((c) => ({
    ...c,
    approval_status: c.approval_status as CourierProfile["approval_status"],
    available_until: iso(c.available_until),
    is_synthetic: true,
  }));
  const policyRow = (await db.select().from(policy_config)).find((p) => p.active)!;
  const identities: MatchIdentity[] = (await db.select().from(messaging_identities)).map((i) => ({
    actor_role: i.actor_role as MatchIdentity["actor_role"],
    actor_id: i.actor_id,
    provider: i.provider as MatchIdentity["provider"],
    status: "joined", // both couriers have sent JOIN
  }));
  return { donorList, recipientList, courierList, policy: policyRow.config as typeof DEMO_POLICY, identities };
}

const facts = (over: Record<string, unknown> = {}) => ({
  ...scene1_eligible_facts,
  donor_pickup_by: iso(new Date(NOW.getTime() + 2 * 3_600_000)),
  discard_by: iso(new Date(NOW.getTime() + 6 * 3_600_000)),
  ...over,
});

describe("seeded rows run through the real gate and matcher", () => {
  it("the stored policy is the policy the gate uses, and the approved donor passes the gate", async () => {
    const { donorList, policy } = await load();
    expect(policy).toEqual(DEMO_POLICY);
    const rainier = donorList.find((d) => d.id === actor("donor_rainier"))!;
    const decision = evaluateEligibility({ facts: facts() as never, donor: rainier, policy, now: NOW });
    expect(decision.outcome).toBe("eligible");
    expect(decision.reasons).toEqual([]);
    expect(decision.policy_version).toBe("2026-10-17.1");
  });

  it("the pending donor needs review and the suspended donor is rejected", async () => {
    const { donorList, policy } = await load();
    const run = (key: string) => evaluateEligibility({ facts: facts() as never, donor: donorList.find((d) => d.id === actor(key))!, policy, now: NOW });
    expect(run("donor_pending")).toMatchObject({ outcome: "needs_review" });
    expect(run("donor_pending").reasons.map((r) => r.code)).toEqual(["DONOR_APPROVAL_PENDING"]);
    expect(run("donor_suspended")).toMatchObject({ outcome: "rejected" });
    expect(run("donor_suspended").reasons.map((r) => r.code)).toEqual(["DONOR_NOT_APPROVED"]);
  });

  it("scene 1: Eastlake with couriers A and B; never courier C, the unregistered DFDO or the senior kitchen", async () => {
    const { donorList, recipientList, courierList, policy, identities } = await load();
    const donor = donorList.find((d) => d.id === actor("donor_rainier"))!;
    const out = findCandidates({
      donation: { id: "d1", donor_location: donor.location },
      facts: facts() as never, recipients: recipientList, couriers: courierList, identities, policy, now: NOW,
      excluded_courier_ids: [], busy_courier_ids: [], committed_servings: {}, active_provider: "fake" as const,
    });
    expect(out.map((c) => [c.recipient_id, c.courier_id])).toEqual(
      expect.arrayContaining([[actor("recipient_eastlake"), actor("courier_a")], [actor("recipient_eastlake"), actor("courier_b")]]),
    );
    expect(out).toHaveLength(2);
    expect(out.map((c) => c.rank)).toEqual([1, 2]);
    for (const c of out) {
      expect(c.transit_minutes).toBeLessThanOrEqual(policy.max_transit_minutes);
      expect(c.slack_minutes).toBeGreaterThan(0);
    }
  });

  it("peanuts present: Youth Meals is excluded but Eastlake still matches", async () => {
    const { donorList, recipientList, courierList, policy, identities } = await load();
    const donor = donorList.find((d) => d.id === actor("donor_rainier"))!;
    const peanutFacts = facts({ allergens: { ...scene1_eligible_facts.allergens, peanuts: "present" } });
    const out = findCandidates({
      donation: { id: "d2", donor_location: donor.location }, facts: peanutFacts as never,
      recipients: recipientList, couriers: courierList, identities, policy, now: NOW, excluded_courier_ids: [], busy_courier_ids: [], committed_servings: {}, active_provider: "fake" as const,
    });
    expect(new Set(out.map((c) => c.recipient_id))).toEqual(new Set([actor("recipient_eastlake")]));
  });

  it("a courier who has not sent JOIN is never matched (identities are seeded awaiting_join)", async () => {
    const { donorList, recipientList, courierList, policy } = await load();
    const donor = donorList.find((d) => d.id === actor("donor_rainier"))!;
    const { db } = storeInternals(store);
    const seeded: MatchIdentity[] = (await db.select().from(messaging_identities)).map((i) => ({
      actor_role: i.actor_role as MatchIdentity["actor_role"], actor_id: i.actor_id, provider: i.provider as MatchIdentity["provider"], status: i.status as MatchIdentity["status"],
    }));
    expect(seeded.every((i) => i.status === "awaiting_join")).toBe(true);
    const out = findCandidates({
      donation: { id: "d3", donor_location: donor.location }, facts: facts() as never,
      recipients: recipientList, couriers: courierList, identities: seeded, policy, now: NOW, excluded_courier_ids: [], busy_courier_ids: [], committed_servings: {}, active_provider: "fake" as const,
    });
    expect(out).toEqual([]);
  });

  it("seeded profiles stay usable across the whole demo window, and expire only when they should", async () => {
    const { donorList, recipientList, courierList, policy, identities } = await load();
    const donor = donorList.find((d) => d.id === actor("donor_rainier"))!;
    const at = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000);
    const run = (now: Date) =>
      findCandidates({
        donation: { id: "d4", donor_location: donor.location },
        facts: facts({ donor_pickup_by: iso(new Date(now.getTime() + 2 * 3_600_000)), discard_by: iso(new Date(now.getTime() + 9 * 3_600_000)) }) as never,
        recipients: recipientList, couriers: courierList, identities, policy, now, excluded_courier_ids: [], busy_courier_ids: [], committed_servings: {}, active_provider: "fake" as const,
      });
    expect(run(at(0))).toHaveLength(2);
    expect(run(at(3))).toHaveLength(2);
    expect(run(at(7.5))).toHaveLength(2); // still time to finish before the 8 h close
    expect(run(at(7.8))).toEqual([]); // the drop-off would land after the recipient closes and the couriers go off shift
  });
});
