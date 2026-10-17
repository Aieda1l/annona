import { describe, expect, it } from "vitest";
import {
  AuditEvent,
  CLAIM_RESULT_CODES,
  ClaimResult,
  CourierProfile,
  DONATION_CARD_FIXTURES,
  DONATION_STATUSES,
  DonationCard,
  DonorProfile,
  DraftReadyView,
  MatchCandidate,
  MessagingIdentity,
  PolicyConfig,
  RecipientOrg,
  ReasonCode,
  ThreadMessage,
  TickReport,
  VerificationLinkView,
  draftReadyViewFixture,
  verificationLinkViewFixture,
} from "@/contracts";

// contracts-2 (CONTRACTS v0.5): typed profiles, TickReport, ThreadMessage, and one card per DonationStatus.

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const loc = { lat: 47.6, lng: -122.3, area_label: "South Lake Union", address_line: "1 Example St (synthetic)" };

describe("contracts-2 card fixtures", () => {
  it("has exactly one DonationCard per DonationStatus (11, incl. unmatched)", () => {
    const statuses = DONATION_CARD_FIXTURES.map((c) => c.status).sort();
    expect(statuses).toEqual([...DONATION_STATUSES].sort());
  });

  it("keeps needs_review first (existing tests index [0])", () => {
    expect(DONATION_CARD_FIXTURES[0]!.status).toBe("needs_review");
  });

  it("every card parses, ids are unique, and every card is synthetic", () => {
    const ids = DONATION_CARD_FIXTURES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of DONATION_CARD_FIXTURES) {
      expect(DonationCard.safeParse(c).success, c.status).toBe(true);
      expect(c.is_synthetic).toBe(true);
    }
  });

  const card = (s: string) => DONATION_CARD_FIXTURES.find((c) => c.status === s)!;

  it("each status fixture is internally consistent", () => {
    expect(card("draft").decision).toBeNull();
    expect(card("draft").verified_facts).toBeNull();
    expect(card("unmatched").decision?.reasons.map((r) => r.code)).toContain("NO_ELIGIBLE_MATCH");
    expect(card("unmatched").decision?.reasons.every((r) => r.severity === "dispatch")).toBe(true);
    expect(card("offered").active_offers.some((o) => o.status === "open")).toBe(true);
    expect(card("claimed").assignment).not.toBeNull();
    expect(card("collected").handoff.collected_at).not.toBeNull();
    expect(card("collected").handoff.delivered_at).toBeNull();
    expect(card("delivered").handoff.delivered_at).not.toBeNull();
    expect(card("rejected").decision?.outcome).toBe("rejected");
    expect(card("canceled").timeline.some((e) => e.type === "donation.canceled")).toBe(true);
    expect(card("expired").timeline.some((e) => e.type === "donation.expired")).toBe(true);
  });

  it("only the claimed/collected/delivered cards carry an assignment; handoff is always simulated", () => {
    for (const c of DONATION_CARD_FIXTURES) {
      expect(c.handoff.simulated).toBe(true);
      expect(c.assignment !== null).toBe(["claimed", "collected", "delivered"].includes(c.status));
    }
  });

  it("no fixture text claims safety, allergen freedom, certification or compliance", () => {
    const text = JSON.stringify(DONATION_CARD_FIXTURES);
    expect(text).not.toMatch(/\b(safe|allergen[- ]free|certified|compliant)\b/i);
  });
});

describe("contracts-2 view fixtures", () => {
  it("VerificationLinkView and DraftReadyView fixtures parse", () => {
    expect(VerificationLinkView.safeParse(verificationLinkViewFixture).success).toBe(true);
    expect(DraftReadyView.safeParse(draftReadyViewFixture).success).toBe(true);
  });
  it("the link view never carries a handle, offer, courier or address", () => {
    const text = JSON.stringify(verificationLinkViewFixture);
    expect(text).not.toMatch(/handle|offer|courier|address_line/i);
  });
});

describe("TickReport", () => {
  const ok = {
    at: "2026-10-17T23:00:00.000Z",
    expired_offers: 1,
    expired_donations: 0,
    offers_created: 2,
    offers_sent: 2,
    send_failures: 0,
  };
  it("parses the documented shape", () => expect(TickReport.safeParse(ok).success).toBe(true));
  it("rejects negatives, non-integers and unknown keys", () => {
    expect(TickReport.safeParse({ ...ok, offers_sent: -1 }).success).toBe(false);
    expect(TickReport.safeParse({ ...ok, offers_sent: 1.5 }).success).toBe(false);
    expect(TickReport.safeParse({ ...ok, extra: 1 }).success).toBe(false);
  });
});

describe("ThreadMessage (v0.5)", () => {
  const m = { id: U(1), direction: "outbound", text: "hello", purpose: "offer", created_at: "2026-10-17T23:00:00.000Z" };
  it("parses outbound with a purpose and inbound without one", () => {
    expect(ThreadMessage.safeParse(m).success).toBe(true);
    expect(ThreadMessage.safeParse({ ...m, direction: "inbound", purpose: null }).success).toBe(true);
  });
  it("rejects a handle field, bad direction and unknown purpose", () => {
    expect(ThreadMessage.safeParse({ ...m, handle: "x" }).success).toBe(false);
    expect(ThreadMessage.safeParse({ ...m, direction: "sideways" }).success).toBe(false);
    expect(ThreadMessage.safeParse({ ...m, purpose: "marketing" }).success).toBe(false);
  });
});

describe("profiles (CONTRACTS section 3.1)", () => {
  const donor = {
    id: U(11),
    display_name: "Rainier Catering (synthetic)",
    org_type: "caterer",
    licensed_food_establishment: true,
    approval_status: "approved",
    location: loc,
    is_synthetic: true,
  };
  const recipient = {
    id: U(21),
    display_name: "Eastlake Community Pantry (synthetic)",
    approval_status: "approved",
    location: loc,
    is_synthetic: true,
    registered_dfdo: true,
    serves_highly_susceptible_population: false,
    accepts_handling_modes: ["refrigerated"],
    excluded_allergens: ["peanuts"],
    capacity_servings_available: 60,
    receiving_closes_at: "2026-10-18T02:00:00.000Z",
  };
  const courier = {
    id: U(31),
    display_name: "Courier A (synthetic)",
    approval_status: "approved",
    location: loc,
    is_synthetic: true,
    affiliated_recipient_ids: [U(21)],
    capabilities: { cold_transport: true },
    available_until: "2026-10-18T02:00:00.000Z",
  };
  const identity = {
    id: U(41),
    actor_role: "courier",
    actor_id: U(31),
    provider: "fake",
    handle: "fake-handle-0001",
    status: "joined",
    provider_space_id: null,
    provider_sender_id: null,
    joined_at: "2026-10-17T22:00:00.000Z",
    opted_out_at: null,
  };

  it("parse the documented shapes", () => {
    expect(DonorProfile.safeParse(donor).success).toBe(true);
    expect(RecipientOrg.safeParse(recipient).success).toBe(true);
    expect(CourierProfile.safeParse(courier).success).toBe(true);
    expect(MessagingIdentity.safeParse(identity).success).toBe(true);
  });
  it("require is_synthetic: true and reject unknown keys", () => {
    expect(DonorProfile.safeParse({ ...donor, is_synthetic: false }).success).toBe(false);
    expect(RecipientOrg.safeParse({ ...recipient, certified: true }).success).toBe(false);
    expect(CourierProfile.safeParse({ ...courier, is_synthetic: false }).success).toBe(false);
  });
  it("reject out-of-range values", () => {
    expect(RecipientOrg.safeParse({ ...recipient, capacity_servings_available: -1 }).success).toBe(false);
    expect(DonorProfile.safeParse({ ...donor, approval_status: "maybe" }).success).toBe(false);
    expect(MessagingIdentity.safeParse({ ...identity, provider: "sms" }).success).toBe(false);
  });
});

describe("PolicyConfig and MatchCandidate (sections 3.12, 3.5)", () => {
  const policy = {
    policy_id: "annona-prototype-refrigerated",
    policy_version: "2026-10-17.1",
    allowed_handling_modes: ["refrigerated"],
    allowed_preparation_types: ["prepared_cold", "commercially_packaged"],
    require_temperature_log: true,
    min_pickup_lead_minutes: 15,
    response_window_seconds: 60,
    offer_wave_size: 1,
    handoff_buffer_minutes: 10,
    max_transit_minutes: 45,
    average_speed_kmh: 25,
    max_servings: 500,
    demo_accelerated: true,
  };
  const cand = {
    recipient_id: U(21),
    courier_id: U(31),
    eta_to_pickup_minutes: 5,
    transit_minutes: 12,
    estimated_pickup_at: "2026-10-17T23:06:00.000Z",
    estimated_dropoff_at: "2026-10-17T23:28:00.000Z",
    slack_minutes: 40,
    rank: 1,
  };
  it("parse the documented shapes", () => {
    expect(PolicyConfig.safeParse(policy).success).toBe(true);
    expect(MatchCandidate.safeParse(cand).success).toBe(true);
  });
  it("reject non-positive speed, rank 0 and unknown keys", () => {
    expect(PolicyConfig.safeParse({ ...policy, average_speed_kmh: 0 }).success).toBe(false);
    expect(MatchCandidate.safeParse({ ...cand, rank: 0 }).success).toBe(false);
    expect(MatchCandidate.safeParse({ ...cand, score: 1 }).success).toBe(false);
  });
  it("sanity: ReasonCode and AuditEvent are still exported", () => {
    expect(ReasonCode.safeParse("NO_ELIGIBLE_MATCH").success).toBe(true);
    expect(AuditEvent).toBeDefined();
  });
});

// Hardening from Dev 2's review of PR #10.
describe("review hardening: unknown can never be an accepted mode", () => {
  const recipient = {
    id: U(21),
    display_name: "Eastlake Community Pantry (synthetic)",
    approval_status: "approved",
    location: loc,
    is_synthetic: true,
    registered_dfdo: true,
    serves_highly_susceptible_population: false,
    accepts_handling_modes: ["refrigerated"],
    excluded_allergens: [],
    capacity_servings_available: 10,
    receiving_closes_at: "2026-10-18T02:00:00.000Z",
  };
  const policy = {
    policy_id: "p",
    policy_version: "1",
    allowed_handling_modes: ["refrigerated"],
    allowed_preparation_types: ["prepared_cold"],
    require_temperature_log: true,
    min_pickup_lead_minutes: 15,
    response_window_seconds: 60,
    offer_wave_size: 1,
    handoff_buffer_minutes: 10,
    max_transit_minutes: 45,
    average_speed_kmh: 25,
    max_servings: 500,
    demo_accelerated: true,
  };
  it("RecipientOrg.accepts_handling_modes rejects 'unknown' (M-02 must not pass unknown handling)", () => {
    expect(RecipientOrg.safeParse(recipient).success).toBe(true);
    expect(RecipientOrg.safeParse({ ...recipient, accepts_handling_modes: ["refrigerated", "unknown"] }).success).toBe(false);
  });
  it("PolicyConfig rejects 'unknown' in allowed handling modes and preparation types (G-02, G-03)", () => {
    expect(PolicyConfig.safeParse(policy).success).toBe(true);
    expect(PolicyConfig.safeParse({ ...policy, allowed_handling_modes: ["refrigerated", "unknown"] }).success).toBe(false);
    expect(PolicyConfig.safeParse({ ...policy, allowed_preparation_types: ["unknown"] }).success).toBe(false);
  });
});

describe("review hardening: small schema tightenings", () => {
  it("MessagingIdentity.actor_role is courier, donor or recipient only", () => {
    const identity = {
      id: U(41),
      actor_role: "courier",
      actor_id: U(31),
      provider: "fake",
      handle: "fake-handle-0001",
      status: "joined",
      provider_space_id: null,
      provider_sender_id: null,
      joined_at: null,
      opted_out_at: null,
    };
    expect(MessagingIdentity.safeParse(identity).success).toBe(true);
    expect(MessagingIdentity.safeParse({ ...identity, actor_role: "operator" }).success).toBe(false);
    expect(MessagingIdentity.safeParse({ ...identity, actor_role: "system" }).success).toBe(false);
  });
  it("MatchCandidate minutes cannot be negative (slack still can)", () => {
    const cand = {
      recipient_id: U(21),
      courier_id: U(31),
      eta_to_pickup_minutes: 5,
      transit_minutes: 12,
      estimated_pickup_at: "2026-10-17T23:06:00.000Z",
      estimated_dropoff_at: "2026-10-17T23:28:00.000Z",
      slack_minutes: -3,
      rank: 1,
    };
    expect(MatchCandidate.safeParse(cand).success).toBe(true);
    expect(MatchCandidate.safeParse({ ...cand, eta_to_pickup_minutes: -1 }).success).toBe(false);
    expect(MatchCandidate.safeParse({ ...cand, transit_minutes: -1 }).success).toBe(false);
  });
});

describe("review hardening: ClaimResult.assignment follows the code (section 3.9)", () => {
  const assignment = {
    donation_id: U(2),
    recipient: { display_name: "Eastlake Community Pantry (synthetic)", address_line: "2 Example Ave (synthetic)" },
    pickup: {
      display_name: "Rainier Catering (synthetic)",
      address_line: "1 Example St (synthetic)",
      pickup_instructions: "Side door (synthetic)",
      donor_pickup_by: "2026-10-18T01:30:00.000Z",
    },
  };
  const base = { offer_id: U(5), donation_id: U(2), donation_status: "claimed", message_for_actor: "msg" };
  it("claimed and already_claimed_by_you require an assignment", () => {
    expect(ClaimResult.safeParse({ ...base, code: "claimed", assignment }).success).toBe(true);
    expect(ClaimResult.safeParse({ ...base, code: "already_claimed_by_you", assignment }).success).toBe(true);
    expect(ClaimResult.safeParse({ ...base, code: "claimed", assignment: null }).success).toBe(false);
  });
  it("every other code must carry no assignment (no address disclosure)", () => {
    for (const code of CLAIM_RESULT_CODES.filter((c) => c !== "claimed" && c !== "already_claimed_by_you")) {
      expect(ClaimResult.safeParse({ ...base, code, assignment: null }).success, code).toBe(true);
      expect(ClaimResult.safeParse({ ...base, code, assignment }).success, code).toBe(false);
    }
  });
});

describe("review hardening: strictness and disclosure of fixtures", () => {
  it("DonationCard, VerificationLinkView and DraftReadyView reject unknown keys", () => {
    expect(DonationCard.safeParse({ ...DONATION_CARD_FIXTURES[0], safe: true }).success).toBe(false);
    expect(VerificationLinkView.safeParse({ ...verificationLinkViewFixture, courier: "x" }).success).toBe(false);
    expect(DraftReadyView.safeParse({ ...draftReadyViewFixture, handle: "x" }).success).toBe(false);
  });
  it("view fixtures also carry no safety wording", () => {
    const text = JSON.stringify([verificationLinkViewFixture, draftReadyViewFixture]);
    expect(text).not.toMatch(/\b(safe|allergen[- ]free|certified|compliant)\b/i);
  });
  it("card fixtures never contain a handle or address_line (pickup_instructions is operator-visible VerifiedFacts)", () => {
    expect(JSON.stringify(DONATION_CARD_FIXTURES)).not.toMatch(/"handle"|address_line/i);
  });
});
