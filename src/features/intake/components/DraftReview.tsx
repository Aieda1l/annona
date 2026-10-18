"use client";

import type { AiStatus, Allergen, VisionSuggestion } from "@/contracts";
import { FieldStateBadge } from "@/components/dashboard/FieldStateBadge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { VerificationForm } from "./VerificationForm";

// Draft review (Dev 1): the AI's suggestion beside the donor's own fields. The suggestion is labeled,
// unverified and never fills the form. If the AI draft failed or is missing, the manual form is fully usable.
// Never render "safe", "allergen-free", "certified" or "compliant".

const ALLERGEN_NAMES: Record<Allergen, string> = {
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

export type DraftReviewProps = {
  /** Keys the form so nothing the donor typed or attested carries over to another donation. */
  donationId: string;
  aiStatus: AiStatus;
  suggestion: VisionSuggestion | null;
  imageUrl?: string | null;
  onSubmit: (raw: unknown) => void | Promise<void>;
  submitting?: boolean;
  error?: string | null;
};

function AiPanel({ suggestion }: { suggestion: VisionSuggestion }) {
  const label = suggestion.mode === "fake" ? "AI: FAKE" : `AI: ${suggestion.model ?? "real"}`;
  return (
    <section data-testid="ai-panel" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">AI draft (unverified)</h3>
        <Badge variant="outline">{label}</Badge>
      </div>
      <p data-testid="ai-disclaimer" className="text-xs text-muted-foreground">
        The AI only describes what it can see in the photo. It cannot see ingredients, allergens, temperatures or
        handling. You confirm every fact in the form.
      </p>
      <div className="flex flex-wrap gap-1.5">
        <FieldStateBadge field="dish_name" state="suggested" />
        <FieldStateBadge field="servings" state="suggested" />
        <FieldStateBadge field="allergens" state="suggested" />
      </div>

      {suggestion.dish_suggestions.length > 0 && (
        <p className="text-sm">
          <span className="font-medium">Looks like: </span>
          {suggestion.dish_suggestions.map((d) => `${d.name} (${d.confidence} confidence)`).join("; ")}
        </p>
      )}
      {suggestion.possible_allergens.length > 0 && (
        <div className="text-sm">
          <p className="font-medium">Possible allergens (a guess, not a finding):</p>
          <ul className="list-disc pl-5">
            {suggestion.possible_allergens.map((a) => (
              <li key={a.allergen}>
                {ALLERGEN_NAMES[a.allergen]}: possible — {a.basis}
              </li>
            ))}
          </ul>
        </div>
      )}
      {suggestion.uncertainty_notes.length > 0 && (
        <div className="text-sm">
          <p className="font-medium">What the AI is unsure about:</p>
          <ul className="list-disc pl-5">
            {suggestion.uncertainty_notes.map((n, i) => (
              <li key={`${i}-${n}`}>{n}</li>
            ))}
          </ul>
        </div>
      )}
      {suggestion.questions_for_donor.length > 0 && (
        <div className="text-sm">
          <p className="font-medium">Questions to consider:</p>
          <ul className="list-disc pl-5">
            {suggestion.questions_for_donor.map((q, i) => (
              <li key={`${i}-${q}`}>{q}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Notice({ children }: { children: string }) {
  return (
    <Alert role="status">
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

export function DraftReview({ donationId, aiStatus, suggestion, imageUrl = null, onSubmit, submitting, error }: DraftReviewProps) {
  // Fail closed: use the suggestion only when the AI step actually succeeded.
  const ai = aiStatus === "succeeded" ? suggestion : null;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="flex flex-col gap-3">
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated API image, not a static asset
          <img src={imageUrl} alt="Photo you submitted" className="max-h-80 w-full rounded-lg object-contain" />
        )}
        {aiStatus === "pending" && <Notice>The AI draft is still being prepared. You can start filling in the form now.</Notice>}
        {(aiStatus === "failed" || aiStatus === "skipped" || (aiStatus === "succeeded" && !suggestion)) && (
          <Notice>The AI draft is not available: the photo could not be analyzed. Please fill in the form yourself.</Notice>
        )}
        {ai?.image_quality === "poor" && (
          <Notice>The photo is hard to read, so the AI guess may be missing details.</Notice>
        )}
        {ai?.image_quality === "not_food" && <Notice>The photo does not look like food. Please check it.</Notice>}
        {ai && <AiPanel suggestion={ai} />}
      </div>
      <VerificationForm key={donationId} suggestion={ai} onSubmit={onSubmit} submitting={submitting} error={error} />
    </div>
  );
}
