import type { DonationCard as DonationCardData } from "@/contracts";
import { FieldStateBadge } from "./FieldStateBadge";
import { ReasonList } from "./ReasonList";
import { StatusBadge } from "./StatusBadge";

export function DonationCard({ card }: { card: DonationCardData }) {
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

      {card.decision && <ReasonList reasons={card.decision.reasons} />}

      {fieldStates.length > 0 && (
        <div className="flex flex-wrap gap-1" aria-label="Field states">
          {fieldStates.map(([field, state]) => (
            <FieldStateBadge key={field} field={field} state={state} />
          ))}
        </div>
      )}
    </article>
  );
}
