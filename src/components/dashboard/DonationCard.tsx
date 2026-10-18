import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, Clock, History, MapPin, Sparkles, Users, Wheat } from "lucide-react";
import type { DonationCard as DonationCardData } from "@/contracts";
import { cn } from "cn";
import { AllergenGrid } from "./AllergenGrid";
import { AuditTimeline } from "./AuditTimeline";
import { Countdown } from "./Countdown";
import { FieldStateBadge } from "./FieldStateBadge";
import { OfferList } from "./OfferList";
import { ReasonList } from "./ReasonList";
import { StatusBadge, TONE_ACCENT, statusTone } from "./StatusBadge";
import { formatPacific } from "./format";

function Disclosure({ summary, icon: Icon, open, children }: { summary: string; icon: typeof Wheat; open?: boolean; children: ReactNode }) {
  return (
    <details className="group/d rounded-lg border border-border bg-background/60" open={open}>
      <summary className="flex min-h-11 list-none items-center gap-2 px-3 text-sm font-medium select-none [&::-webkit-details-marker]:hidden">
        <Icon aria-hidden className="size-4 text-muted-foreground" />
        {summary}
        <ChevronDown aria-hidden className="ml-auto size-4 text-muted-foreground transition-transform group-open/d:rotate-180" />
      </summary>
      <div className="px-3 pb-3">{children}</div>
    </details>
  );
}

export function DonationCard({
  card,
  actions,
  expanded = false,
  detailHref,
  hideTitle = false,
}: {
  card: DonationCardData;
  actions?: ReactNode;
  /** Opens the allergen table and the timeline by default (detail page). */
  expanded?: boolean;
  /** When set, the title links to the operator detail page. */
  detailHref?: string;
  /** The detail page shows the dish name in its own h1. */
  hideTitle?: boolean;
}) {
  const title = card.verified_facts?.dish_name ?? "Untitled draft";
  const fieldStates = Object.entries(card.decision?.field_states ?? {});
  const offers = [...card.active_offers, ...card.offer_history];
  return (
    <article
      data-testid="donation-card"
      data-donation-id={card.id}
      className="relative flex animate-rise flex-col gap-4 overflow-hidden rounded-xl border border-border bg-card p-4 pl-5 text-card-foreground shadow-sm transition-shadow hover:shadow-md sm:p-5 sm:pl-6"
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", TONE_ACCENT[statusTone(card.status)])} />
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 space-y-1">
          <h3 className={cn("text-base font-semibold sm:text-lg", hideTitle && "sr-only")}>
            {detailHref ? (
              <Link href={detailHref} className="rounded-sm underline-offset-4 hover:text-primary hover:underline">
                {title}
              </Link>
            ) : (
              title
            )}
          </h3>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users aria-hidden className="size-3.5" />
              {card.donor_display_name}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden className="size-3.5" />
              {card.donor_area_label}
            </span>
            {card.verified_facts && <span className="tabular">{card.verified_facts.servings} servings (donor-stated)</span>}
          </p>
        </div>
        <StatusBadge status={card.status} />
      </header>

      {(card.effective_cutoff_at || card.ai_suggestion) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {card.effective_cutoff_at && (
            <p className="inline-flex flex-wrap items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-foreground/85">
              <Clock aria-hidden className="size-3.5 text-muted-foreground" />
              <span>Donor pickup cutoff {formatPacific(card.effective_cutoff_at)} ·</span>
              <span className="font-semibold">
                <Countdown until={card.effective_cutoff_at} label="Cutoff" />
              </span>
            </p>
          )}
          {card.ai_suggestion && (
            <p className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-input bg-card px-2.5 py-1 text-muted-foreground">
              <Sparkles aria-hidden className="size-3.5" />
              AI draft ({card.ai_suggestion.mode === "fake" ? "FAKE provider" : "real provider"}) — an editable hypothesis, not a
              verified fact.
            </p>
          )}
        </div>
      )}

      {card.decision && <ReasonList reasons={card.decision.reasons} />}

      {fieldStates.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Field states">
          {fieldStates.map(([field, state]) => (
            <FieldStateBadge key={field} field={field} state={state} />
          ))}
        </div>
      )}

      {card.assignment && (
        <p className="flex flex-wrap items-center gap-1.5 rounded-lg border border-progress-border bg-progress-subtle px-3 py-2 text-sm text-progress">
          <span className="font-semibold">Assigned:</span> {card.assignment.courier_display_name} →{" "}
          {card.assignment.recipient_display_name}. Pickup and delivery steps are <strong>simulated</strong>.
        </p>
      )}

      {offers.length > 0 && <OfferList offers={offers} />}

      {(card.ai_suggestion || card.verified_facts || card.timeline.length > 0) && (
        <div className="space-y-2">
          {(card.ai_suggestion || card.verified_facts) && (
            <Disclosure summary="Allergens (donor statement vs AI hint)" icon={Wheat} open={expanded}>
              <AllergenGrid suggestion={card.ai_suggestion} allergens={card.verified_facts?.allergens ?? null} />
            </Disclosure>
          )}
          {card.timeline.length > 0 && (
            <Disclosure summary={`Activity (${card.timeline.length})`} icon={History} open={expanded}>
              <div className="pt-1 pl-1.5">
                <AuditTimeline events={card.timeline} />
              </div>
            </Disclosure>
          )}
        </div>
      )}

      {actions && <div className="flex flex-col gap-3 border-t border-border pt-4 empty:hidden">{actions}</div>}
    </article>
  );
}
