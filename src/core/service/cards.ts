import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
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
import { auditFromRow, isUuid, isoOrNull, type DonationRow } from "./map";
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

/** The most recent audit events shown per card (the card schema allows at most 30). */
const TIMELINE_LIMIT = 30;

/**
 * Cards for many donations with a fixed number of queries (donors, offers, timeline, delivery time), not four per card:
 * the operator dashboard polls this with up to 100 cards every few seconds. Order follows `rows`.
 */
export async function buildCards(q: Q, rows: DonationRow[], view: CardView): Promise<DonationCard[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const donorById = new Map(
    (await q.select().from(donors).where(inArray(donors.id, [...new Set(rows.map((r) => r.donor_id))]))).map((d) => [d.id, d]),
  );

  const offersByDonation = new Map<string, OfferJoined[]>();
  const joinedRows = await q
    .select({ offer: offers, courier_name: couriers.display_name, recipient_name: recipients.display_name })
    .from(offers)
    .innerJoin(couriers, eq(offers.courier_id, couriers.id))
    .innerJoin(recipients, eq(offers.recipient_id, recipients.id))
    .where(inArray(offers.donation_id, ids))
    .orderBy(asc(offers.created_at), asc(offers.id));
  for (const r of joinedRows) {
    const list = offersByDonation.get(r.offer.donation_id) ?? [];
    list.push({ offer: r.offer, courier_name: r.courier_name, recipient_name: r.recipient_name });
    offersByDonation.set(r.offer.donation_id, list);
  }

  // The newest TIMELINE_LIMIT events of each donation: rank within the donation, keep rank <= the limit.
  const ranked = q
    .select({
      id: audit_events.id,
      n: sql<number>`row_number() over (partition by ${audit_events.donation_id} order by ${audit_events.at} desc, ${audit_events.id} desc)`.as("n"),
    })
    .from(audit_events)
    .where(inArray(audit_events.donation_id, ids))
    .as("ranked");
  const timelineRows = await q
    .select({ event: audit_events })
    .from(audit_events)
    .innerJoin(ranked, eq(audit_events.id, ranked.id))
    .where(lte(ranked.n, TIMELINE_LIMIT))
    .orderBy(desc(audit_events.at), desc(audit_events.id));
  const timelineByDonation = new Map<string, ReturnType<typeof auditFromRow>[]>();
  for (const { event } of timelineRows) {
    if (event.donation_id === null) continue;
    const list = timelineByDonation.get(event.donation_id) ?? [];
    list.push(auditFromRow(event));
    timelineByDonation.set(event.donation_id, list);
  }

  const deliveredRows = await q
    .select({ donation_id: audit_events.donation_id, at: sql`max(${audit_events.at})`.mapWith(audit_events.at) })
    .from(audit_events)
    .where(and(inArray(audit_events.donation_id, ids), eq(audit_events.type, "handoff.recorded"), sql`${audit_events.data}->>'step' = 'delivered'`))
    .groupBy(audit_events.donation_id);
  const deliveredAt = new Map(deliveredRows.map((d) => [d.donation_id, d.at]));

  return rows.map((row) => {
    const donor = donorById.get(row.donor_id);
    const joined = offersByDonation.get(row.id) ?? [];
    let timeline = (timelineByDonation.get(row.id) ?? []).reverse();
    if (view === "donor") {
      // The donor learns that things happened, not who did them: courier and offer ids and the claim's source are hidden.
      timeline = timeline
        .filter((e) => DONOR_TIMELINE.some((re) => re.test(e.type)))
        .map((e) => ({ ...e, offer_id: null, actor: e.actor.role === "donor" ? e.actor : { role: e.actor.role, id: null }, data: e.type === "claim.accepted" ? {} : e.data }));
    }

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
      handoff: { collected_at: isoOrNull(row.collected_at), delivered_at: isoOrNull(deliveredAt.get(row.id) ?? null), simulated: true },
      timeline,
      is_synthetic: true,
    };

    if (view === "donor") {
      // Before a claim the donor sees neither who was offered the food nor the provider message ids.
      card.active_offers = card.active_offers.map(donorOfferSummary);
      card.offer_history = card.offer_history.map(donorOfferSummary);
    }
    return card;
  });
}

export async function buildCard(q: Q, row: DonationRow, view: CardView): Promise<DonationCard> {
  return (await buildCards(q, [row], view))[0]!;
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
  if (!isUuid(id)) return err("NOT_FOUND", "Donation not found.");
  const { db } = await runtime(deps);
  const [row] = await db.select().from(donations).where(eq(donations.id, id));
  // A donor gets the same answer for a missing donation and for someone else's (no id probing).
  if (!row) return actor.role === "operator" ? err("NOT_FOUND", "Donation not found.") : err("NOT_AUTHORIZED", "You can't view this donation.");
  const view = viewFor(actor, row);
  if (!view) return err("NOT_AUTHORIZED", "You can't view this donation.");
  return ok(await buildCard(db, row, view));
}
