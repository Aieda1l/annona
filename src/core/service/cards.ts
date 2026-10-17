import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  err,
  ok,
  type Actor,
  type DonationCard,
  type EligibilityDecision,
  type OfferSummary,
  type Result,
  type VerifiedFacts,
  type VisionSuggestion,
} from "@/contracts";
import { audit_events, couriers, donations, donors, offers, recipients } from "@/db/schema";
import { auditFromRow, isoOrNull, type DonationRow } from "./map";
import { runtime, type Q } from "./runtime";
import type { Deps } from "@/contracts";

// DonationCard read model (CONTRACTS section 3.13) with the section 11 projections.

export type CardView = "operator" | "donor";

const ZERO_UUID = "00000000-0000-4000-8000-000000000000";
const DONOR_TIMELINE = [/^donation\./, /^ai\./, /^donor\./, /^eligibility\./, /^claim\.accepted$/, /^handoff\./];

type OfferJoined = {
  offer: typeof offers.$inferSelect;
  courier_name: string;
  recipient_name: string;
};

const summary = (j: OfferJoined): OfferSummary => ({
  id: j.offer.id,
  short_code: j.offer.short_code,
  courier_display_name: j.courier_name,
  recipient_display_name: j.recipient_name,
  status: j.offer.status as OfferSummary["status"],
  wave_no: j.offer.wave_no,
  sent_at: isoOrNull(j.offer.sent_at),
  expires_at: isoOrNull(j.offer.expires_at),
  responded_at: isoOrNull(j.offer.responded_at),
  close_reason: j.offer.close_reason,
  provider_mode: j.offer.provider_mode as OfferSummary["provider_mode"],
  provider_message_id: j.offer.provider_message_id,
  delivery_status: j.offer.delivery_status as OfferSummary["delivery_status"],
});

/**
 * The owning donor sees only { status, sent_at, expires_at } of an offer (section 3.13). The card schema is strict, so
 * the hidden fields keep neutral placeholders: no real id, short code, names or provider message id.
 */
const donorOfferSummary = (s: OfferSummary): OfferSummary => ({
  id: ZERO_UUID,
  short_code: "AAAA",
  courier_display_name: "",
  recipient_display_name: "",
  status: s.status,
  wave_no: 1,
  sent_at: s.sent_at,
  expires_at: s.expires_at,
  responded_at: null,
  close_reason: null,
  provider_mode: s.provider_mode,
  provider_message_id: null,
  delivery_status: "unknown",
});

const isActive = (o: OfferJoined) =>
  o.offer.status === "pending_send" || o.offer.status === "open" || (o.offer.status === "accepted" && o.offer.close_reason === null);

export async function buildCard(q: Q, row: DonationRow, view: CardView): Promise<DonationCard> {
  const [donor] = await q.select().from(donors).where(eq(donors.id, row.donor_id));
  const joined: OfferJoined[] = (
    await q
      .select({ offer: offers, courier_name: couriers.display_name, recipient_name: recipients.display_name })
      .from(offers)
      .innerJoin(couriers, eq(offers.courier_id, couriers.id))
      .innerJoin(recipients, eq(offers.recipient_id, recipients.id))
      .where(eq(offers.donation_id, row.id))
      .orderBy(asc(offers.created_at), asc(offers.id))
  ).map((r) => ({ offer: r.offer, courier_name: r.courier_name, recipient_name: r.recipient_name }));

  const timelineRows = await q
    .select()
    .from(audit_events)
    .where(eq(audit_events.donation_id, row.id))
    .orderBy(desc(audit_events.at), desc(audit_events.id))
    .limit(30);
  let timeline = timelineRows.map(auditFromRow).reverse();
  if (view === "donor") timeline = timeline.filter((e) => DONOR_TIMELINE.some((re) => re.test(e.type)));

  const [deliveredEvent] = await q
    .select({ at: audit_events.at })
    .from(audit_events)
    .where(and(eq(audit_events.donation_id, row.id), eq(audit_events.type, "handoff.recorded"), sql`${audit_events.data}->>'step' = 'delivered'`))
    .orderBy(desc(audit_events.at))
    .limit(1);

  const active = joined.filter(isActive).map(summary);
  const history = joined.filter((o) => !isActive(o)).map(summary);
  const claimedOffer = joined.find((o) => o.offer.status === "accepted" && o.offer.close_reason === null);
  const hasAssignment = claimedOffer && ["claimed", "collected", "delivered"].includes(row.status);

  const card: DonationCard = {
    id: row.id,
    status: row.status as DonationCard["status"],
    version: row.version,
    donor_display_name: donor?.display_name ?? "",
    donor_area_label: donor?.location.area_label ?? "",
    image_url: row.image_id ? `/api/images/${row.image_id}` : null,
    ai_status: row.ai_status as DonationCard["ai_status"],
    ai_suggestion: (row.ai_suggestion as VisionSuggestion | null) ?? null,
    verified_facts: (row.verified_facts as VerifiedFacts | null) ?? null,
    edited_from_ai: row.edited_from_ai,
    decision: (row.latest_decision as EligibilityDecision | null) ?? null,
    effective_cutoff_at: isoOrNull(row.effective_cutoff_at),
    active_offers: active,
    offer_history: history,
    assignment: hasAssignment ? { courier_display_name: claimedOffer.courier_name, recipient_display_name: claimedOffer.recipient_name } : null,
    handoff: { collected_at: isoOrNull(row.collected_at), delivered_at: isoOrNull(deliveredEvent?.at ?? null), simulated: true },
    timeline,
    is_synthetic: true,
  };

  if (view === "donor") {
    // Before a claim the donor sees neither who was offered the food nor the provider message ids.
    card.active_offers = card.active_offers.map(donorOfferSummary);
    card.offer_history = card.offer_history.map(donorOfferSummary);
  }
  return card;
}

/** Which projection an actor gets for a donation, or null when the actor may not see it (section 11). */
export function viewFor(actor: Actor, row: Pick<DonationRow, "donor_id">): CardView | null {
  if (actor.role === "operator") return "operator";
  if (actor.role === "donor" && actor.id !== null && actor.id === row.donor_id) return "donor";
  return null;
}

export async function getDonationCard(actor: Actor, id: string, deps?: Deps): Promise<Result<DonationCard>> {
  // Role first: a caller who may never see donations learns nothing about which ids exist.
  if (actor.role !== "operator" && actor.role !== "donor") return err("NOT_AUTHORIZED", "You can't view this donation.");
  const { db } = await runtime(deps);
  const [row] = await db.select().from(donations).where(eq(donations.id, id));
  if (!row) return err("NOT_FOUND", "Donation not found.");
  const view = viewFor(actor, row);
  if (!view) return err("NOT_AUTHORIZED", "You can't view this donation.");
  return ok(await buildCard(db, row, view));
}
