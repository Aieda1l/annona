import type { ReactNode } from "react";
import type { DonationCard as DonationCardData } from "@/contracts";
import { AllergenGrid } from "./AllergenGrid";
import { AuditTimeline } from "./AuditTimeline";
import { Countdown } from "./Countdown";
import { FieldStateBadge } from "./FieldStateBadge";
import { OfferList } from "./OfferList";
import { ReasonList } from "./ReasonList";
import { StatusBadge } from "./StatusBadge";
import { formatPacific } from "./format";

export function DonationCard({ card, actions }: { card: DonationCardData; actions?: ReactNode }) {
  const title = card.verified_facts?.dish_name ?? "Untitled draft";
  const fieldStates = Object.entries(card.decision?.field_states ?? {});
  return (
    <article
      data-testid="donation-card"
      data-donation-id={card.id}
      className="space-y-3 rounded-lg border border-slate-300 bg-white p-4 text-slate-900"
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-sm text-slate-700">
            {card.donor_display_name} · {card.donor_area_label}
          </p>
        </div>
        <StatusBadge status={card.status} />
      </header>

      {card.ai_suggestion && (
        <p className="text-xs text-slate-700">
          AI draft ({card.ai_suggestion.mode === "fake" ? "FAKE provider" : "real provider"}) — an editable
          hypothesis, not a verified fact.
        </p>
      )}

      {card.effective_cutoff_at && (
        <p className="text-xs text-slate-700">
          Donor pickup cutoff {formatPacific(card.effective_cutoff_at)} ·{" "}
          <Countdown until={card.effective_cutoff_at} label="Cutoff" />
        </p>
      )}

      {card.decision && <ReasonList reasons={card.decision.reasons} />}

      {fieldStates.length > 0 && (
        <div className="flex flex-wrap gap-1" aria-label="Field states">
          {fieldStates.map(([field, state]) => (
            <FieldStateBadge key={field} field={field} state={state} />
          ))}
        </div>
      )}

      {(card.ai_suggestion || card.verified_facts) && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Allergens (donor statement vs AI hint)</summary>
          <AllergenGrid suggestion={card.ai_suggestion} allergens={card.verified_facts?.allergens ?? null} />
        </details>
      )}

      <OfferList offers={[...card.active_offers, ...card.offer_history]} />

      {card.assignment && (
        <p className="text-sm">
          Assigned: {card.assignment.courier_display_name} → {card.assignment.recipient_display_name}. Pickup and
          delivery steps are <strong>simulated</strong>.
        </p>
      )}

      {card.timeline.length > 0 && <AuditTimeline events={card.timeline} />}
      {actions}
    </article>
  );
}
