import { VisionModelOutput, VisionSuggestion, err, ok, type ProviderMode, type Result } from "@/contracts";

// The one validation path shared by the fake and real vision providers (PROMPT_EVAL §8).
// AI output is an untrusted hypothesis: any failure here fails closed to the manual form.

export const PROMPT_ID = "annona-intake";
export const PROMPT_VERSION = "v1";

export type VisionMeta = {
  provider: "gemini" | "fake";
  model: string | null;
  mode: ProviderMode;
  /** Prompt version to stamp; defaults to v1 (the fake provider and older callers). */
  prompt_version?: string;
};

/** PROMPT_EVAL §6 U3 word list. Matched after NFKC, format-character stripping, confusable folding, lowercasing and hyphen normalization. */
const CLAIM_PATTERNS: readonly RegExp[] = [
  /\bsafe\b/,
  /\ballergen[- ]free\b/,
  /\b[\p{L}\p{N}]+-free\b/u,
  /\bfree of\b/,
  /\bcontains no\b/,
  /\bdoes not contain\b/,
  /\bno allergens\b/,
  /\bcertified\b/,
  /\bcompliant\b/,
  /\bshelf life\b/,
  /\bgood until\b/,
  /\buse by\b/,
  /°\s*[fc]\b/,
  /\bdegrees\b/,
  // Widened with PROMPT_EVAL U3 (PR #5 review). Defence in depth: a human verifies every fact anyway.
  /\b(?:allergen|gluten|nut|peanut|dairy|egg|soy|wheat|sesame|fish|shellfish|lactose|sugar) free\b/,
  /\b(?:no|without|zero) (?:allergens?|nuts?|peanuts?|tree nuts?|dairy|gluten|eggs?|soy|wheat|sesame|fish|shellfish|milk)\b/,
  /\bbest (?:before|by)\b/,
  /\bexpires?\b/,
  /\bvegan\b/,
  /\bhypoallergenic\b/,
  /\bkept (?:chilled|cold|refrigerated|frozen|hot|warm)\b/,
  /\b(?:fahrenheit|celsius)\b/,
];

// Cyrillic and Greek letters that render like Latin ones, so "ѕafe" cannot dodge /\bsafe\b/.
const CONFUSABLES: Record<string, string> = {
  а: "a", в: "b", с: "c", е: "e", к: "k", м: "m", н: "h", о: "o", р: "p", т: "t", у: "y", х: "x",
  і: "i", ј: "j", ѕ: "s", ԁ: "d", ӏ: "l", α: "a", ε: "e", ι: "i", ο: "o", ρ: "p", υ: "u", ν: "v", κ: "k", τ: "t",
};
const CONFUSABLE_RE = new RegExp(`[${Object.keys(CONFUSABLES).join("")}]`, "g");

function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/\u00ad/g, "-") // a soft hyphen is a hidden hyphen: "gluten\u00adfree"
    .replace(/\p{Cf}/gu, "") // zero-width, bidi marks
    .toLowerCase()
    .replace(CONFUSABLE_RE, (c) => CONFUSABLES[c]!)
    .replace(/[‐-―−]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ");
}

export function containsSafetyClaim(s: string): boolean {
  const n = normalize(s);
  return CLAIM_PATTERNS.some((p) => p.test(n));
}

/** Every free-text field the dashboard or donor UI may render, with its path for error reporting. */
export function freeTextFields(o: VisionModelOutput): Array<[path: string, value: string]> {
  return [
    ...o.dish_suggestions.map((d, i): [string, string] => [`dish_suggestions[${i}].name`, d.name]),
    ...o.visible_components.map((c, i): [string, string] => [`visible_components[${i}]`, c]),
    ...o.possible_allergens.map((a, i): [string, string] => [`possible_allergens[${i}].basis`, a.basis]),
    ...o.uncertainty_notes.map((n, i): [string, string] => [`uncertainty_notes[${i}]`, n]),
    ...o.questions_for_donor.map((q, i): [string, string] => [`questions_for_donor[${i}]`, q]),
  ];
}

/**
 * Parse raw model text into a stamped VisionSuggestion.
 * Errors report the failing field path only, never the model text or any value.
 */
export function parseVisionOutput(rawText: string, meta: VisionMeta): Result<VisionSuggestion> {
  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch {
    return err("AI_OUTPUT_INVALID", "Model output is not valid JSON");
  }

  const parsed = VisionModelOutput.safeParse(json);
  if (!parsed.success) {
    const paths = parsed.error.issues.map((i) => i.path.join(".") || "(root)");
    return err("AI_OUTPUT_INVALID", "Model output failed the VisionModelOutput schema", {
      details: { fields: [...new Set(paths)] },
    });
  }

  const hit = freeTextFields(parsed.data).find(([, value]) => containsSafetyClaim(value));
  if (hit) {
    return err("AI_OUTPUT_INVALID", "Model output contains an absence or safety claim", {
      details: { field: hit[0] },
    });
  }

  const stamped = VisionSuggestion.safeParse({
    prompt_id: PROMPT_ID,
    prompt_version: meta.prompt_version ?? PROMPT_VERSION,
    provider: meta.provider,
    model: meta.model,
    mode: meta.mode,
    ...parsed.data,
  });
  if (!stamped.success) {
    return err("AI_OUTPUT_INVALID", "Stamped suggestion failed the VisionSuggestion schema");
  }
  return ok(stamped.data);
}
