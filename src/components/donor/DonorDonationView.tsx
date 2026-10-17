import type { DonationCard, DonationStatus } from "@/contracts";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { formatPacific } from "@/components/dashboard/format";

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
    <main className="mx-auto w-full max-w-xl space-y-4 p-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-700">
          {card.donor_display_name} · {card.donor_area_label}
        </p>
        <StatusBadge status={card.status} />
      </header>

      <p data-testid="donor-status-explainer" className="rounded border border-slate-300 bg-white p-3 text-sm text-slate-900">
        {EXPLAINER[card.status]}
      </p>

      {card.effective_cutoff_at && (
        <p className="text-sm text-slate-800">Pickup by {formatPacific(card.effective_cutoff_at)}.</p>
      )}

      {card.decision && card.decision.reasons.length > 0 && (
        <section className="space-y-1" aria-label="Why">
          <h2 className="text-base font-semibold text-slate-900">Why</h2>
          <ul className="space-y-1">
            {card.decision.reasons.map((r, i) => (
              <li key={`${r.code}-${r.field ?? i}`} className="rounded border-l-4 border-slate-400 bg-slate-50 px-2 py-1 text-sm">
                {r.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {missing.length > 0 && (
        <section className="space-y-1">
          <h2 className="text-base font-semibold text-slate-900">What is still missing</h2>
          <ul aria-label="Still missing" className="list-inside list-disc text-sm text-slate-900">
            {missing.map(([key, state]) => (
              <li key={key}>
                {fieldLabel(key)}: {state === "unknown" ? "not confirmed" : "needs a person to review"}
              </li>
            ))}
          </ul>
        </section>
      )}

      {offers.length > 0 && (
        <section className="space-y-1">
          <h2 className="text-base font-semibold text-slate-900">Offers</h2>
          <ul aria-label="Offers" className="space-y-1 text-sm">
            {offers.map((o) => (
              <li key={o.id} className="rounded border border-slate-300 bg-white px-2 py-1">
                <span className="font-medium capitalize">{o.status.replace(/_/g, " ")}</span> · sent {formatPacific(o.sent_at)} ·
                expires {formatPacific(o.expires_at)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {card.assignment && (
        <p data-testid="donor-assignment" className="rounded border border-slate-300 bg-white p-3 text-sm text-slate-900">
          Assigned: {card.assignment.courier_display_name} → {card.assignment.recipient_display_name}. Pickup and
          delivery are simulated in this demo.
        </p>
      )}

      <p className="text-xs text-slate-700">
        Synthetic demo. This page shows what you stated and what the prototype rules returned. It is not an inspection
        of the food.
      </p>
    </main>
  );
}
