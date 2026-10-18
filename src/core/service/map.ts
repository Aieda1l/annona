import {
  PolicyConfig,
  type ActorRole,
  type AuditEvent,
  type CourierProfile,
  type DonationStatus,
  type DonorProfile,
  type MessagingIdentity,
  type Offer,
  type OfferStatus,
  type RecipientOrg,
} from "@/contracts";
import type {
  audit_events,
  couriers,
  donations,
  donors,
  messaging_identities,
  offers,
  policy_config,
  recipients,
} from "@/db/schema";

// Row <-> contract mappers. The database stores instants as timestamptz (Date); the contract uses UTC ISO strings.
// This is the only place that conversion happens.

export const iso = (d: Date): string => d.toISOString();
export const isoOrNull = (d: Date | null): string | null => (d ? d.toISOString() : null);

export type DonationRow = typeof donations.$inferSelect;
export type OfferRow = typeof offers.$inferSelect;
export type IdentityRow = typeof messaging_identities.$inferSelect;

export function donorFromRow(r: typeof donors.$inferSelect): DonorProfile {
  return {
    id: r.id,
    display_name: r.display_name,
    org_type: r.org_type as DonorProfile["org_type"],
    licensed_food_establishment: r.licensed_food_establishment,
    approval_status: r.approval_status as DonorProfile["approval_status"],
    location: r.location,
    is_synthetic: true,
  };
}

export function recipientFromRow(r: typeof recipients.$inferSelect): RecipientOrg {
  return {
    id: r.id,
    display_name: r.display_name,
    approval_status: r.approval_status as RecipientOrg["approval_status"],
    location: r.location,
    is_synthetic: true,
    registered_dfdo: r.registered_dfdo,
    serves_highly_susceptible_population: r.serves_highly_susceptible_population,
    accepts_handling_modes: r.accepts_handling_modes as RecipientOrg["accepts_handling_modes"],
    excluded_allergens: r.excluded_allergens as RecipientOrg["excluded_allergens"],
    capacity_servings_available: r.capacity_servings_available,
    receiving_closes_at: iso(r.receiving_closes_at),
  };
}

export function courierFromRow(r: typeof couriers.$inferSelect): CourierProfile {
  return {
    id: r.id,
    display_name: r.display_name,
    approval_status: r.approval_status as CourierProfile["approval_status"],
    location: r.location,
    is_synthetic: true,
    affiliated_recipient_ids: r.affiliated_recipient_ids,
    capabilities: r.capabilities,
    available_until: iso(r.available_until),
  };
}

export function identityFromRow(r: IdentityRow): MessagingIdentity {
  return {
    id: r.id,
    actor_role: r.actor_role as MessagingIdentity["actor_role"],
    actor_id: r.actor_id,
    provider: r.provider as MessagingIdentity["provider"],
    handle: r.handle,
    status: r.status as MessagingIdentity["status"],
    provider_space_id: r.provider_space_id,
    provider_sender_id: r.provider_sender_id,
    joined_at: isoOrNull(r.joined_at),
    opted_out_at: isoOrNull(r.opted_out_at),
  };
}

export function offerFromRow(r: OfferRow): Offer {
  return {
    id: r.id,
    short_code: r.short_code,
    donation_id: r.donation_id,
    recipient_id: r.recipient_id,
    courier_id: r.courier_id,
    status: r.status as OfferStatus,
    wave_no: r.wave_no,
    created_at: iso(r.created_at),
    sent_at: isoOrNull(r.sent_at),
    expires_at: isoOrNull(r.expires_at),
    responded_at: isoOrNull(r.responded_at),
    close_reason: r.close_reason,
    provider_mode: r.provider_mode as Offer["provider_mode"],
    provider_message_id: r.provider_message_id,
    delivery_status: r.delivery_status as Offer["delivery_status"],
    candidate: r.candidate as Offer["candidate"],
  };
}

export function policyFromRow(r: typeof policy_config.$inferSelect): PolicyConfig {
  // The stored config must satisfy the contract; a broken policy row stops dispatch loudly instead of being guessed at.
  return PolicyConfig.parse(r.config);
}

export function auditFromRow(r: typeof audit_events.$inferSelect): AuditEvent {
  return {
    id: r.id,
    at: iso(r.at),
    donation_id: r.donation_id,
    offer_id: r.offer_id,
    type: r.type as AuditEvent["type"],
    actor: { role: r.actor_role as ActorRole, id: r.actor_id },
    mode: r.mode as AuditEvent["mode"],
    data: r.data as Record<string, unknown>,
  };
}

export const statusOf = (r: DonationRow): DonationStatus => r.status as DonationStatus;

/** Handle shown to the operator: only the last 4 characters (CONTRACTS section 3.13, 11); IdentitySummary allows 8. */
export function maskHandle(handle: string): string {
  return handle.length <= 4 ? "****" : `***${handle.slice(-4)}`;
}

/** Shape check for ids that arrive from outside. A malformed id is a plain "not found", never a database error. */
export const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
