// The recipient pantry is told once when a courier claims a pickup for it (purpose `recipient_update`). The text has no
// address or contact details, a repeated or late YES never sends a second notice, and a missing or un-joined
// recipient identity never blocks or undoes the claim.
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACTORS, type Deps, type InboundMessage } from "@/contracts";
import { inbound_messages, messaging_identities, offers, outbound_messages, provider_status_events } from "@/db/schema";
import { resolveHandles, SEED_IDENTITY_IDS } from "@/db/seed/seed";
import { createFakeGateway } from "@/integrations/photon/gateway-fake";
import { dispatchDonation, handleInbound } from "@/workflows";
import { formatRecipientNotice } from "@/workflows/templates";
import { IDENTITY, at, joinIdentityNow, makeEligibleDonation, makeWorld, resetWorld, type World } from "../core/helpers/world";

const RECIPIENT_IDENTITY = SEED_IDENTITY_IDS.recipient;
const RECIPIENT_HANDLE = "pantry@example.invalid";

let w: World;
beforeAll(async () => {
  w = await makeWorld();
});
afterAll(async () => w.close());
beforeEach(async () => {
  await resetWorld(w);
  for (const table of [outbound_messages, inbound_messages, provider_status_events]) await w.db.delete(table);
  await w.db.delete(messaging_identities).where(eq(messaging_identities.id, RECIPIENT_IDENTITY));
});

const deps = (): Deps => ({ ...w.deps(), messaging: createFakeGateway() });

const message = (text: string, sender_handle: string): InboundMessage => ({
  provider: "fake",
  provider_message_id: `in_${Math.random().toString(36).slice(2)}`,
  provider_event_id: null,
  received_at: at(0).toISOString(),
  sender_handle,
  provider_space_id: null,
  provider_line_sender_id: null,
  text,
  attachments: [],
});

async function handleOf(identity_id: string): Promise<string> {
  const [row] = await w.db.select().from(messaging_identities).where(eq(messaging_identities.id, identity_id));
  return row?.handle as string;
}

/** Gives the recipient of `offer_id` a messaging identity, as the seed does when DEMO_RECIPIENT_HANDLE is set. */
async function addRecipientIdentity(recipient_id: string, status: "joined" | "awaiting_join") {
  await w.db.insert(messaging_identities).values({
    id: RECIPIENT_IDENTITY,
    actor_role: "recipient",
    actor_id: recipient_id,
    provider: "fake",
    handle: RECIPIENT_HANDLE,
    status,
    provider_space_id: null,
    provider_sender_id: null,
    joined_at: status === "joined" ? at(0) : null,
    opted_out_at: null,
  });
}

/** One open offer to courier A; returns it. */
async function openOffer(d: Deps) {
  await joinIdentityNow(w, IDENTITY.courier_a, w.deps());
  const donation_id = await makeEligibleDonation(w);
  await dispatchDonation(donation_id, d);
  const [offer] = await w.db.select().from(offers).where(and(eq(offers.donation_id, donation_id), eq(offers.status, "open")));
  if (!offer) throw new Error("no open offer");
  return offer;
}

const notices = () => w.db.select().from(outbound_messages).where(eq(outbound_messages.purpose, "recipient_update"));

describe("recipient notice on claim", () => {
  it("tells the joined recipient once, with no address, when a courier claims", async () => {
    const d = deps();
    const offer = await openOffer(d);
    await addRecipientIdentity(offer.recipient_id, "joined");
    const courier = await handleOf(IDENTITY.courier_a);

    const result = await handleInbound(message(`YES ${offer.short_code}`, courier), d);
    expect(result.claim_result?.code).toBe("claimed");

    const sent = await notices();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ identity_id: RECIPIENT_IDENTITY, idempotency_key: `recipient_update:${offer.id}:v1` });
    expect(sent[0]?.provider_message_id).not.toBeNull();
    const text = sent[0]?.text as string;
    expect(text).toMatch(/a courier claimed a donation for/i);
    // Neither the donor's pickup address nor the recipient's own address is in it.
    const assignment = result.claim_result?.assignment;
    expect(text).not.toContain(assignment?.pickup.address_line as string);
    expect(text).not.toContain(assignment?.recipient.address_line as string);
    expect(text).not.toMatch(/\bsafe\b|allergen-free|certified|compliant|verified/i);
  });

  it("does not send a second notice when the claiming courier repeats YES", async () => {
    const d = deps();
    const offer = await openOffer(d);
    await addRecipientIdentity(offer.recipient_id, "joined");
    const courier = await handleOf(IDENTITY.courier_a);
    await handleInbound(message(`YES ${offer.short_code}`, courier), d);
    const again = await handleInbound(message(`YES ${offer.short_code}`, courier), d);
    expect(again.claim_result?.code).toBe("already_claimed_by_you");
    expect(await notices()).toHaveLength(1);
  });

  it("does not send a notice for a duplicate delivery of the same inbound message", async () => {
    const d = deps();
    const offer = await openOffer(d);
    await addRecipientIdentity(offer.recipient_id, "joined");
    const msg = message(`YES ${offer.short_code}`, await handleOf(IDENTITY.courier_a));
    await handleInbound(msg, d);
    const dup = await handleInbound(msg, d);
    expect(dup.outcome).toBe("duplicate");
    expect(await notices()).toHaveLength(1);
  });

  it("never messages a recipient that has not joined, and the claim still succeeds", async () => {
    const gateway = createFakeGateway();
    const d: Deps = { ...w.deps(), messaging: gateway };
    const offer = await openOffer(d);
    await addRecipientIdentity(offer.recipient_id, "awaiting_join");
    const result = await handleInbound(message(`YES ${offer.short_code}`, await handleOf(IDENTITY.courier_a)), d);
    expect(result.claim_result?.code).toBe("claimed");
    const sent = await notices();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.provider_message_id).toBeNull(); // recorded as an attempt, never sent
  });

  it("claims normally and sends nothing to anyone else when the recipient has no identity", async () => {
    const d = deps();
    const offer = await openOffer(d);
    const result = await handleInbound(message(`YES ${offer.short_code}`, await handleOf(IDENTITY.courier_a)), d);
    expect(result.claim_result?.code).toBe("claimed");
    expect(await notices()).toHaveLength(0);
  });

  it("sends nothing to the recipient for a claim that loses", async () => {
    const d = deps();
    const offer = await openOffer(d);
    await addRecipientIdentity(offer.recipient_id, "joined");
    await w.db.update(offers).set({ status: "expired", close_reason: "expired" }).where(eq(offers.id, offer.id));
    const result = await handleInbound(message(`YES ${offer.short_code}`, await handleOf(IDENTITY.courier_a)), d);
    expect(result.claim_result?.code).not.toBe("claimed");
    expect(await notices()).toHaveLength(0);
  });
});

describe("formatRecipientNotice", () => {
  it("is deterministic and labels demo mode", () => {
    const input = {
      recipient_display_name: "Eastlake Community Pantry (synthetic)",
      donor_display_name: "Rainier Catering (synthetic)",
      courier_display_name: "Courier A (synthetic, cold transport)",
      donor_pickup_by: "2026-10-18T19:30:00.000Z",
      demo_mode: true,
    };
    expect(formatRecipientNotice(input)).toBe(formatRecipientNotice(input));
    expect(formatRecipientNotice(input)).toContain("12:30 PM");
    expect(formatRecipientNotice({ ...input, demo_mode: false })).not.toContain("DEMO");
  });
});

describe("seed: the optional recipient handle", () => {
  it("is absent unless DEMO_RECIPIENT_HANDLE is given, so photon mode still needs only the three phones", () => {
    const handles = { donor: "donor@example.invalid", courier_a: "courier-a@example.invalid", courier_b: "courier-b@example.invalid" };
    expect(resolveHandles({ messaging_provider: "photon", handles }).recipient).toBeUndefined();
    expect(resolveHandles({ messaging_provider: "photon", handles: { ...handles, recipient: "pantry@example.invalid" } }).recipient).toBe("pantry@example.invalid");
  });

  it("rejects a recipient handle in the wrong shape or one shared with another persona, without echoing it", () => {
    const handles = { donor: "donor@example.invalid", courier_a: "courier-a@example.invalid", courier_b: "courier-b@example.invalid" };
    expect(() => resolveHandles({ messaging_provider: "photon", handles: { ...handles, recipient: "pantry-at-example" } })).toThrow(/DEMO_RECIPIENT_HANDLE/);
    expect(() => resolveHandles({ messaging_provider: "photon", handles: { ...handles, recipient: "donor@example.invalid" } })).toThrow(/must differ/);
  });

  it("the eastlake pantry is the demo couriers' recipient", () => {
    expect(DEMO_ACTORS.some((a) => a.key === "recipient_eastlake")).toBe(true);
  });
});
