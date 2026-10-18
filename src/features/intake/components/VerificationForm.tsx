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
import { buildFacts, initialFormState, prefillFromSuggestion, showsColdQuestions, toLocalInput, type AiFilled, type FormState } from "./verification-form-model";

// The donor checklist (Dev 1). Every fact starts empty or `unknown`, except what the AI draft fills to save typing
// (D-042; see `prefillFromSuggestion`): dish name, servings, the ingredients text and the allergens the AI flagged,
// each tagged "from the AI draft" and editable. The AI never fills "not in my listed ingredients", cross-contact,
// handling, preparation, temperatures or times. No client-side safety logic: the server parses the payload and the gate
// decides. Never render "safe", "allergen-free", "certified" or "compliant".

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
  /** Unverified hints beside the fields; also fills a few descriptive fields that are still untouched (D-042). */
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

const AiTag = ({ field, children }: { field: string; children: ReactNode }) => (
  <span data-testid={`ai-filled-${field}`} className="w-fit rounded border border-dashed border-input px-1.5 py-0.5 text-xs text-muted-foreground">
    {children}
  </span>
);

/** "+1 h / +2 h / +4 h" buttons: the donor clicks one to fill a time field; nothing is pre-selected. */
function TimeShortcuts({ label, disabled, onPick }: { label: string; disabled?: boolean; onPick: (local: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={`${label} shortcuts`}>
      {[1, 2, 4].map((h) => (
        <Button
          key={h}
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-label={`${label} +${h} h from now`}
          onClick={() => onPick(toLocalInput(new Date(Date.now() + h * 3_600_000)))}
        >
          +{h} h
        </Button>
      ))}
    </div>
  );
}

export function VerificationForm({ suggestion, onSubmit, submitting = false, error = null }: VerificationFormProps) {
  const uid = useId();
  // A suggestion that is there at the first render fills the form at once (no empty flash, nothing to wait for); one that
  // arrives later is applied by the effect below.
  const [initial] = useState(() => prefillFromSuggestion(initialFormState(), suggestion));
  const [state, setState] = useState<FormState>(initial.state);
  const [aiFilled, setAiFilled] = useState<AiFilled>(initial.filled);
  const appliedFor = useRef<VisionSuggestion | null>(suggestion);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [errors, setErrors] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const id = (name: string) => `${uid}-${name}`;
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setState((s) => ({ ...s, [key]: value }));
  const text = (key: keyof FormState) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    set(key, e.target.value as never);

  // Start from the AI draft once per suggestion, filling only what the donor has not touched yet (a draft that arrives
  // after the donor began typing never overwrites their text).
  useEffect(() => {
    if (!suggestion || appliedFor.current === suggestion) return;
    appliedFor.current = suggestion;
    const out = prefillFromSuggestion(stateRef.current, suggestion);
    setState(out.state);
    setAiFilled((f) => ({
      dish_name: out.filled.dish_name ?? f.dish_name,
      servings: out.filled.servings ?? f.servings,
      ingredients_text: out.filled.ingredients_text ?? f.ingredients_text,
      allergens: [...new Set([...f.allergens, ...out.filled.allergens])],
    }));
  }, [suggestion]);

  /** The tag is shown only while the field still holds what the AI draft put there. */
  const stillAi = (field: "dish_name" | "servings" | "ingredients_text") => aiFilled[field] !== undefined && state[field] === aiFilled[field];
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
        {stillAi("dish_name") && <AiTag field="dish_name">From the AI draft: check it</AiTag>}
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
        {stillAi("servings") && <AiTag field="servings">From the AI draft (the lower end of its estimate): check it</AiTag>}
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
        {stillAi("ingredients_text") && (
          <>
            <AiTag field="ingredients_text">From the AI draft: it only lists what it can see, not what is inside the food</AiTag>
            <label className="flex items-start gap-1.5 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={state.ingredients_checked}
                onChange={(e) => set("ingredients_checked", e.target.checked)}
              />
              I checked this ingredient list against my recipe or label
            </label>
          </>
        )}
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
            {aiFilled.allergens.includes(a) && state.allergens[a] === "present" && (
              <AiTag field={`allergen-${a}`}>Pre-selected from the AI draft (it flagged this as possible): change it if it is not in your food</AiTag>
            )}
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
      {showsColdQuestions(state.handling_mode) ? (
        <>
          <Field
            label="Held at 41 °F (5 °C) or below continuously since preparation, per your establishment's procedures?"
            htmlFor={id("continuous_cold_holding")}
          >
            {select("continuous_cold_holding", YES_NO_UNKNOWN, YNU_LABELS)}
          </Field>
          <Field label="Do you have a temperature log for this food?" htmlFor={id("temperature_log_available")}>
            {select("temperature_log_available", YES_NO_UNKNOWN, YNU_LABELS)}
          </Field>
        </>
      ) : (
        <p data-testid="cold-questions-skipped" className="text-xs text-muted-foreground">
          This prototype only offers refrigerated food, so the cold-holding and temperature-log questions are skipped for this
          food. It will be sent for review.
        </p>
      )}
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
        <TimeShortcuts label="Discard-by time" disabled={state.no_discard_by} onPick={(v) => set("discard_by_local", v)} />
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
        <TimeShortcuts label="Pickup time" onPick={(v) => set("donor_pickup_by_local", v)} />
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
