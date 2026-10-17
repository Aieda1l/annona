import { describe, expect, it, vi } from "vitest";
import type {
  Assignment,
  ClaimResult,
  DeclineResult,
  InboundMessage,
  MessagingIdentityStatus,
  OutboundMessage,
  SendResult,
} from "@/contracts";
import { createFakeGateway } from "@/integrations/photon/gateway-fake";
import { createInboundHandler } from "@/workflows/inbound";
import { createCoreDouble } from "./doubles/core";

// T-MS-02 (parse and delegate), T-MS-03 (duplicates), T-MS-04 (unknown sender), T-MS-15 (JOIN/STOP semantics).
// Handles are synthetic @example.invalid emails (ARCHITECTURE §9).

const IDENTITY_ID = "b0000000-0000-4000-8000-000000000001";
const ACTOR_ID = "a0000000-0000-4000-8000-000000000001";
const HANDLE = "courier@example.invalid";

const assignment: Assignment = {
  donation_id: "d0000000-0000-4000-8000-000000000001",
  recipient: { display_name: "Eastlake Community Pantry", address_line: "1 Synthetic Way" },
  pickup: {
    display_name: "Rainier Catering",
    address_line: "2 Fixture Ave",
    pickup_instructions: "Back door, ask for Sam",
    donor_pickup_by: "2026-10-18T02:00:00.000Z",
  },
};

const claim = (over: Partial<ClaimResult>): ClaimResult => ({
  code: "claimed",
  offer_id: "e0000000-0000-4000-8000-000000000001",
  donation_id: assignment.donation_id,
  donation_status: "claimed",
  assignment: null,
  message_for_actor: "Claimed.",
  ...over,
});

const decline = (over: Partial<DeclineResult>): DeclineResult => ({
  code: "declined",
  offer_id: "e0000000-0000-4000-8000-000000000001",
  donation_id: assignment.donation_id,
  donation_status: "eligible",
  assignment: null,
  message_for_actor: "Declined.",
  ...over,
});

const inbound = (text: string | null, over: Partial<InboundMessage> = {}): InboundMessage => ({
  provider: "photon",
  provider_message_id: "pho_msg_1",
  provider_event_id: null,
  received_at: "2026-10-17T21:00:00.000Z",
  sender_handle: HANDLE,
  provider_space_id: "pho_spc_1",
  provider_line_sender_id: "pho_usr_line",
  text,
  attachments: [],
  ...over,
});

function setup(
  status: MessagingIdentityStatus | null = "joined",
  provider: "photon" | "fake" = "photon",
  photo?: Parameters<typeof createInboundHandler>[0]["photo"],
) {
  const double = createCoreDouble();
  if (status) double.seedIdentity({ id: IDENTITY_ID, handle: HANDLE, actor_id: ACTOR_ID, status, provider });
  const sent: OutboundMessage[] = [];
  const base = createFakeGateway();
  const gateway = {
    ...base,
    async send(m: OutboundMessage): Promise<SendResult> {
      sent.push(m);
      return base.send(m);
    },
  };
  return { double, sent, handle: createInboundHandler({ core: double.core, gateway, photo }) };
}

describe("T-MS-02 accept and decline", () => {
  it("claims by short code with the identity's actor and the message id as the event id", async () => {
    const { double, handle } = setup();
    double.scripted.claim = claim({ code: "claimed", assignment });
    const result = await handle(inbound("yes k7m3"));
    expect(double.calls.claims).toEqual([
      {
        offer_ref: { short_code: "K7M3" },
        actor: { role: "courier", id: ACTOR_ID },
        source: "messaging",
        source_event_id: "pho_msg_1",
      },
    ]);
    expect(result).toMatchObject({ outcome: "processed", command: "accept" });
  });

  it("uses the simulated source for fake-provider messages", async () => {
    const { double, handle } = setup("joined", "fake");
    await handle(inbound("YES K7M3", { provider: "fake" }));
    expect(double.calls.claims[0]?.source).toBe("simulated_messaging");
  });

  it("replies once with pickup and recipient addresses only when the claim succeeded", async () => {
    const { double, sent, handle } = setup();
    double.scripted.claim = claim({ code: "claimed", assignment });
    await handle(inbound("YES K7M3"));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to_identity_id: IDENTITY_ID,
      purpose: "claim_result",
      idempotency_key: "reply:pho_msg_1:v1",
    });
    for (const text of ["Claimed.", "2 Fixture Ave", "Back door, ask for Sam", "1 Synthetic Way", "7:00 PM"]) {
      expect(sent[0]?.text).toContain(text);
    }
  });

  it("gives a courier who already holds the claim the same pickup details", async () => {
    const { double, sent, handle } = setup();
    double.scripted.claim = claim({ code: "already_claimed_by_you", assignment });
    await handle(inbound("YES K7M3"));
    expect(sent[0]?.text).toContain("2 Fixture Ave");
  });

  it.each(["already_claimed", "offer_expired", "offer_closed", "donation_unavailable", "ineligible"] as const)(
    "tells the courier no assignment was made for %s, and never leaks an address",
    async (code) => {
      const { double, sent, handle } = setup();
      // Core should send assignment: null here; the reply must stay safe even if it did not.
      double.scripted.claim = claim({ code, assignment, message_for_actor: "No assignment was made." });
      const result = await handle(inbound("YES K7M3"));
      expect(result.outcome).toBe("processed");
      expect(sent[0]?.text).toContain("No assignment was made.");
      expect(sent[0]?.text).not.toContain("Fixture Ave");
      expect(sent[0]?.text).not.toContain("Synthetic Way");
    },
  );

  it.each(["not_authorized", "offer_not_found"] as const)("rejects %s with generic text and no offer details", async (code) => {
    const { double, sent, handle } = setup();
    double.scripted.claim = claim({ code, message_for_actor: "Offer belongs to Rainier Catering" });
    const result = await handle(inbound("YES K7M3"));
    expect(result.outcome).toBe("rejected");
    expect(sent).toHaveLength(1);
    expect(sent[0]?.text).not.toContain("Rainier");
    expect(sent[0]?.text).toContain("No assignment was made");
  });

  it("uses the courier's single open offer when no code is given", async () => {
    const { double, handle } = setup();
    double.seedOpenOffers(ACTOR_ID, ["e0000000-0000-4000-8000-0000000000aa"]);
    await handle(inbound("YES"));
    expect(double.calls.claims[0]?.offer_ref).toEqual({ offer_id: "e0000000-0000-4000-8000-0000000000aa" });
  });

  it.each([[[]], [["e0000000-0000-4000-8000-0000000000aa", "e0000000-0000-4000-8000-0000000000bb"]]])(
    "asks for the code instead of guessing when the courier has %j open offers",
    async (offers) => {
      const { double, sent, handle } = setup();
      double.seedOpenOffers(ACTOR_ID, offers);
      await handle(inbound("YES"));
      expect(double.calls.claims).toHaveLength(0);
      expect(sent).toHaveLength(1);
      expect(sent[0]?.text).toContain("code");
    },
  );

  it("treats an invalid code as no code", async () => {
    const { double, handle } = setup();
    double.seedOpenOffers(ACTOR_ID, ["e0000000-0000-4000-8000-0000000000aa"]);
    await handle(inbound("YES B2B2"));
    expect(double.calls.claims[0]?.offer_ref).toEqual({ offer_id: "e0000000-0000-4000-8000-0000000000aa" });
  });

  it("declines by short code and acknowledges", async () => {
    const { double, sent, handle } = setup();
    double.scripted.decline = decline({ code: "declined" });
    const result = await handle(inbound("no h4m9"));
    expect(double.calls.declines[0]?.offer_ref).toEqual({ short_code: "H4M9" });
    expect(result).toMatchObject({ outcome: "processed", command: "decline" });
    expect(sent[0]).toMatchObject({ purpose: "decline_ack" });
    expect(sent[0]?.text).toContain("declined");
  });

  it("answers an expired decline with the no-assignment text", async () => {
    const { double, sent, handle } = setup();
    double.scripted.decline = decline({ code: "offer_expired", message_for_actor: "That offer expired. No assignment was made." });
    await handle(inbound("NO H4M9"));
    expect(sent[0]?.text).toContain("expired");
  });
});

describe("T-MS-03 duplicates", () => {
  it("processes a repeated provider_message_id once", async () => {
    const { double, sent, handle } = setup();
    double.scripted.claim = claim({ code: "claimed", assignment });
    const first = await handle(inbound("YES K7M3"));
    const again = await handle(inbound("YES K7M3"));
    expect(first.outcome).toBe("processed");
    expect(again).toMatchObject({ outcome: "duplicate", command: "accept", reply: null });
    expect(double.calls.claims).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it("returns a safe duplicate result when the first delivery has not finished", async () => {
    const { double, sent, handle } = setup();
    await double.core.recordInboundMessage("photon", "pho_msg_1", {});
    expect(await handle(inbound("YES K7M3"))).toEqual({ outcome: "duplicate", command: "unknown", reply: null });
    expect(double.calls.claims).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("records the inbound message before anything else", async () => {
    const { double, handle } = setup();
    await handle(inbound("HELP"));
    expect(double.calls.order[0]).toBe("recordInboundMessage");
  });

  it("skips the send when this message's reply was already recorded, and still saves the result", async () => {
    const { double, sent, handle } = setup();
    double.calls.outbound.push({
      message: { to_identity_id: IDENTITY_ID, text: "x", purpose: "help", correlation: {}, idempotency_key: "reply:pho_msg_1:v1" },
      provider_message_id: "fake_reply:pho_msg_1:v1",
    });
    await handle(inbound("HELP"));
    expect(sent).toHaveLength(0);
    expect(double.calls.saved).toHaveLength(1);
  });
});

describe("T-MS-04 unknown and non-joined senders", () => {
  it("ignores an unknown sender: no reply, no claim, no identity, masked log row", async () => {
    const { double, sent, handle } = setup(null);
    const result = await handle(inbound("YES K7M3", { sender_handle: "stranger@example.invalid" }));
    expect(result).toEqual({ outcome: "ignored", command: "accept", reply: null });
    expect(double.calls.claims).toHaveLength(0);
    expect(sent).toHaveLength(0);
    expect(double.calls.ignored).toEqual([
      { provider: "photon", provider_message_id: "pho_msg_1", reason: "unknown_sender", handle_masked: "…alid" },
    ]);
    expect(JSON.stringify(double.calls.ignored)).not.toContain("stranger");
  });

  it.each(["awaiting_join", "opted_out"] as const)(
    "rejects anything but JOIN from a %s identity, silently",
    async (status) => {
      const { double, sent, handle } = setup(status);
      for (const [i, text] of ["YES K7M3", "NO K7M3", "STOP", "HELP", "hello"].entries()) {
        const result = await handle(inbound(text, { provider_message_id: `pho_msg_${i}` }));
        expect(result).toMatchObject({ outcome: "rejected", reply: null });
      }
      expect(double.calls.claims).toHaveLength(0);
      expect(double.calls.optOuts).toHaveLength(0);
      expect(sent).toHaveLength(0);
      expect(double.calls.ignored.every((row) => row.reason === "not_joined")).toBe(true);
    },
  );

  it("saves the result of every message it handles", async () => {
    const { double, handle } = setup(null);
    await handle(inbound("hi", { sender_handle: "stranger@example.invalid" }));
    expect(double.calls.saved).toHaveLength(1);
  });
});

describe("T-MS-15 JOIN, STOP and help", () => {
  it.each(["awaiting_join", "opted_out", "joined"] as const)("JOIN from a %s identity joins and acknowledges", async (status) => {
    const { double, sent, handle } = setup(status);
    const result = await handle(inbound("JOIN"));
    expect(double.calls.joins).toEqual([
      { identity_id: IDENTITY_ID, provider_space_id: "pho_spc_1", provider_sender_id: "pho_usr_line" },
    ]);
    expect(result).toMatchObject({ outcome: "processed", command: "join" });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ purpose: "join_ack", to_identity_id: IDENTITY_ID });
    expect(sent[0]?.text).toMatch(/automated assistant/i);
    expect(sent[0]?.text).toContain("STOP");
  });

  it("STOP opts out through core and sends only stop_ack", async () => {
    const { double, sent, handle } = setup();
    const result = await handle(inbound("STOP"));
    expect(double.calls.optOuts).toEqual([IDENTITY_ID]);
    expect(result).toMatchObject({ outcome: "processed", command: "stop" });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ purpose: "stop_ack" });
    expect(double.identity(IDENTITY_ID)?.status).toBe("opted_out");
  });

  it("opts a courier out when STOP is inside a short sentence (D-039)", async () => {
    const { double, sent, handle } = setup();
    const result = await handle(inbound("please stop messaging me"));
    expect(double.calls.optOuts).toEqual([IDENTITY_ID]);
    expect(result).toMatchObject({ outcome: "processed", command: "stop" });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ purpose: "stop_ack" });
  });

  it.each(["Running late, will stop by at 5", "can you cancel the other offer", "end of day, 20 portions"])(
    "does not opt a courier out for ordinary phrasing: %j (D-039)",
    async (text) => {
      const { double, sent, handle } = setup();
      const result = await handle(inbound(text));
      expect(double.calls.optOuts).toEqual([]);
      expect(result).toMatchObject({ outcome: "processed", command: "unknown" });
      expect(sent[0]).toMatchObject({ purpose: "help" });
      expect(double.identity(IDENTITY_ID)?.status).toBe("joined");
    },
  );

  it("does not send stop_ack when core failed to opt the identity out; the error propagates so the delivery is retried", async () => {
    const { double, sent, handle } = setup();
    double.failures.optOut = true;
    await expect(handle(inbound("STOP"))).rejects.toThrow(/opt/i);
    expect(sent).toHaveLength(0);
    expect(double.calls.saved).toHaveLength(0);
  });

  it("does not acknowledge a JOIN that core failed to apply", async () => {
    const { double, sent, handle } = setup("awaiting_join");
    double.failures.join = true;
    await expect(handle(inbound("JOIN"))).rejects.toThrow(/join/i);
    expect(sent).toHaveLength(0);
  });

  it("a later JOIN brings an opted-out identity back", async () => {
    const { double, handle } = setup();
    await handle(inbound("STOP", { provider_message_id: "pho_msg_1" }));
    await handle(inbound("JOIN", { provider_message_id: "pho_msg_2" }));
    expect(double.identity(IDENTITY_ID)?.status).toBe("joined");
  });

  it.each(["HELP", "what is this?"])("%s gets the help text", async (text) => {
    const { sent, handle } = setup();
    const result = await handle(inbound(text));
    expect(result).toMatchObject({ outcome: "processed" });
    expect(result.command).toBe(text === "HELP" ? "help" : "unknown");
    expect(sent[0]).toMatchObject({ purpose: "help" });
    expect(sent[0]?.text).toContain("YES");
  });

  const image = [{ kind: "image" as const, provider_attachment_id: "pho_att_1", mime: null }];

  it("treats an image from a courier as unknown and sends the help text", async () => {
    const { double, sent, handle } = setup();
    const result = await handle(inbound(null, { attachments: image }));
    expect(result).toMatchObject({ outcome: "processed", command: "unknown" });
    expect(sent[0]).toMatchObject({ purpose: "help" });
    expect(double.calls.claims).toHaveLength(0);
  });

  it("does not handle a joined donor's photo yet (photo intake lands in slice 2, T-MS-18)", async () => {
    const { double, sent, handle } = setup();
    double.seedIdentity({ id: IDENTITY_ID, handle: HANDLE, actor_id: ACTOR_ID, actor_role: "donor" });
    const result = await handle(inbound(null, { attachments: image }));
    expect(result).toEqual({ outcome: "ignored", command: "photo", reply: null });
    expect(sent).toHaveLength(0);
  });
});

describe("T-MS-18 photo routing", () => {
  const image = [{ kind: "image" as const, provider_attachment_id: "pho_att_1", mime: null }];
  const asDonor = (double: ReturnType<typeof setup>["double"], status: MessagingIdentityStatus = "joined") =>
    double.seedIdentity({ id: IDENTITY_ID, handle: HANDLE, actor_id: ACTOR_ID, actor_role: "donor", status });

  it("hands a joined donor's photo to the photo handler and sends the reply it plans", async () => {
    const photo = vi.fn(async () => ({ purpose: "draft_ready" as const, text: "AI guess ... link", idempotency_key: "draft_ready:d1:v1" }));
    const { double, sent, handle } = setup("joined", "photon", photo);
    asDonor(double);
    const result = await handle(inbound(null, { attachments: image }));
    expect(photo).toHaveBeenCalledTimes(1);
    expect((photo.mock.calls[0] as unknown[])[0]).toMatchObject({ id: IDENTITY_ID, actor_role: "donor" });
    expect(result).toMatchObject({ outcome: "processed", command: "photo" });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to_identity_id: IDENTITY_ID,
      purpose: "draft_ready",
      text: "AI guess ... link",
      idempotency_key: "draft_ready:d1:v1",
    });
  });

  it("sends the intake_failed reply the photo handler plans", async () => {
    const photo = vi.fn(async () => ({ purpose: "intake_failed" as const, text: "couldn't use that photo", idempotency_key: "reply:pho_msg_1:v1" }));
    const { double, sent, handle } = setup("joined", "photon", photo);
    asDonor(double);
    await handle(inbound(null, { attachments: image }));
    expect(sent[0]).toMatchObject({ purpose: "intake_failed", idempotency_key: "reply:pho_msg_1:v1" });
  });

  it("sends nothing when the photo handler says this draft was already announced", async () => {
    const photo = vi.fn(async () => null);
    const { double, sent, handle } = setup("joined", "photon", photo);
    asDonor(double);
    expect(await handle(inbound(null, { attachments: image }))).toEqual({ outcome: "processed", command: "photo", reply: null });
    expect(sent).toHaveLength(0);
  });

  it("never downloads or drafts for an unknown sender", async () => {
    const photo = vi.fn(async () => null);
    const { double, sent, handle } = setup(null, "photon", photo);
    const result = await handle(inbound(null, { attachments: image, sender_handle: "stranger@example.invalid" }));
    expect(result).toMatchObject({ outcome: "ignored", reply: null });
    expect(photo).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
    expect(double.calls.ignored).toHaveLength(1);
  });

  it.each(["awaiting_join", "opted_out"] as const)("never downloads or drafts for a %s donor", async (status) => {
    const photo = vi.fn(async () => null);
    const { double, sent, handle } = setup(status, "photon", photo);
    asDonor(double, status);
    const result = await handle(inbound(null, { attachments: image }));
    expect(result).toMatchObject({ outcome: "rejected", reply: null });
    expect(photo).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });

  it("treats a courier's image as unknown and does not call the photo handler", async () => {
    const photo = vi.fn(async () => null);
    const { sent, handle } = setup("joined", "photon", photo);
    const result = await handle(inbound(null, { attachments: image }));
    expect(result).toMatchObject({ outcome: "processed", command: "unknown" });
    expect(photo).not.toHaveBeenCalled();
    expect(sent[0]).toMatchObject({ purpose: "help" });
  });

  it("lets a photo failure propagate so the delivery is retried, saving no result and sending nothing", async () => {
    const photo = vi.fn(async () => {
      throw new Error("createDraftFromImage failed: INTERNAL");
    });
    const { double, sent, handle } = setup("joined", "photon", photo);
    asDonor(double);
    await expect(handle(inbound(null, { attachments: image }))).rejects.toThrow(/INTERNAL/);
    expect(sent).toHaveLength(0);
    expect(double.calls.saved).toHaveLength(0);
  });
});
