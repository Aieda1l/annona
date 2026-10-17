import type { DraftReadyView, VerificationLinkView } from "../entities";
import { draftCard } from "./donation-cards";
import { scene1_vision_suggestion } from "./scenes";

// contracts-2 view fixtures (CONTRACTS section 3.10 DraftReadyView, section 3.16 VerificationLinkView). Synthetic only.
// The link view never carries a handle, offer, courier or address. The token below is an obvious placeholder.

export const verificationLinkViewFixture: VerificationLinkView = {
  donation_id: draftCard.id,
  donor_display_name: draftCard.donor_display_name,
  status: "draft",
  ai_status: "succeeded",
  ai_suggestion: scene1_vision_suggestion,
  verified_facts: null,
  decision: null,
  link_expires_at: "2026-10-17T23:40:00.000Z",
  resubmit_token: null,
  is_synthetic: true,
};

export const draftReadyViewFixture: DraftReadyView = {
  ai_status: "succeeded",
  dish_guess: "assorted deli sandwiches and wraps",
  possible_allergens: ["wheat", "milk", "eggs"],
  link_url: "https://demo.example.invalid/v#EXAMPLE_TOKEN",
  link_expires_at: "2026-10-17T23:40:00.000Z",
  demo_mode: true,
};
