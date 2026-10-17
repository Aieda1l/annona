import { vi } from "vitest";
import { err, ok, needsReviewCard, type DonationCard, type Result, type VerifiedFacts } from "@/contracts";
import type { IntakeCore } from "@/features/intake/service";

// In-memory stand-in for the Dev 2 core functions the intake service calls (CONTRACTS §9.3).
// It is a test double, not the real gate: T-IN-08 is re-run against the real core once sub-PR 2(a) lands.
// The only gate behavior it imitates is "any `unknown` allergen -> needs_review".

export const DONOR = { role: "donor", id: "00000000-0000-4000-8000-000000000011" } as const;

export function draftCard(id: string): DonationCard {
  return {
    ...needsReviewCard,
    id,
    status: "draft",
    ai_status: "pending",
    ai_suggestion: null,
    verified_facts: null,
    edited_from_ai: [],
    decision: null,
  };
}

export function createCoreDouble() {
  const cards = new Map<string, DonationCard>();
  const bySourceRef = new Map<string, string>();
  let seq = 0;

  const double = {
    storeDonationImage: vi.fn<IntakeCore["storeDonationImage"]>(async () => ok({ image_id: `img-${++seq}` })),

    createDraft: vi.fn<IntakeCore["createDraft"]>(async ({ source, source_ref }) => {
      const key = source_ref === null ? null : `${source}:${source_ref}`;
      const existing = key ? bySourceRef.get(key) : undefined;
      if (existing) return ok(cards.get(existing)!);
      const card = draftCard(`donation-${++seq}`);
      cards.set(card.id, card);
      if (key) bySourceRef.set(key, card.id);
      return ok(card);
    }),

    attachAiResult: vi.fn<IntakeCore["attachAiResult"]>(async ({ donation_id, result }) => {
      const card = cards.get(donation_id);
      if (!card) return err("NOT_FOUND", "no such donation");
      const next: DonationCard = result.ok
        ? { ...card, ai_status: "succeeded", ai_suggestion: result.suggestion }
        : { ...card, ai_status: "failed", ai_suggestion: null };
      cards.set(donation_id, next);
      return ok(next);
    }),

    getDonationCard: vi.fn<IntakeCore["getDonationCard"]>(async (_actor, id) => {
      const card = cards.get(id);
      return card ? ok(card) : err("NOT_FOUND", "no such donation");
    }),

    submitVerification: vi.fn<IntakeCore["submitVerification"]>(async ({ donation_id, facts, edited_from_ai }) => {
      const card = cards.get(donation_id);
      if (!card) return err("NOT_FOUND", "no such donation");
      const unknownAllergen = Object.values(facts.allergens).includes("unknown");
      const next: DonationCard = {
        ...card,
        status: unknownAllergen ? "needs_review" : "eligible",
        verified_facts: facts as VerifiedFacts,
        edited_from_ai,
      };
      cards.set(donation_id, next);
      return ok({ card: next, resubmit_token: null });
    }),
  } satisfies IntakeCore;

  return { core: double, cards };
}

export type CoreDouble = ReturnType<typeof createCoreDouble>;
export type { Result };
