import { asc, desc, eq, sql } from "drizzle-orm";
import { DONATION_STATUSES, err, ok, type Actor, type DashboardSnapshot, type Deps, type DonationStatus, type IdentitySummary, type Result } from "@/contracts";
import { couriers, donations, donors, messaging_identities } from "@/db/schema";
import { buildCards } from "./cards";
import { isoOrNull, maskHandle } from "./map";
import { runtime } from "./runtime";
import { systemModes } from "./status";

// Slice 2(c): the operator dashboard (CONTRACTS section 3.13, GET /api/dashboard, polled every 2 s by Dev 4).
// Operator only; handles appear only masked (last 4 characters).

/** The most recently changed donations shown as cards. counts_by_status always counts every donation. */
export const DASHBOARD_CARD_LIMIT = 100;

export async function getDashboardSnapshot(actor: Actor, deps?: Deps): Promise<Result<DashboardSnapshot>> {
  if (actor?.role !== "operator") return err("NOT_AUTHORIZED", "Only an operator can view the dashboard.");
  const { db, clock } = await runtime(deps);
  const generated_at = clock.now().toISOString();
  const modes = await systemModes(deps);

  // One read-only REPEATABLE READ transaction (one snapshot), so the counts, cards and identities describe the same moment.
  return db.transaction(async (tx) => {
    const counts = Object.fromEntries(DONATION_STATUSES.map((s) => [s, 0])) as Record<DonationStatus, number>;
    const grouped = await tx.select({ status: donations.status, n: sql<number>`count(*)::int` }).from(donations).groupBy(donations.status);
    for (const g of grouped) if (g.status in counts) counts[g.status as DonationStatus] = Number(g.n);

    const rows = await tx.select().from(donations).orderBy(desc(donations.updated_at), desc(donations.id)).limit(DASHBOARD_CARD_LIMIT);
    const cards = await buildCards(tx, rows, "operator");

    const identityRows = await tx
      .select({
        identity: messaging_identities,
        donor_name: donors.display_name,
        courier_name: couriers.display_name,
      })
      .from(messaging_identities)
      .leftJoin(donors, eq(messaging_identities.actor_id, donors.id))
      .leftJoin(couriers, eq(messaging_identities.actor_id, couriers.id))
      .orderBy(asc(messaging_identities.actor_role), asc(messaging_identities.id));
    const identities: IdentitySummary[] = identityRows.map(({ identity: i, donor_name, courier_name }) => ({
      identity_id: i.id,
      actor_role: i.actor_role as IdentitySummary["actor_role"],
      actor_id: i.actor_id,
      actor_display_name: (i.actor_role === "donor" ? donor_name : courier_name) ?? "",
      provider: i.provider as IdentitySummary["provider"],
      status: i.status as IdentitySummary["status"],
      joined_at: isoOrNull(i.joined_at),
      handle_masked: maskHandle(i.handle),
    }));

    return ok({ generated_at, modes, counts_by_status: counts, donations: cards, identities });
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
