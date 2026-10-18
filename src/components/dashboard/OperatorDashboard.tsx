"use client";

import { useState } from "react";
import type { DashboardSnapshot, DonationStatus, OperatorAction } from "@/contracts";
import type { Outcome } from "./api";
import { DemoControls } from "./DemoControls";
import { DispatchNowButton, DispatchResult, type DispatchState } from "./DispatchNowButton";
import { DonationBoard } from "./DonationBoard";
import { IdentityList } from "./IdentityList";
import { OperatorActions } from "./OperatorActions";
import { formatPacific } from "./format";
import { statusLabel } from "./StatusBadge";

export type DemoHandlers = {
  onReset: () => Promise<Outcome>;
  onTick: () => Promise<Outcome>;
  onDispatch: (donationId: string) => Promise<Outcome>;
};

const TILE_ORDER: readonly DonationStatus[] = ["needs_review", "eligible", "offered", "claimed", "delivered", "rejected", "expired"];

/** Server-provided counts only; nothing is derived here. Zero-count statuses are omitted. */
function CountTiles({ counts }: { counts: DashboardSnapshot["counts_by_status"] }) {
  const tiles = TILE_ORDER.filter((s) => (counts[s] ?? 0) > 0);
  if (tiles.length === 0) return null;
  return (
    <ul aria-label="Donations by status" className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      {tiles.map((s) => (
        <li key={s} className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
          <p className="tabular font-sans text-3xl font-bold text-foreground">{counts[s]}</p>
          <p className="text-xs font-medium text-muted-foreground">{statusLabel(s)}</p>
        </li>
      ))}
    </ul>
  );
}

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
  const [dispatch, setDispatch] = useState<Record<string, DispatchState>>({});
  const [inflight, setInflight] = useState(0);
  const locked = inflight > 0;

  async function track(fn: () => Promise<Outcome>): Promise<Outcome> {
    setInflight((n) => n + 1);
    try {
      return await fn();
    } finally {
      setInflight((n) => n - 1);
    }
  }
  async function dispatchNow(id: string) {
    if (!demo) return;
    setDispatch((d) => ({ ...d, [id]: { busy: true, result: null } }));
    let result: Outcome;
    try {
      result = await track(() => demo.onDispatch(id));
    } catch {
      result = { ok: false, error: "UNREACHABLE: The server could not be reached." };
    }
    setDispatch((d) => ({ ...d, [id]: { busy: false, result } }));
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4">
      <header className="annona-hero space-y-1 rounded-2xl px-6 py-5 shadow-sm">
        <p className="annona-eyebrow text-xs font-semibold tracking-widest uppercase">Annona · Operator</p>
        <h1 className="text-3xl font-bold">Operator dashboard</h1>
        <p className="text-sm text-[#a9bfb5]">
          {sourceLabel} · snapshot {formatPacific(snapshot.generated_at)} · policy {snapshot.modes.policy_version}.
          &quot;Eligible&quot; means eligible for dispatch under the prototype operator policy, based on
          donor-attested records.
        </p>
        {snapshot.modes.messaging.mode === "fake" && (
          <p className="text-sm">
            <a href="/operator/phone" className="font-medium text-primary underline">
              Open the simulated phone
            </a>{" "}
            (fake messaging only)
          </p>
        )}
        {!onAction && (
          <p className="text-sm font-medium text-[#eaf2ee]">Read-only: operator actions are not wired to the server yet.</p>
        )}
      </header>
      <CountTiles counts={snapshot.counts_by_status} />
      {demo && (
        <DemoControls
          locked={locked}
          onTick={() => track(demo.onTick)}
          onReset={async () => {
            const out = await track(demo.onReset);
            setDispatch({});
            return out;
          }}
        />
      )}
      <DonationBoard
        donations={snapshot.donations}
        counts_by_status={snapshot.counts_by_status}
        detailHref={(c) => `/operator/donations/${c.id}`}
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
                    <DispatchNowButton
                      disabled={locked || dispatch[card.id]?.busy === true}
                      onDispatch={() => void dispatchNow(card.id)}
                    />
                  )}
                  {demo && dispatch[card.id]?.result && <DispatchResult result={dispatch[card.id]!.result!} />}
                </>
              )
            : undefined
        }
      />
      <section className="space-y-2">
        <h2 className="text-xl font-bold">Messaging identities</h2>
        <IdentityList identities={snapshot.identities} />
      </section>
    </div>
  );
}
