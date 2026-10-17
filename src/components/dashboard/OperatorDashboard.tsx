"use client";

import type { DashboardSnapshot, OperatorAction } from "@/contracts";
import { DonationBoard } from "./DonationBoard";
import { IdentityList } from "./IdentityList";
import { OperatorActions } from "./OperatorActions";
import { formatPacific } from "./format";

/** Renders one DashboardSnapshot exactly as given. No status, eligibility or deadline is computed here. */
export function OperatorDashboard({
  snapshot,
  sourceLabel,
  onAction,
  actionErrors,
}: {
  snapshot: DashboardSnapshot;
  sourceLabel: string;
  onAction?: (donationId: string, action: OperatorAction, note: string) => void | Promise<void>;
  actionErrors?: Record<string, string>;
}) {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900">Operator dashboard</h1>
        <p className="text-sm text-slate-700">
          {sourceLabel} · snapshot {formatPacific(snapshot.generated_at)} · policy {snapshot.modes.policy_version}.
          &quot;Eligible&quot; means eligible for dispatch under the prototype operator policy, based on
          donor-attested records.
        </p>
      </header>
      <DonationBoard
        donations={snapshot.donations}
        counts_by_status={snapshot.counts_by_status}
        renderActions={(card) => (
          <OperatorActions
            card={card}
            onAction={(a, n) => onAction?.(card.id, a, n)}
            error={actionErrors?.[card.id] || null}
          />
        )}
      />
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">Messaging identities</h2>
        <IdentityList identities={snapshot.identities} />
      </section>
    </div>
  );
}
