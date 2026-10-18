"use client";

import { Camera, Gavel } from "lucide-react";
import type { DonationCard as DonationCardData, HandoffStep, OperatorAction } from "@/contracts";
import { PageContainer, PageHeader } from "@/components/layout/PageHeader";
import type { Outcome } from "./api";
import { DonationCard } from "./DonationCard";
import { FactsList } from "./FactsList";
import { HandoffControls } from "./HandoffControls";
import { OperatorActions, availableActions } from "./OperatorActions";
import { PhotoPreview } from "./PhotoPreview";

function RailPanel({ title, icon: Icon, children, label }: { title: string; icon: typeof Camera; children: React.ReactNode; label?: string }) {
  return (
    <section aria-label={label} className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-xs">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon aria-hidden className="size-4 text-muted-foreground" />
        {title}
      </h2>
      {children}
    </section>
  );
}

/** One donation, in full, exactly as the server returned it. Nothing here decides status, eligibility or time. */
export function DonationDetail({
  card,
  onAction,
  onHandoff,
  actionError,
  notice,
}: {
  card: DonationCardData;
  onAction: (action: OperatorAction, note: string) => void | Promise<void>;
  onHandoff: (step: HandoffStep) => Promise<Outcome>;
  actionError?: string | null;
  /** A fixture/stale notice from the wrapper, shown under the header. */
  notice?: React.ReactNode;
}) {
  const title = card.verified_facts?.dish_name ?? "Untitled draft";
  return (
    <PageContainer size="wide" className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Dashboard", href: "/operator" }, { label: title }]}
        eyebrow="Donation"
        title={title}
        description={
          <>
            Everything below is the server&apos;s record. Facts are donor-attested; the eligibility decision is the
            prototype operator policy, not an inspection of the food.
          </>
        }
      />
      {notice}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <DonationCard card={card} expanded hideTitle />
          <div className="rounded-xl border border-border bg-card p-4 shadow-xs sm:p-5">
            <FactsList facts={card.verified_facts} />
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start" aria-label="Operator tools">
          <HandoffControls card={card} onHandoff={onHandoff} />
          <RailPanel title="Operator actions" icon={Gavel}>
            <OperatorActions card={card} onAction={onAction} error={actionError ?? null} />
            {availableActions(card).length === 0 && (
              <p className="text-sm text-muted-foreground">No operator actions apply to this status.</p>
            )}
            <p className="text-xs text-muted-foreground">
              The server re-checks every action and shows its refusal word for word. There is no approve or dispatch
              control here.
            </p>
          </RailPanel>
          <RailPanel title="Donor photo" icon={Camera} label="Donor photo">
            {card.image_url ? (
              <PhotoPreview src={card.image_url} />
            ) : (
              <p className="text-sm text-muted-foreground">No image on file.</p>
            )}
          </RailPanel>
        </aside>
      </div>
    </PageContainer>
  );
}
