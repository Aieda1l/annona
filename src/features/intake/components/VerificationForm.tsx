"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import {
  ALLERGENS,
  HANDLING_MODES,
  PREPARATION_TYPES,
  YES_NO_UNKNOWN,
  type Allergen,
  type VisionSuggestion,
} from "@/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { buildFacts, initialFormState, type FormState } from "./verification-form-model";

// The donor checklist (Dev 1). Every fact starts empty or `unknown`; the AI suggestion appears only as
// labeled, unverified hints and never fills a field. No client-side safety logic: the server parses the
// payload and the gate decides. Never render "safe", "allergen-free", "certified" or "compliant".

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

const HANDLING_LABELS: Record<(typeof HANDLING_MODES)[number], string> = {
  refrigerated: "Refrigerated",
  hot_held: "Held hot",
  ambient: "Room temperature",
  frozen: "Frozen",
  unknown: "I don't know",
};

const PREPARATION_LABELS: Record<(typeof PREPARATION_TYPES)[number], string> = {
  prepared_cold: "Prepared cold (for example sandwiches or salads)",
  commercially_packaged: "Commercially packaged",
  cooked_then_cooled: "Cooked, then cooled",
  other: "Other",
  unknown: "I don't know",
};

const YNU_LABELS: Record<(typeof YES_NO_UNKNOWN)[number], string> = { yes: "Yes", no: "No", unknown: "I don't know" };

const ALLERGEN_CHOICES = [
  { value: "present", label: "Present" },
  { value: "not_in_listed_ingredients", label: "Not in my listed ingredients" },
  { value: "unknown", label: "I don't know" },
] as const;

const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export type VerificationFormProps = {
  /** Shown only as unverified hints beside the donor's own fields. Never used to pre-fill. */
  suggestion: VisionSuggestion | null;
  onSubmit: (raw: unknown) => void | Promise<void>;
  submitting?: boolean;
  /** A server-side error to show with the validation list. */
  error?: string | null;
};

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint}
    </div>
  );
}

const Hint = ({ id, children }: { id: string; children: ReactNode }) => (
  <p data-testid={`ai-hint-${id}`} className="text-xs text-muted-foreground">
    {children}
  </p>
);

export function VerificationForm({ suggestion, onSubmit, submitting = false, error = null }: VerificationFormProps) {
  const uid = useId();
  const [state, setState] = useState<FormState>(initialFormState);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const id = (name: string) => `${uid}-${name}`;
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setState((s) => ({ ...s, [key]: value }));
  const text = (key: keyof FormState) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    set(key, e.target.value as never);

  const aiAllergens = new Map(suggestion?.possible_allergens.map((a) => [a.allergen, a.basis]) ?? []);
  const est = suggestion?.estimated_servings;

  function submit(e: FormEvent) {
    e.preventDefault();
    const built = buildFacts(state);
    if (!built.ok) {
      setErrors(built.errors);
      setAttempt((n) => n + 1);
      return;
    }
    setErrors([]);
    setSubmitError(null);
    const fail = () => setSubmitError("Your answers could not be submitted. Please try again.");
    try {
      Promise.resolve(onSubmit(built.raw)).catch(fail);
    } catch {
      fail();
    }
  }

  // After a failed submit, move focus to the error list so keyboard and screen-reader users hear it.
  useEffect(() => {
    if (attempt > 0) alertRef.current?.focus();
  }, [attempt]);

  const shown = [...errors, ...(submitError ? [submitError] : []), ...(error ? [error] : [])];
  const declared = state.cross_contact_status === "declared";

  const select = (name: keyof FormState, options: readonly string[], labels: Record<string, string>) => (
    <select id={id(name)} className={SELECT_CLASS} value={state[name] as string} onChange={text(name)}>
      {options.map((o) => (
        <option key={o} value={o}>
          {labels[o]}
        </option>
      ))}
    </select>
  );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        Please answer from your own records. Anything you are not sure about, leave as &ldquo;I don&apos;t know&rdquo;;
        the team will review it.
      </p>

      <Field
        label="Dish name"
        htmlFor={id("dish_name")}
        hint={
          suggestion && suggestion.dish_suggestions.length > 0 && (
            <Hint id="dish_name">
              AI guess (unverified):{" "}
              {suggestion.dish_suggestions.map((d) => `${d.name} (${d.confidence} confidence)`).join("; ")}
            </Hint>
          )
        }
      >
        <Input id={id("dish_name")} aria-required="true" maxLength={80} value={state.dish_name} onChange={text("dish_name")} />
      </Field>

      <Field label="Description (optional)" htmlFor={id("description")}>
        <Textarea id={id("description")} maxLength={300} value={state.description} onChange={text("description")} />
      </Field>

      <Field
        label="Servings"
        htmlFor={id("servings")}
        hint={est && <Hint id="servings">AI estimate (unverified): {est.min}–{est.max} servings</Hint>}
      >
        <Input id={id("servings")} aria-required="true" type="number" inputMode="numeric" value={state.servings} onChange={text("servings")} />
      </Field>

      <Field
        label="Ingredients (from your recipe or label)"
        htmlFor={id("ingredients_text")}
        hint={
          suggestion && suggestion.visible_components.length > 0 && (
            <Hint id="ingredients">AI saw (unverified, cannot see inside the food): {suggestion.visible_components.join(", ")}</Hint>
          )
        }
      >
        <Textarea
          id={id("ingredients_text")}
          maxLength={1000}
          value={state.ingredients_text}
          onChange={text("ingredients_text")}
        />
      </Field>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Major allergens</h3>
        <p className="text-xs text-muted-foreground">
          For each, say whether it is in the ingredients you listed. &ldquo;Not in my listed ingredients&rdquo; is your
          statement about your list; it is not a guarantee.
        </p>
        {ALLERGENS.map((a) => (
          <fieldset key={a} className="flex flex-col gap-1">
            <legend className="text-sm font-medium">{ALLERGEN_NAMES[a]}</legend>
            {aiAllergens.has(a) && (
              <Hint id={`allergen-${a}`}>AI: possible — {aiAllergens.get(a)} (unverified)</Hint>
            )}
            <div className="flex flex-wrap gap-4">
              {ALLERGEN_CHOICES.map((c) => (
                <label key={c.value} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name={id(`allergen-${a}`)}
                    value={c.value}
                    checked={state.allergens[a] === c.value}
                    onChange={() => set("allergens", { ...state.allergens, [a]: c.value })}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <Field label="Cross-contact status" htmlFor={id("cross_contact_status")}>
        <select
          id={id("cross_contact_status")}
          className={SELECT_CLASS}
          value={state.cross_contact_status}
          onChange={(e) => {
            const status = e.target.value as FormState["cross_contact_status"];
            setState((s) => ({
              ...s,
              cross_contact_status: status,
              cross_contact_allergens: status === "declared" ? s.cross_contact_allergens : [],
            }));
          }}
        >
          <option value="unknown">I don&apos;t know</option>
          <option value="declared">I&apos;ll declare below (including none)</option>
        </select>
      </Field>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">Allergens that may have touched this food</legend>
        <div className="flex flex-wrap gap-4">
          {ALLERGENS.map((a) => (
            <label key={a} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                aria-label={`${ALLERGEN_NAMES[a]} cross-contact`}
                disabled={!declared}
                checked={state.cross_contact_allergens.includes(a)}
                onChange={(e) =>
                  set(
                    "cross_contact_allergens",
                    e.target.checked
                      ? [...state.cross_contact_allergens, a]
                      : state.cross_contact_allergens.filter((x) => x !== a),
                  )
                }
              />
              {ALLERGEN_NAMES[a]}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="How is this food being held right now?" htmlFor={id("handling_mode")}>
        {select("handling_mode", HANDLING_MODES, HANDLING_LABELS)}
      </Field>
      <Field label="How was it prepared?" htmlFor={id("preparation_type")}>
        {select("preparation_type", PREPARATION_TYPES, PREPARATION_LABELS)}
      </Field>
      <Field
        label="Does this include raw/unpasteurized milk, infant formula, home-prepared or home-canned food, damaged cans, food damaged by fire, flood or temperature, or anything you vacuum- or reduced-oxygen-packaged yourself?"
        htmlFor={id("contains_excluded_category")}
      >
        {select("contains_excluded_category", YES_NO_UNKNOWN, YNU_LABELS)}
      </Field>
      <Field
        label="Held at 41 °F (5 °C) or below continuously since preparation, per your establishment's procedures?"
        htmlFor={id("continuous_cold_holding")}
      >
        {select("continuous_cold_holding", YES_NO_UNKNOWN, YNU_LABELS)}
      </Field>
      <Field label="Do you have a temperature log for this food?" htmlFor={id("temperature_log_available")}>
        {select("temperature_log_available", YES_NO_UNKNOWN, YNU_LABELS)}
      </Field>
      <Field
        label="Was any of this food served to or handled by customers (for example on a buffet line)?"
        htmlFor={id("previously_served")}
      >
        {select("previously_served", YES_NO_UNKNOWN, YNU_LABELS)}
      </Field>
      <Field label="Is the food in covered, food-grade containers?" htmlFor={id("covered_food_grade_containers")}>
        {select("covered_food_grade_containers", YES_NO_UNKNOWN, YNU_LABELS)}
      </Field>

      <Field label="Discard-by time from your kitchen's own procedure" htmlFor={id("discard_by")}>
        <Input
          id={id("discard_by")}
          type="datetime-local"
          disabled={state.no_discard_by}
          value={state.discard_by_local}
          onChange={text("discard_by_local")}
        />
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={state.no_discard_by}
            onChange={(e) => set("no_discard_by", e.target.checked)}
          />
          My kitchen has no discard-by time
        </label>
      </Field>

      <Field label="Latest time you can hand the food over" htmlFor={id("donor_pickup_by")}>
        <Input
          id={id("donor_pickup_by")}
          aria-required="true"
          type="datetime-local"
          value={state.donor_pickup_by_local}
          onChange={text("donor_pickup_by_local")}
        />
      </Field>

      <Field label="Pickup instructions (shared only with the courier who accepts)" htmlFor={id("pickup_instructions")}>
        <Input
          id={id("pickup_instructions")}
          maxLength={200}
          value={state.pickup_instructions}
          onChange={text("pickup_instructions")}
        />
      </Field>

      <Field label="Your name or role (for the attestation)" htmlFor={id("attested_by_label")}>
        <Input
          id={id("attested_by_label")}
          aria-required="true"
          maxLength={80}
          value={state.attested_by_label}
          onChange={text("attested_by_label")}
        />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={state.attested}
          onChange={(e) => set("attested", e.target.checked)}
        />
        I attest that these answers are accurate to the best of my knowledge.
      </label>

      {shown.length > 0 && (
        <Alert ref={alertRef} tabIndex={-1} variant="destructive" role="alert">
          <AlertDescription>
            <ul className="list-disc pl-4">
              {shown.map((m, i) => (
                <li key={`${i}-${m}`}>{m}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={submitting}>
        {submitting ? "Submitting…" : "Submit for review"}
      </Button>
    </form>
  );
}
