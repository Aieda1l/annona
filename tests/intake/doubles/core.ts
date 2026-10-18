import { vi } from "vitest";
import { err, ok, needsReviewCard, type DonationCard, type Result, type VerificationLinkView, type VerifiedFacts } from "@/contracts";
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
  const links = new Map<string, { donation_id: string; expires_at: string; consumed: boolean }>();
  let seq = 0;
  const newToken = () => `tok-${++seq}-${"x".repeat(30)}`;

  const viewOf = (token: string): VerificationLinkView | null => {
    const link = links.get(token);
    const card = link && cards.get(link.donation_id);
    if (!link || link.consumed || !card) return null;
    return {
      donation_id: card.id,
      donor_display_name: card.donor_display_name,
      status: card.status,
      ai_status: card.ai_status,
      ai_suggestion: card.ai_suggestion,
      verified_facts: card.verified_facts,
      decision: card.decision,
      link_expires_at: link.expires_at,
      resubmit_token: null,
      is_synthetic: true,
    };
  };

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

    getVerificationLinkView: vi.fn<IntakeCore["getVerificationLinkView"]>(async ({ token }) => {
      const view = viewOf(token);
      return view ? ok(view) : err("NOT_AUTHORIZED", "double: bad token");
    }),

    getVerificationLinkImage: vi.fn<IntakeCore["getVerificationLinkImage"]>(async ({ token }) =>
      viewOf(token) ? ok({ mime: "image/jpeg", bytes: new Uint8Array([1, 2, 3]) }) : err("NOT_AUTHORIZED", "double: bad token"),
    ),

    submitVerification: vi.fn<IntakeCore["submitVerification"]>(async ({ auth, donation_id, facts, edited_from_ai }) => {
      const card = cards.get(donation_id);
      if (!card) return err("NOT_FOUND", "no such donation");
      let link: { donation_id: string; expires_at: string; consumed: boolean } | undefined;
      if ("link_token" in auth) {
        link = links.get(auth.link_token);
        if (!link || link.consumed || link.donation_id !== donation_id) return err("NOT_AUTHORIZED", "double: bad token");
      }
      const unknownAllergen = Object.values(facts.allergens).includes("unknown");
      const next: DonationCard = {
        ...card,
        status: unknownAllergen ? "needs_review" : "eligible",
        verified_facts: facts as VerifiedFacts,
        edited_from_ai,
      };
      cards.set(donation_id, next);
      let resubmit_token: string | null = null;
      if (link && "link_token" in auth) {
        link.consumed = true; // consumed only on success
        if (next.status === "needs_review") {
          resubmit_token = newToken();
          links.set(resubmit_token, { donation_id, expires_at: "2026-10-18T00:00:00.000Z", consumed: false });
        }
      }
      return ok({ card: next, resubmit_token });
    }),
  } satisfies IntakeCore;

  /** Test helper: a live link for a donation. */
  const issueLink = (donation_id: string, expires_at = "2026-10-17T23:40:00.000Z") => {
    const token = newToken();
    links.set(token, { donation_id, expires_at, consumed: false });
    return token;
  };

  return { core: double, cards, links, issueLink };
}

export type CoreDouble = ReturnType<typeof createCoreDouble>;
export type { Result };
