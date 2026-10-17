import type { VerifiedFacts } from "@/contracts";
import { formatPacific } from "./format";

const label = (s: string) => s.replace(/_/g, " ");

/**
 * What the donor stated on the checklist, exactly as submitted. Annona has not checked any of it, and the
 * gate's decision is shown separately. `unknown` stays `unknown`.
 */
export function FactsList({ facts }: { facts: VerifiedFacts | null }) {
  return (
    <section aria-label="Donor-attested facts" className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-900">Donor-attested facts</h3>
      {facts === null ? (
        <p className="text-sm text-slate-700">No donor facts submitted yet.</p>
      ) : (
        <>
          <p className="text-xs text-slate-700">Stated by the donor on the checklist. Not checked by Annona.</p>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
            {(
              [
                ["Dish", facts.dish_name],
                ["Servings", String(facts.servings)],
                ["Description", facts.description || "—"],
                ["Ingredients", facts.ingredients_text || "—"],
                ["Handling", label(facts.handling_mode)],
                ["Preparation", label(facts.preparation_type)],
                ["Excluded category", facts.contains_excluded_category],
                ["Continuous cold holding", facts.continuous_cold_holding],
                ["Temperature log available", facts.temperature_log_available],
                ["Previously served", facts.previously_served],
                ["Covered food-grade containers", facts.covered_food_grade_containers],
                [
                  "Cross-contact",
                  facts.cross_contact_status === "declared"
                    ? facts.cross_contact_allergens.length > 0
                      ? `declared: ${facts.cross_contact_allergens.map(label).join(", ")}`
                      : "declared: none listed by donor"
                    : "unknown",
                ],
                ["Discard by", formatPacific(facts.discard_by)],
                ["Donor pickup by", formatPacific(facts.donor_pickup_by)],
                ["Pickup instructions", facts.pickup_instructions || "—"],
                ["Attested by", `${facts.attestation.attested_by_label} · ${formatPacific(facts.attestation.attested_at)}`],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-medium text-slate-800">{k}</dt>
                <dd className="text-slate-900">{v}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}
