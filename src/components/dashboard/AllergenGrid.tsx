import { CircleHelp, Sparkles } from "lucide-react";
import { ALLERGENS, type Allergen, type DonorAllergenStatus, type VisionSuggestion } from "@/contracts";
import { cn } from "cn";

const DONOR_LABEL: Record<DonorAllergenStatus, string> = {
  present: "Donor: present",
  not_in_listed_ingredients: "Donor: not in listed ingredients",
  unknown: "Donor: unknown",
};

// Unknown is visibly unfinished (dashed); "not in listed ingredients" is a plain statement, never styled as a pass.
const DONOR_CLASS: Record<DonorAllergenStatus, string> = {
  present: "border-neutral-border bg-neutral-subtle font-semibold text-foreground",
  not_in_listed_ingredients: "border-neutral-border bg-card text-foreground/85",
  unknown: "border-dashed border-closed-border bg-closed-subtle text-closed",
};

const NAME: Record<Allergen, string> = {
  milk: "Milk",
  eggs: "Eggs",
  fish: "Fish",
  crustacean_shellfish: "Crustacean shellfish",
  tree_nuts: "Tree nuts",
  peanuts: "Peanuts",
  wheat: "Wheat",
  soybeans: "Soybeans",
  sesame: "Sesame",
};

/**
 * All nine major allergens. The donor's statement and the AI's "possible" hint sit side by side.
 * An allergen the AI did not list shows nothing from the AI; it is never presented as absent.
 * Missing donor facts display as unknown.
 */
export function AllergenGrid({
  suggestion,
  allergens,
}: {
  suggestion: VisionSuggestion | null;
  allergens: Record<Allergen, DonorAllergenStatus> | null;
}) {
  const possible = new Map((suggestion?.possible_allergens ?? []).map((p) => [p.allergen, p.basis]));
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[30rem] text-left text-sm" aria-label="Allergens">
        <thead className="bg-muted/60">
          <tr className="text-xs text-muted-foreground">
            <th scope="col" className="px-3 py-2 font-semibold">Allergen</th>
            <th scope="col" className="px-3 py-2 font-semibold">Donor statement</th>
            <th scope="col" className="px-3 py-2 font-semibold">AI hint</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {ALLERGENS.map((a) => {
            const status = allergens?.[a] ?? "unknown";
            const basis = possible.get(a);
            return (
              <tr key={a} data-testid={`allergen-${a}`} data-donor-status={status}>
                <th scope="row" className="px-3 py-2 font-medium">{NAME[a]}</th>
                <td className="px-3 py-2">
                  <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs", DONOR_CLASS[status])}>
                    {status === "unknown" && <CircleHelp aria-hidden className="size-3" />}
                    {DONOR_LABEL[status]}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {basis !== undefined ? (
                    <span className="inline-flex items-center gap-1">
                      <Sparkles aria-hidden className="size-3" />
                      {`AI: possible (${basis})`}
                    </span>
                  ) : (
                    ""
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
