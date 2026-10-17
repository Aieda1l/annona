import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { VisionModelOutput, VisionProvider } from "@/contracts";
import { parseVisionOutput, type VisionMeta } from "./parse";

// Deterministic fake VisionProvider (server-only). It recognizes fixture images by the SHA-256 of their
// bytes, builds raw model text and sends it through parseVisionOutput, so fake and real share one
// validation path. Every result carries mode "fake"; it is never a stand-in for a failed real call.

const META: VisionMeta = { provider: "fake", model: null, mode: "fake" };
const LITERAL_FLAGS = {
  ingredients_verified: false,
  handling_verified: false,
  requires_donor_confirmation: true,
} as const;

export const FIXTURE_IDS = ["sandwich_platter", "buffet_ambiguous", "pasta_tray", "blurry", "malformed_output"] as const;
export type FixtureId = (typeof FIXTURE_IDS)[number];

const OUTPUTS: Record<Exclude<FixtureId, "malformed_output">, VisionModelOutput> = {
  sandwich_platter: {
    image_quality: "usable",
    dish_suggestions: [{ name: "assorted deli sandwiches and wraps", confidence: "medium" }],
    visible_components: ["sliced bread sandwiches", "tortilla wraps", "lettuce", "sliced cheese"],
    estimated_servings: { min: 18, max: 30 },
    possible_allergens: [
      { allergen: "wheat", basis: "bread and tortillas are typically wheat-based" },
      { allergen: "milk", basis: "visible sliced cheese" },
      { allergen: "eggs", basis: "spreads such as mayonnaise commonly contain egg" },
    ],
    uncertainty_notes: ["Fillings and spreads cannot be identified from a photo."],
    questions_for_donor: ["Which spreads and fillings are used? Do any contain sesame, soy, nuts or fish?"],
    ...LITERAL_FLAGS,
  },
  buffet_ambiguous: {
    image_quality: "usable",
    dish_suggestions: [{ name: "mixed buffet dishes", confidence: "low" }],
    visible_components: ["several trays", "mixed food items"],
    estimated_servings: null,
    possible_allergens: [],
    uncertainty_notes: [
      "Several dishes overlap and individual items are hard to tell apart.",
      "Ingredients and sauces cannot be identified from this photo.",
    ],
    questions_for_donor: ["What dishes are on each tray, and what are the main ingredients of each?"],
    ...LITERAL_FLAGS,
  },
  pasta_tray: {
    image_quality: "usable",
    dish_suggestions: [{ name: "pasta with tomato sauce", confidence: "medium" }],
    visible_components: ["pasta", "red sauce", "serving tray"],
    estimated_servings: { min: 20, max: 40 },
    possible_allergens: [
      { allergen: "wheat", basis: "pasta is typically wheat-based" },
      { allergen: "milk", basis: "baked pasta trays often include cheese" },
    ],
    uncertainty_notes: ["Sauce and any cheese or filling cannot be identified from a photo."],
    questions_for_donor: ["What is in the sauce, and does the dish include cheese, egg or other fillings?"],
    ...LITERAL_FLAGS,
  },
  blurry: {
    image_quality: "poor",
    dish_suggestions: [{ name: "unidentified food", confidence: "low" }],
    visible_components: [],
    estimated_servings: null,
    possible_allergens: [],
    uncertainty_notes: ["The photo is too blurry to identify the food."],
    questions_for_donor: ["Please describe the dish, or retake the photo in better light."],
    ...LITERAL_FLAGS,
  },
};

const UNKNOWN_IMAGE: VisionModelOutput = {
  image_quality: "usable",
  dish_suggestions: [{ name: "unidentified food", confidence: "low" }],
  visible_components: [],
  estimated_servings: null,
  possible_allergens: [],
  uncertainty_notes: ["Fake mode: this image is not a known fixture, so no description is available."],
  questions_for_donor: ["Please describe the dish, its ingredients and the number of servings."],
  ...LITERAL_FLAGS,
};

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** Build the hash -> fixture map from the files themselves; never hand-typed hashes. A missing file is simply unmapped. */
function loadHashes(dir: string): Map<string, FixtureId> {
  const map = new Map<string, FixtureId>();
  for (const id of FIXTURE_IDS) {
    const file = join(dir, `${id}.jpg`);
    if (existsSync(file)) map.set(sha256(readFileSync(file)), id);
  }
  return map;
}

export function createFakeVisionProvider(opts: { imagesDir?: string } = {}): VisionProvider {
  const hashes = loadHashes(opts.imagesDir ?? join(process.cwd(), "fixtures/intake/images"));
  return {
    mode: "fake",
    model: null,
    status: "ok",
    async analyzeFoodImage({ image }) {
      const id = hashes.get(sha256(Buffer.from(image.bytes_base64, "base64")));
      const raw =
        id === "malformed_output"
          ? '{"image_quality": "usable", "dish_suggestions": [' // truncated JSON
          : JSON.stringify(id ? OUTPUTS[id] : UNKNOWN_IMAGE);
      return parseVisionOutput(raw, META);
    },
  };
}
