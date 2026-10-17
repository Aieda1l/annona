import { describe, expect, it } from "vitest";
import * as C from "@/contracts";
import {
  DEMO_ACTORS,
  DEMO_SCENES,
  DONATION_CARD_FIXTURES,
  DonationCard,
  VerifiedFacts,
  VisionModelOutput,
  VisionSuggestion,
  scene1_eligible_facts,
  scene1_vision_suggestion,
} from "@/contracts";

// T-CT-01: contract Zod schemas vs typed fixtures and enum values (CONTRACTS §2, §3).

describe("T-CT-01 fixtures parse", () => {
  it("every DonationCard fixture parses", () => {
    for (const card of DONATION_CARD_FIXTURES) expect(DonationCard.safeParse(card).success).toBe(true);
  });

  it("every scene's suggestion and facts parse", () => {
    for (const s of DEMO_SCENES) {
      expect(VisionSuggestion.safeParse(s.suggestion).success).toBe(true);
      expect(VerifiedFacts.safeParse(s.facts).success).toBe(true);
    }
  });

  it("DEMO_ACTORS ids are unique UUIDs and carry no handle field", () => {
    const ids = DEMO_ACTORS.map((a) => a.actor_id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of DEMO_ACTORS) {
      expect(C.UtcString).toBeDefined();
      expect(a.actor_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(Object.keys(a).sort()).toEqual(["actor_id", "display_name", "key", "role"]);
      expect(a.display_name).toMatch(/synthetic/);
    }
  });

  it("no fixture, scene or actor name contains 'safe'", () => {
    const names = [
      ...Object.keys(C).filter((k) => /scene|card|fixture|actor/i.test(k)),
      ...DEMO_SCENES.flatMap((s) => [s.id, s.title]),
      ...DEMO_ACTORS.flatMap((a) => [a.key, a.display_name]),
    ];
    for (const n of names) expect(n.toLowerCase()).not.toContain("safe");
  });
});

describe("T-CT-01 violations are rejected", () => {
  it("VisionSuggestion rejects ingredients_verified: true and handling_verified: true", () => {
    expect(VisionSuggestion.safeParse({ ...scene1_vision_suggestion, ingredients_verified: true }).success).toBe(false);
    expect(VisionSuggestion.safeParse({ ...scene1_vision_suggestion, handling_verified: true }).success).toBe(false);
    expect(VisionSuggestion.safeParse({ ...scene1_vision_suggestion, requires_donor_confirmation: false }).success).toBe(false);
  });

  it("VisionSuggestion rejects unknown keys (safe, allergen_free)", () => {
    expect(VisionSuggestion.safeParse({ ...scene1_vision_suggestion, safe: true }).success).toBe(false);
    expect(VisionSuggestion.safeParse({ ...scene1_vision_suggestion, allergen_free: true }).success).toBe(false);
  });

  it("VerifiedFacts rejects unknown keys, a missing allergen key and a missing required key", () => {
    expect(VerifiedFacts.safeParse({ ...scene1_eligible_facts, safe: true }).success).toBe(false);
    expect(VerifiedFacts.safeParse({ ...scene1_eligible_facts, allergen_free: true }).success).toBe(false);
    const { sesame: _s, ...eight } = scene1_eligible_facts.allergens;
    expect(VerifiedFacts.safeParse({ ...scene1_eligible_facts, allergens: eight }).success).toBe(false);
    const { description: _d, ...noDescription } = scene1_eligible_facts;
    expect(VerifiedFacts.safeParse(noDescription).success).toBe(false);
  });

  it("VerifiedFacts rejects attested: false and cross-contact allergens without a declaration", () => {
    const bad = { ...scene1_eligible_facts, attestation: { ...scene1_eligible_facts.attestation, attested: false } };
    expect(VerifiedFacts.safeParse(bad).success).toBe(false);
    const undeclared = { ...scene1_eligible_facts, cross_contact_status: "unknown", cross_contact_allergens: ["sesame"] };
    expect(VerifiedFacts.safeParse(undeclared).success).toBe(false);
  });

  it("VerifiedFacts rejects a UTC string without Z", () => {
    expect(VerifiedFacts.safeParse({ ...scene1_eligible_facts, donor_pickup_by: "2026-10-18T01:30:00.000+02:00" }).success).toBe(false);
  });

  it("VisionModelOutput accepts the model subset and rejects any provenance key", () => {
    const { prompt_id, prompt_version, provider, model, mode, ...modelOnly } = scene1_vision_suggestion;
    void [prompt_id, prompt_version, provider, model, mode];
    expect(VisionModelOutput.safeParse(modelOnly).success).toBe(true);
    for (const key of ["prompt_id", "prompt_version", "provider", "model", "mode"]) {
      expect(VisionModelOutput.safeParse({ ...modelOnly, [key]: "x" }).success).toBe(false);
    }
  });

  it("DonationCard rejects simulated: false and is_synthetic: false", () => {
    const card = DONATION_CARD_FIXTURES[0];
    expect(DonationCard.safeParse({ ...card, is_synthetic: false }).success).toBe(false);
    expect(DonationCard.safeParse({ ...card, handoff: { ...card.handoff, simulated: false } }).success).toBe(false);
  });
});

// Lists copied from docs/CONTRACTS.md §2 (exact strings).
describe("T-CT-01 enums match CONTRACTS §2", () => {
  const expected: Record<string, readonly string[]> = {
    ALLERGENS: ["milk", "eggs", "fish", "crustacean_shellfish", "tree_nuts", "peanuts", "wheat", "soybeans", "sesame"],
    DONOR_ALLERGEN_STATUSES: ["present", "not_in_listed_ingredients", "unknown"],
    CROSS_CONTACT_STATUSES: ["declared", "unknown"],
    HANDLING_MODES: ["refrigerated", "hot_held", "ambient", "frozen", "unknown"],
    PREPARATION_TYPES: ["prepared_cold", "commercially_packaged", "cooked_then_cooled", "other", "unknown"],
    YES_NO_UNKNOWN: ["yes", "no", "unknown"],
    FIELD_STATES: ["suggested", "donor_verified", "unknown", "needs_review", "rejected"],
    DONATION_STATUSES: ["draft", "needs_review", "eligible", "unmatched", "offered", "claimed", "collected", "delivered", "rejected", "canceled", "expired"],
    OFFER_STATUSES: ["pending_send", "open", "accepted", "declined", "expired", "superseded", "send_failed", "canceled"],
    DELIVERY_STATUSES: ["unknown", "accepted", "delivered", "failed"],
    ELIGIBILITY_OUTCOMES: ["eligible", "needs_review", "rejected"],
    REASON_SEVERITIES: ["review", "reject", "dispatch"],
    AI_STATUSES: ["pending", "succeeded", "failed", "skipped"],
    IMAGE_QUALITIES: ["usable", "poor", "not_food"],
    CONFIDENCES: ["low", "medium", "high"],
    ACTOR_ROLES: ["donor", "recipient", "courier", "operator", "system"],
    PROVIDER_MODES: ["real", "fake"],
    STORE_KINDS: ["pglite", "postgres"],
    MESSAGING_IDENTITY_STATUSES: ["awaiting_join", "joined", "opted_out"],
    CLAIM_RESULT_CODES: ["claimed", "already_claimed_by_you", "already_claimed", "offer_expired", "offer_closed", "donation_unavailable", "not_authorized", "offer_not_found", "ineligible"],
    DECLINE_RESULT_CODES: ["declined", "already_declined", "offer_expired", "offer_closed", "not_authorized", "offer_not_found"],
    INBOUND_OUTCOMES: ["processed", "duplicate", "ignored", "rejected"],
    HANDOFF_STEPS: ["collected", "delivered"],
    OPERATOR_ACTIONS: ["reject", "cancel", "return_to_donor", "retry_matching"],
    MESSAGE_PURPOSES: ["offer", "claim_result", "decline_ack", "offer_closed", "join_ack", "stop_ack", "draft_ready", "intake_failed", "donor_update", "recipient_update", "help"],
    INBOUND_IGNORE_REASONS: ["unknown_sender", "not_joined"],
    ERROR_CODES: ["VALIDATION_FAILED", "NOT_FOUND", "NOT_AUTHORIZED", "INVALID_TRANSITION", "CONFLICT", "AI_OUTPUT_INVALID", "PROVIDER_UNAVAILABLE", "RATE_LIMITED", "DUPLICATE_EVENT", "NOT_IMPLEMENTED", "INTERNAL"],
  };

  for (const [name, values] of Object.entries(expected)) {
    it(`${name} deep-equals the CONTRACTS §2 list`, () => {
      expect([...(C as unknown as Record<string, readonly string[]>)[name]]).toEqual([...values]);
    });
  }

  it("ReasonCode catalogue has the §2.1 severities, including dispatch and the new STOP/no-show codes", () => {
    const s = C.REASON_CODE_SEVERITY;
    expect(Object.keys(s)).toHaveLength(29);
    expect(s.NO_ELIGIBLE_MATCH).toBe("dispatch");
    expect(s.CANDIDATES_EXHAUSTED).toBe("dispatch");
    expect(s.COURIER_OPTED_OUT).toBe("dispatch");
    expect(s.COURIER_OPTED_OUT_AFTER_PICKUP).toBe("review");
    expect(s.PICKUP_NOT_COLLECTED).toBe("reject");
    expect(C.INBOUND_REPROCESS_AFTER_SECONDS).toBe(30);
  });
});
