import { LiveOperatorDashboard } from "@/components/dashboard/LiveOperatorDashboard";
import { OperatorDashboard } from "@/components/dashboard/OperatorDashboard";
import { fixtureSnapshot } from "@/components/dashboard/fixture-snapshot";

// `/operator` shows live server state. `/operator?fixture=1` renders typed fixtures for design review and
// screenshots, loudly labeled; it is never a substitute for live data when the server fails.
export default async function OperatorPage({ searchParams }: { searchParams: Promise<{ fixture?: string }> }) {
  const { fixture } = await searchParams;
  if (fixture === "1") {
    return <OperatorDashboard snapshot={fixtureSnapshot()} sourceLabel="FIXTURE DATA — not live server state" />;
  }
  return <LiveOperatorDashboard />;
}
