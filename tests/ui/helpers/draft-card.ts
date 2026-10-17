import { eligibleCard, scene1_vision_suggestion, type DonationCard } from "@/contracts";

// A draft donation as the server returns it right after the photo is uploaded (no facts, no decision yet).
export const draftCardForTest: DonationCard = {
  ...eligibleCard,
  id: "00000000-0000-4000-8000-0000000000d4",
  status: "draft",
  version: 1,
  ai_status: "succeeded",
  ai_suggestion: scene1_vision_suggestion,
  verified_facts: null,
  edited_from_ai: [],
  decision: null,
  effective_cutoff_at: null,
};
