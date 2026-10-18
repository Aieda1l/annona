"use client";

import type { DonationCard as DonationCardData, HandoffStep, OperatorAction } from "@/contracts";
import type { Outcome } from "./api";
import { DonationCard } from "./DonationCard";
import { FactsList } from "./FactsList";
import { HandoffControls } from "./HandoffControls";
import { OperatorActions } from "./OperatorActions";
import { PhotoPreview } from "./PhotoPreview";

/** One donation, in full, exactly as the server returned it. Nothing here decides status, eligibility or time. */
export function DonationDetail({
  card,
  onAction,
  onHandoff,
  actionError,
}: {
  card: DonationCardData;
  onAction: (action: OperatorAction, note: string) => void | Promise<void>;
  onHandoff: (step: HandoffStep) => Promise<Outcome>;
  actionError?: string | null;
}) {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4">
      <p className="text-sm">
        <a href="/operator" className="font-medium underline">
          Back to the operator dashboard
        </a>
      </p>

      <DonationCard
        card={card}
        expanded
        actions={
          <>
            <HandoffControls card={card} onHandoff={onHandoff} />
            <OperatorActions card={card} onAction={onAction} error={actionError ?? null} />
          </>
        }
      />

      <section aria-label="Donor photo" className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">Donor photo</h3>
        {card.image_url ? (
          <PhotoPreview src={card.image_url} />
        ) : (
          <p className="text-sm text-slate-700">No image on file.</p>
        )}
      </section>

      <FactsList facts={card.verified_facts} />
    </div>
  );
}
