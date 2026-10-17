import { ALLERGENS, type Allergen, type DonorAllergenStatus, type VisionSuggestion } from "@/contracts";

const DONOR_LABEL: Record<DonorAllergenStatus, string> = {
  present: "Donor: present",
  not_in_listed_ingredients: "Donor: not in listed ingredients",
  unknown: "Donor: unknown",
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
    <table className="w-full text-left text-sm" aria-label="Allergens">
      <thead>
        <tr className="text-xs text-slate-700">
          <th className="py-1 pr-2 font-medium">Allergen</th>
          <th className="py-1 pr-2 font-medium">Donor statement</th>
          <th className="py-1 font-medium">AI hint</th>
        </tr>
      </thead>
      <tbody>
        {ALLERGENS.map((a) => {
          const status = allergens?.[a] ?? "unknown";
          const basis = possible.get(a);
          return (
            <tr key={a} data-testid={`allergen-${a}`} data-donor-status={status} className="border-t border-slate-200">
              <td className="py-1 pr-2">{NAME[a]}</td>
              <td className="py-1 pr-2">{DONOR_LABEL[status]}</td>
              <td className="py-1">{basis !== undefined ? `AI: possible (${basis})` : ""}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
