"use client";

import { useState, type ReactNode } from "react";
import { Hand, Hourglass, Inbox, MessageSquareText, Search, Send, ShieldQuestion, UserX } from "lucide-react";
import type { DashboardSnapshot, DonationCard, DonationStatus, OperatorAction } from "@/contracts";
import { cn } from "cn";
import { PageContainer, PageHeader, SectionHeading } from "@/components/layout/PageHeader";
import { MetricTile } from "@/components/ui/metric-tile";
import { Notice } from "@/components/ui/notice";
import type { Outcome } from "./api";
import { DemoControls } from "./DemoControls";
import { DispatchNowButton, DispatchResult, type DispatchState } from "./DispatchNowButton";
import { DonationBoard } from "./DonationBoard";
import { IdentityList } from "./IdentityList";
import { OperatorActions } from "./OperatorActions";
import { formatPacific } from "./format";

export type DemoHandlers = {
  onReset: () => Promise<Outcome>;
  onTick: () => Promise<Outcome>;
  onDispatch: (donationId: string) => Promise<Outcome>;
};

// View filters only narrow what is shown; they never change a status, count or decision.
type View = "all" | "attention" | "active" | "closed";
const VIEWS: { key: View; label: string; statuses: readonly DonationStatus[] | null }[] = [
  { key: "all", label: "All", statuses: null },
  { key: "attention", label: "Needs attention", statuses: ["needs_review", "unmatched"] },
  { key: "active", label: "In flight", statuses: ["draft", "eligible", "offered", "claimed", "collected"] },
  { key: "closed", label: "Closed", statuses: ["delivered", "rejected", "canceled", "expired"] },
];

function matches(card: DonationCard, view: View, q: string): boolean {
  const statuses = VIEWS.find((v) => v.key === view)?.statuses;
  if (statuses && !statuses.includes(card.status)) return false;
  if (!q) return true;
  const hay = `${card.verified_facts?.dish_name ?? "untitled draft"} ${card.donor_display_name} ${card.donor_area_label}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

/** Renders one DashboardSnapshot exactly as given. No status, eligibility or deadline is computed here. */
export function OperatorDashboard({
  snapshot,
  sourceLabel,
  onAction,
  actionErrors,
  demo,
  notice,
}: {
  snapshot: DashboardSnapshot;
  sourceLabel: string;
  onAction?: (donationId: string, action: OperatorAction, note: string) => void | Promise<void>;
  actionErrors?: Record<string, string>;
  demo?: DemoHandlers;
  /** A stale/failure notice from the live wrapper, shown under the page header. */
  notice?: ReactNode;
}) {
  const [dispatch, setDispatch] = useState<Record<string, DispatchState>>({});
  const [inflight, setInflight] = useState(0);
  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");
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

  // Server counts first; the board's own fallback (cards present) only when the server sent no count.
  const count = (s: DonationStatus) => snapshot.counts_by_status[s] ?? snapshot.donations.filter((d) => d.status === s).length;
  const visible = snapshot.donations.filter((d) => matches(d, view, query.trim()));
  const live = /^live/i.test(sourceLabel);
  const stale = /stale/i.test(sourceLabel);

  return (
    <PageContainer size="wide" className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Operator dashboard"
        description={
          <>
            &quot;Eligible&quot; means eligible for dispatch under the prototype operator policy, based on donor-attested
            records. It is not a food-safety inspection.
          </>
        }
        meta={
          <>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                live && "border-progress-border bg-progress-subtle text-progress",
                stale && "border-review-border bg-review-subtle text-review",
                !live && !stale && "border-offer-border bg-offer-subtle text-offer",
              )}
            >
              <span aria-hidden className={cn("size-1.5 rounded-full bg-current", live && "animate-pulse")} />
              {sourceLabel}
            </span>
            <span>
              · snapshot <time dateTime={snapshot.generated_at}>{formatPacific(snapshot.generated_at)}</time> · policy{" "}
              <span className="font-mono text-xs">{snapshot.modes.policy_version}</span>.
            </span>
          </>
        }
      />

      {notice}

      {!onAction && (
        <Notice tone="synthetic">
          <p className="font-medium">Read-only: operator actions are not wired to the server yet.</p>
        </Notice>
      )}

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <MetricTile label="Needs review" value={count("needs_review")} icon={ShieldQuestion} accentClass="bg-review-subtle text-review" href="#status-needs_review" />
        <MetricTile label="Eligible for dispatch" value={count("eligible")} icon={Hourglass} accentClass="bg-info-subtle text-info" href="#status-eligible" />
        <MetricTile label="Unmatched" value={count("unmatched")} icon={UserX} accentClass="bg-neutral-subtle text-neutral" href="#status-unmatched" />
        <MetricTile label="Offered" value={count("offered")} icon={Send} accentClass="bg-offer-subtle text-offer" href="#status-offered" />
        <MetricTile
          label="Claimed or en route"
          value={count("claimed") + count("collected")}
          icon={Hand}
          accentClass="bg-progress-subtle text-progress"
          href="#status-claimed"
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-xs sm:flex-row sm:items-center">
            <div role="group" aria-label="Filter donations" className="flex flex-wrap gap-1.5">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  aria-pressed={view === v.key}
                  onClick={() => setView(v.key)}
                  className={cn(
                    "h-9 rounded-lg px-3 text-sm font-medium transition-colors",
                    view === v.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <label className="relative flex-1 sm:ml-auto sm:max-w-64">
              <span className="sr-only">Search dish, donor or area</span>
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search dish, donor or area"
                className="h-10 w-full rounded-lg border border-input bg-background pr-3 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
              />
            </label>
          </div>

          {visible.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card/60 px-6 py-12 text-center">
              <Inbox aria-hidden className="size-8 text-muted-foreground" />
              <p className="font-heading font-semibold">
                {snapshot.donations.length === 0 ? "No donations yet" : "Nothing matches this view"}
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {snapshot.donations.length === 0
                  ? "When a donor sends a photo or uses the web upload, the draft appears here."
                  : "Try another filter or clear the search. Counts above still show every donation."}
              </p>
            </div>
          ) : (
            <DonationBoard
              donations={visible}
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
          )}
        </div>

        <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start" aria-label="Operator tools">
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
          {snapshot.modes.messaging.mode === "fake" && (
            <a
              href="/operator/phone"
              className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-xs transition-shadow hover:shadow-md"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                <MessageSquareText aria-hidden className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold group-hover:text-primary">Open the simulated phone</span>
                <span className="block text-xs text-muted-foreground">(fake messaging only)</span>
              </span>
            </a>
          )}
          <section className="space-y-3">
            <SectionHeading>Messaging identities</SectionHeading>
            <IdentityList identities={snapshot.identities} />
          </section>
        </aside>
      </div>
    </PageContainer>
  );
}
