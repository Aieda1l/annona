"use client";

import type { DashboardSnapshot, OperatorAction } from "@/contracts";
import type { Outcome } from "./api";
import { DemoControls } from "./DemoControls";
import { DispatchNowButton } from "./DispatchNowButton";
import { DonationBoard } from "./DonationBoard";
import { IdentityList } from "./IdentityList";
import { OperatorActions } from "./OperatorActions";
import { formatPacific } from "./format";

export type DemoHandlers = {
  onReset: () => Promise<Outcome>;
  onTick: () => Promise<Outcome>;
  onDispatch: (donationId: string) => Promise<Outcome>;
};

/** Renders one DashboardSnapshot exactly as given. No status, eligibility or deadline is computed here. */
export function OperatorDashboard({
  snapshot,
  sourceLabel,
  onAction,
  actionErrors,
  demo,
}: {
  snapshot: DashboardSnapshot;
  sourceLabel: string;
  onAction?: (donationId: string, action: OperatorAction, note: string) => void | Promise<void>;
  actionErrors?: Record<string, string>;
  demo?: DemoHandlers;
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
        {!onAction && (
          <p className="text-sm font-medium text-slate-900">Read-only: operator actions are not wired to the server yet.</p>
        )}
      </header>
      {demo && <DemoControls onTick={demo.onTick} onReset={demo.onReset} />}
      <DonationBoard
        donations={snapshot.donations}
        counts_by_status={snapshot.counts_by_status}
        renderActions={
          onAction || demo
            ? (card) => (
                <>
                  {onAction && (
                    <OperatorActions
                      card={card}
                      onAction={(a, n) => onAction(card.id, a, n)}
                      error={actionErrors?.[card.id] || null}
                    />
                  )}
                  {demo && card.status === "eligible" && (
                    <DispatchNowButton onDispatch={() => demo.onDispatch(card.id)} />
                  )}
                </>
              )
            : undefined
        }
      />
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">Messaging identities</h2>
        <IdentityList identities={snapshot.identities} />
      </section>
    </div>
  );
}
