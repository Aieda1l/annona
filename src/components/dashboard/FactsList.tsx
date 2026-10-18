import { ClipboardList } from "lucide-react";
import type { VerifiedFacts } from "@/contracts";
import { cn } from "cn";
import { formatPacific } from "./format";

const label = (s: string) => s.replace(/_/g, " ");

function Value({ v }: { v: string }) {
  // "unknown" stays visibly unknown (dashed chip), never blends in with an answered fact.
  if (v === "unknown")
    return (
      <span className="inline-flex rounded-md border border-dashed border-closed-border bg-closed-subtle px-1.5 py-0.5 text-xs text-closed">
        unknown
      </span>
    );
  return <>{v}</>;
}

/**
 * What the donor stated on the checklist, exactly as submitted. Annona has not checked any of it, and the
 * gate's decision is shown separately. `unknown` stays `unknown`.
 */
export function FactsList({ facts }: { facts: VerifiedFacts | null }) {
  const groups: { title: string; rows: (readonly [string, string])[] }[] = facts
    ? [
        {
          title: "The food",
          rows: [
            ["Dish", facts.dish_name],
            ["Servings", String(facts.servings)],
            ["Description", facts.description || "—"],
            ["Ingredients", facts.ingredients_text || "—"],
          ],
        },
        {
          title: "Handling",
          rows: [
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
          ],
        },
        {
          title: "Timing and pickup",
          rows: [
            ["Discard by", formatPacific(facts.discard_by)],
            ["Donor pickup by", formatPacific(facts.donor_pickup_by)],
            ["Pickup instructions", facts.pickup_instructions || "—"],
          ],
        },
        {
          title: "Attestation",
          rows: [["Attested by", `${facts.attestation.attested_by_label} · ${formatPacific(facts.attestation.attested_at)}`]],
        },
      ]
    : [];

  return (
    <section aria-label="Donor-attested facts" className="space-y-4">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <ClipboardList aria-hidden className="size-4.5 text-muted-foreground" />
          Donor-attested facts
        </h3>
        {facts !== null && (
          <p className="text-xs text-muted-foreground">Stated by the donor on the checklist. Not checked by Annona.</p>
        )}
      </div>
      {facts === null ? (
        <p className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-4 text-sm text-muted-foreground">
          No donor facts submitted yet.
        </p>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {groups.map((g, gi) => (
            <div key={g.title} className={cn("space-y-2", gi === 1 && "md:row-span-2")}>
              <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{g.title}</h4>
              <dl className="divide-y divide-border rounded-lg border border-border">
                {g.rows.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-3 px-3 py-2 text-sm">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="min-w-0 font-medium break-words text-foreground">
                      <Value v={v} />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
