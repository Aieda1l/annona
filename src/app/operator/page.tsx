import { DEMO_ACTORS, DONATION_CARD_FIXTURES, DONATION_STATUSES, type DashboardSnapshot, type DonationStatus } from "@/contracts";
import { OperatorDashboard } from "@/components/dashboard/OperatorDashboard";

// Slice 1: typed fixtures only, no network. Replaced by GET /api/dashboard polling once Dev 2's 2(c) lands.
function fixtureSnapshot(): DashboardSnapshot {
  const counts = Object.fromEntries(DONATION_STATUSES.map((s) => [s, 0])) as Record<DonationStatus, number>;
  for (const c of DONATION_CARD_FIXTURES) counts[c.status] += 1;
  const couriers = DEMO_ACTORS.filter((a) => a.role === "courier").slice(0, 2);
  return {
    generated_at: "2026-10-17T23:15:00.000Z",
    modes: {
      vision: { mode: "fake", provider: "fake", model: null, status: "ok" },
      messaging: { mode: "fake", provider: "fake", channel: "simulated", status: "ok" },
      store: "pglite",
      demo_accelerated: true,
      last_tick_at: "2026-10-17T23:14:58.000Z",
      policy_version: "2026-10-17.1",
    },
    counts_by_status: counts,
    donations: [...DONATION_CARD_FIXTURES],
    identities: couriers.map((a, i) => ({
      identity_id: `00000000-0000-4000-8000-0000000000f${i + 1}`,
      actor_role: a.role,
      actor_id: a.actor_id,
      actor_display_name: a.display_name,
      provider: "fake" as const,
      status: i === 0 ? ("joined" as const) : ("awaiting_join" as const),
      joined_at: i === 0 ? "2026-10-17T22:00:00.000Z" : null,
      handle_masked: `••••000${i + 1}`,
    })),
  };
}

export default function OperatorPage() {
  return <OperatorDashboard snapshot={fixtureSnapshot()} sourceLabel="FIXTURE DATA — not live server state" />;
}
