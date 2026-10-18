import { describe, expect, it } from "vitest";
import type { DraftReadyView, OfferMessageView } from "@/contracts";
import {
  askForCodeText,
  declineAckText,
  formatDraftReadyMessage,
  formatOfferMessage,
  helpText,
  intakeFailedText,
  alreadyJoinedText,
  joinAckText,
  stopAckText,
} from "@/workflows/templates";

// T-MS-05: deterministic message templates (CONTRACTS §3.10, prompt §5 step 4).
// 2026-10-18T01:12Z is 6:12 PM PDT; 2026-10-17T23:30Z is 4:30 PM PDT.

const offer: OfferMessageView = {
  short_code: "K7M3",
  dish_name: "Assorted sandwiches and wraps",
  servings: 24,
  allergens_present: ["wheat", "milk", "eggs"],
  cross_contact_status: "declared",
  cross_contact_allergens: [],
  handling_mode: "refrigerated",
  recipient_display_name: "Eastlake Community Pantry",
  pickup_area_label: "Capitol Hill",
  expires_at: "2026-10-18T01:12:00.000Z",
  demo_mode: true,
};

const draft: DraftReadyView = {
  ai_status: "succeeded",
  dish_guess: "Assorted sandwiches",
  possible_allergens: ["wheat", "milk"],
  link_url: "https://annona.example.invalid/v#TOKEN",
  link_expires_at: "2026-10-17T23:30:00.000Z",
  demo_mode: true,
};

const BANNED = /\b(safe|safely|safety|allergen-free|certified|compliant|verified)\b/i;

describe("T-MS-05 offer message", () => {
  it("renders the golden text", () => {
    expect(formatOfferMessage(offer)).toBe(
      [
        "Annona (automated assistant, DEMO): pickup offer K7M3.",
        "Assorted sandwiches and wraps, 24 servings. Needs cold transport.",
        "Contains (donor-declared): wheat, milk, eggs. Other major allergens: not in the donor's listed ingredients — not a guarantee. Cross-contact: none known to donor.",
        "For Eastlake Community Pantry. Pickup area: Capitol Hill.",
        "Reply YES K7M3 or NO K7M3 by 6:12 PM. Text STOP to opt out.",
      ].join("\n"),
    );
  });

  it("is byte-identical for identical input", () => {
    expect(formatOfferMessage({ ...offer })).toBe(formatOfferMessage({ ...offer }));
  });

  it("says 'none declared' when no allergen is declared", () => {
    expect(formatOfferMessage({ ...offer, allergens_present: [] })).toContain("Contains (donor-declared): none declared.");
  });

  it("uses readable allergen names and lists declared cross-contact", () => {
    const text = formatOfferMessage({
      ...offer,
      allergens_present: ["tree_nuts", "crustacean_shellfish"],
      cross_contact_allergens: ["peanuts", "sesame"],
    });
    expect(text).toContain("Contains (donor-declared): tree nuts, crustacean shellfish.");
    expect(text).toContain("Cross-contact: peanuts, sesame.");
  });

  it("never reports unknown cross-contact as 'none known'", () => {
    const text = formatOfferMessage({ ...offer, cross_contact_status: "unknown" });
    expect(text).toContain("Cross-contact: unknown.");
    expect(text).not.toContain("none known to donor");
  });

  it("drops DEMO when the view is not in demo mode", () => {
    const text = formatOfferMessage({ ...offer, demo_mode: false });
    expect(text.split("\n")[0]).toBe("Annona (automated assistant): pickup offer K7M3.");
  });

  it("renders the deadline in America/Los_Angeles, not the server timezone", () => {
    expect(formatOfferMessage({ ...offer, expires_at: "2026-10-18T19:05:00.000Z" })).toContain("by 12:05 PM.");
  });

  it("labels a non-refrigerated handling mode instead of claiming cold transport", () => {
    const text = formatOfferMessage({ ...offer, handling_mode: "hot_held" });
    expect(text).toContain("Handling: hot held.");
    expect(text).not.toContain("Needs cold transport");
  });

  it("uses the singular for one serving", () => {
    expect(formatOfferMessage({ ...offer, servings: 1 })).toContain(", 1 serving.");
  });

  it("uses no forbidden claim words", () => {
    expect(formatOfferMessage(offer)).not.toMatch(BANNED);
  });
});

describe("T-MS-05 draft-ready message", () => {
  it("presents the AI output as a guess to confirm, with possible allergens and the link", () => {
    const text = formatDraftReadyMessage(draft);
    expect(text).toContain("Annona (automated assistant, DEMO)");
    expect(text).toContain("AI guess");
    expect(text).toContain("Assorted sandwiches");
    expect(text).toContain("Possible allergens: wheat, milk");
    expect(text).toContain("https://annona.example.invalid/v#TOKEN");
    expect(text).toContain("4:30 PM");
    expect(text).toMatch(/confirm/i);
  });

  it("does not imply allergen-free when the AI suggests none", () => {
    const text = formatDraftReadyMessage({ ...draft, possible_allergens: [] });
    expect(text).toContain("check all nine major allergens yourself");
    expect(text).not.toMatch(BANNED);
  });

  it("says the photo could not be analyzed and still gives the link when the AI failed", () => {
    const text = formatDraftReadyMessage({ ...draft, ai_status: "failed", dish_guess: null, possible_allergens: [] });
    expect(text).toContain("couldn't analyze");
    expect(text).toContain("https://annona.example.invalid/v#TOKEN");
    expect(text).not.toContain("AI guess:");
  });

  it("is byte-identical for identical input and uses no forbidden claim words", () => {
    expect(formatDraftReadyMessage({ ...draft })).toBe(formatDraftReadyMessage({ ...draft }));
    expect(formatDraftReadyMessage(draft)).not.toMatch(BANNED);
  });
});

describe("T-MS-05 fixed replies", () => {
  it("join_ack discloses the automated assistant and tells the user how to opt out", () => {
    expect(joinAckText()).toMatch(/automated assistant/i);
    expect(joinAckText()).toContain("Text STOP");
  });

  it("the already-joined reply says so, still discloses the automated assistant and tells the user how to opt out", () => {
    expect(alreadyJoinedText()).toMatch(/already opted in/i);
    expect(alreadyJoinedText()).toMatch(/automated assistant/i);
    expect(alreadyJoinedText()).toContain("Text STOP");
    expect(alreadyJoinedText()).not.toMatch(BANNED);
  });

  it("stop_ack confirms opt-out and offers JOIN to return", () => {
    expect(stopAckText()).toContain("opted out");
    expect(stopAckText()).toContain("JOIN");
  });

  it("help lists the commands", () => {
    for (const word of ["YES", "NO", "STOP", "JOIN"]) expect(helpText()).toContain(word);
  });

  it("decline_ack, intake_failed and ask-for-code are present", () => {
    expect(declineAckText()).toContain("declined");
    expect(intakeFailedText()).toContain("photo");
    expect(askForCodeText()).toContain("code");
  });

  it("no fixed reply uses a forbidden claim word", () => {
    for (const text of [joinAckText(), stopAckText(), helpText(), declineAckText(), intakeFailedText(), askForCodeText()]) {
      expect(text).not.toMatch(BANNED);
    }
  });
});
