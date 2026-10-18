import { ClipboardCheck, Hand, ListChecks, PackageCheck, Send, Truck, CircleHelp, Info } from "lucide-react";
import type { DonationCard, DonationStatus } from "@/contracts";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { formatPacific } from "@/components/dashboard/format";
import { PageContainer, PageHeader, SectionHeading } from "@/components/layout/PageHeader";
import { Stepper, type StepItem } from "@/components/ui/stepper";

// What a donor sees about their own donation. It renders the server's donor projection (CONTRACTS section 3.13):
// the server already filters offers and the timeline. This view goes further and shows offers only as status,
// sent and expiry times, so a courier, recipient, short code or provider id can never appear here.

const EXPLAINER: Record<DonationStatus, string> = {
  draft: "Your draft is saved. Finish the checklist to submit the facts.",
  needs_review: "A person needs to look at this before it can be offered. What is still missing is listed below.",
  eligible:
    "This donation can be offered to a courier, based on the facts you stated. It waits for the next scheduler run.",
  unmatched: "No courier and receiving organization pair is available for this donation right now. An operator can retry.",
  offered: "A courier has been offered this pickup and has a limited time to answer.",
  claimed: "A courier accepted the pickup. Pickup and delivery are simulated in this demo.",
  collected: "Marked collected (simulated). No real food moved.",
  delivered: "Marked delivered (simulated). No real food moved.",
  rejected: "This donation was rejected. The reasons are listed below.",
  canceled: "This donation was canceled.",
  expired: "The pickup time passed before the donation was claimed or collected.",
};

const STEPS = [
  { label: "Submitted", description: "Your checklist", icon: ClipboardCheck },
  { label: "Checked", description: "Prototype rules", icon: ListChecks },
  { label: "Offered", description: "Time-limited", icon: Send },
  { label: "Claimed", description: "One courier", icon: Hand },
  { label: "Collected", description: "Simulated", icon: Truck },
  { label: "Delivered", description: "Simulated", icon: PackageCheck },
] as const;

/** Where the donation is on the happy path, from server fields only. Off-path endings are drawn as "stopped here". */
function progress(card: DonationCard): StepItem[] {
  const reachedOffer = card.active_offers.length > 0 || card.offer_history.length > 0;
  const at: Record<DonationStatus, number> = {
    draft: 0,
    needs_review: 1,
    eligible: 1,
    unmatched: 2,
    offered: 2,
    claimed: 3,
    collected: 4,
    delivered: 5,
    rejected: 1,
    // Canceled/expired: stop at the furthest step the server record shows.
    canceled: card.handoff.collected_at ? 4 : card.assignment ? 3 : reachedOffer ? 2 : 1,
    expired: card.handoff.collected_at ? 4 : card.assignment ? 3 : reachedOffer ? 2 : 1,
  };
  const idx = at[card.status];
  const halted = card.status === "rejected" || card.status === "canceled" || card.status === "expired";
  const done = card.status === "delivered" || card.status === "eligible";
  return STEPS.map((s, i) => ({
    ...s,
    state:
      i < idx || (i === idx && done) ? "complete" : i === idx ? (halted ? "halted" : "current") : "upcoming",
  }));
}

function fieldLabel(key: string): string {
  if (key.startsWith("allergens.")) return `${key.slice("allergens.".length).replace(/_/g, " ")} (allergen)`;
  return key.replace(/_/g, " ");
}

export function DonorDonationView({ card }: { card: DonationCard }) {
  const title = card.verified_facts?.dish_name ?? "Your donation (draft)";
  const missing = Object.entries(card.decision?.field_states ?? {}).filter(
    ([, state]) => state === "unknown" || state === "needs_review",
  );
  const offers = [...card.active_offers, ...card.offer_history];
  return (
    <PageContainer size="narrow" className="space-y-6">
      <PageHeader
        eyebrow="Your donation"
        title={title}
        meta={
          <>
            <span>
              {card.donor_display_name} · {card.donor_area_label}
            </span>
            <StatusBadge status={card.status} size="lg" />
          </>
        }
      />

      <div className="rounded-xl border border-border bg-card p-4 shadow-xs sm:p-5">
        <Stepper label="Donation progress" steps={progress(card)} />
        <p
          data-testid="donor-status-explainer"
          className="mt-5 flex gap-2.5 rounded-lg bg-muted/60 px-3 py-2.5 text-sm text-foreground"
        >
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          {EXPLAINER[card.status]}
        </p>
        {card.effective_cutoff_at && (
          <p className="mt-3 text-sm text-muted-foreground">
            Pickup by <time dateTime={card.effective_cutoff_at} className="font-semibold text-foreground">{formatPacific(card.effective_cutoff_at)}</time>.
          </p>
        )}
      </div>

      {card.decision && card.decision.reasons.length > 0 && (
        <section className="space-y-2" aria-label="Why">
          <SectionHeading>Why</SectionHeading>
          <ul className="space-y-1.5">
            {card.decision.reasons.map((r, i) => (
              <li
                key={`${r.code}-${r.field ?? i}`}
                className="rounded-lg border border-neutral-border bg-neutral-subtle px-3 py-2 text-sm text-neutral"
              >
                {r.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {missing.length > 0 && (
        <section className="space-y-2">
          <SectionHeading>What is still missing</SectionHeading>
          <ul aria-label="Still missing" className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
            {missing.map(([key, state]) => (
              <li key={key} className="flex items-center gap-2.5 px-3 py-2.5">
                <CircleHelp aria-hidden className="size-4 shrink-0 text-review" />
                <span>
                  <span className="font-medium capitalize">{fieldLabel(key)}</span>:{" "}
                  {state === "unknown" ? "not confirmed" : "needs a person to review"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {offers.length > 0 && (
        <section className="space-y-2">
          <SectionHeading>Offers</SectionHeading>
          <ul aria-label="Offers" className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
            {offers.map((o, i) => (
              // The donor projection drops `id` (CONTRACTS section 3.13), so key on what survives it.
              <li key={`${o.sent_at}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
                <span className="font-semibold capitalize">{o.status.replace(/_/g, " ")}</span>
                <span className="text-muted-foreground">
                  sent {formatPacific(o.sent_at)} · expires {formatPacific(o.expires_at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {card.assignment && (
        <p
          data-testid="donor-assignment"
          className="rounded-xl border border-progress-border bg-progress-subtle p-3 text-sm text-progress"
        >
          Assigned: {card.assignment.courier_display_name} → {card.assignment.recipient_display_name}. Pickup and
          delivery are simulated in this demo.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Synthetic demo. This page shows what you stated and what the prototype rules returned. It is not an inspection
        of the food.
      </p>
    </PageContainer>
  );
}
