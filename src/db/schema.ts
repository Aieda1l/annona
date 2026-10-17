import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  ACTOR_ROLES,
  AI_STATUSES,
  DELIVERY_STATUSES,
  DONATION_STATUSES,
  MESSAGE_PURPOSES,
  MESSAGING_IDENTITY_STATUSES,
  OFFER_STATUSES,
  PROVIDER_MODES,
} from "@/contracts";

// ARCHITECTURE §7. text + CHECK constraints instead of PG enums; timestamptz everywhere.
// jsonb columns keep the contract field names, so there is no mapping layer.

const inList = (column: { name: string }, values: readonly string[]): SQL =>
  sql.raw(`"${column.name}" in (${values.map((v) => `'${v}'`).join(", ")})`);

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => "bytea",
});

type Location = { lat: number; lng: number; area_label: string; address_line: string };

const APPROVAL_STATUSES = ["approved", "pending", "suspended"] as const;
const MESSAGING_PROVIDERS = ["photon", "fake"] as const;
const DONATION_SOURCES = ["web_upload", "messaging", "fixture"] as const;
const IDENTITY_ROLES = ["courier", "donor"] as const;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const donors = pgTable(
  "donors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    display_name: text("display_name").notNull(),
    org_type: text("org_type").notNull(),
    licensed_food_establishment: boolean("licensed_food_establishment").notNull(),
    approval_status: text("approval_status").notNull(),
    location: jsonb("location").$type<Location>().notNull(),
    is_synthetic: boolean("is_synthetic").notNull().default(true),
  },
  (t) => [
    check("donors_approval_status_check", inList(t.approval_status, APPROVAL_STATUSES)),
    check("donors_org_type_check", inList(t.org_type, ["restaurant", "caterer", "campus_dining"])),
    check("donors_synthetic_check", sql`${t.is_synthetic} = true`),
  ],
);

export const recipients = pgTable(
  "recipients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    display_name: text("display_name").notNull(),
    approval_status: text("approval_status").notNull(),
    registered_dfdo: boolean("registered_dfdo").notNull(),
    serves_highly_susceptible_population: boolean("serves_highly_susceptible_population").notNull(),
    accepts_handling_modes: text("accepts_handling_modes").array().notNull(),
    excluded_allergens: text("excluded_allergens").array().notNull(),
    capacity_servings_available: integer("capacity_servings_available").notNull(),
    receiving_closes_at: tstz("receiving_closes_at").notNull(),
    location: jsonb("location").$type<Location>().notNull(),
    is_synthetic: boolean("is_synthetic").notNull().default(true),
  },
  (t) => [
    check("recipients_approval_status_check", inList(t.approval_status, APPROVAL_STATUSES)),
    check("recipients_capacity_check", sql`${t.capacity_servings_available} >= 0`),
    check("recipients_synthetic_check", sql`${t.is_synthetic} = true`),
  ],
);

export const couriers = pgTable(
  "couriers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    display_name: text("display_name").notNull(),
    approval_status: text("approval_status").notNull(),
    affiliated_recipient_ids: uuid("affiliated_recipient_ids").array().notNull(),
    capabilities: jsonb("capabilities").$type<{ cold_transport: boolean }>().notNull(),
    available_until: tstz("available_until").notNull(),
    location: jsonb("location").$type<Location>().notNull(),
    is_synthetic: boolean("is_synthetic").notNull().default(true),
  },
  (t) => [
    check("couriers_approval_status_check", inList(t.approval_status, APPROVAL_STATUSES)),
    check("couriers_synthetic_check", sql`${t.is_synthetic} = true`),
  ],
);

export const messaging_identities = pgTable(
  "messaging_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actor_role: text("actor_role").notNull(),
    actor_id: uuid("actor_id").notNull(),
    provider: text("provider").notNull(),
    handle: text("handle").notNull(),
    status: text("status").notNull(),
    provider_space_id: text("provider_space_id"),
    provider_sender_id: text("provider_sender_id"),
    joined_at: tstz("joined_at"),
    opted_out_at: tstz("opted_out_at"),
  },
  (t) => [
    uniqueIndex("messaging_identities_provider_handle_uq").on(t.provider, t.handle),
    check("messaging_identities_role_check", inList(t.actor_role, IDENTITY_ROLES)),
    check("messaging_identities_provider_check", inList(t.provider, MESSAGING_PROVIDERS)),
    check("messaging_identities_status_check", inList(t.status, MESSAGING_IDENTITY_STATUSES)),
  ],
);

export const donation_images = pgTable(
  "donation_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mime: text("mime").notNull(),
    bytes: bytea("bytes").notNull(),
    sha256: text("sha256").notNull(),
    created_at: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [check("donation_images_size_check", sql`octet_length(${t.bytes}) <= ${sql.raw(String(MAX_IMAGE_BYTES))}`)],
);

export const donations = pgTable(
  "donations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    donor_id: uuid("donor_id")
      .notNull()
      .references(() => donors.id),
    status: text("status").notNull(),
    version: integer("version").notNull().default(1),
    source: text("source").notNull(),
    source_ref: text("source_ref"),
    image_id: uuid("image_id").references(() => donation_images.id),
    ai_status: text("ai_status").notNull(),
    ai_suggestion: jsonb("ai_suggestion"),
    verified_facts: jsonb("verified_facts"),
    edited_from_ai: text("edited_from_ai").array().notNull().default(sql`'{}'::text[]`),
    latest_decision: jsonb("latest_decision"),
    effective_cutoff_at: tstz("effective_cutoff_at"),
    // Set only by a successful claim (§8). No FK: offers.donation_id already points back (circular), and
    // only the claim transaction writes it.
    claimed_offer_id: uuid("claimed_offer_id"),
    collected_at: tstz("collected_at"),
    created_at: tstz("created_at").notNull().defaultNow(),
    updated_at: tstz("updated_at").notNull().defaultNow(),
    is_synthetic: boolean("is_synthetic").notNull().default(true),
  },
  (t) => [
    check("donations_status_check", inList(t.status, DONATION_STATUSES)),
    check("donations_source_check", inList(t.source, DONATION_SOURCES)),
    check("donations_ai_status_check", inList(t.ai_status, AI_STATUSES)),
    check("donations_version_check", sql`${t.version} >= 1`),
    check("donations_synthetic_check", sql`${t.is_synthetic} = true`),
    index("donations_status_idx").on(t.status),
    uniqueIndex("donations_source_ref_uq").on(t.source, t.source_ref).where(sql`${t.source_ref} is not null`),
  ],
);

export const verification_links = pgTable(
  "verification_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    donation_id: uuid("donation_id")
      .notNull()
      .references(() => donations.id),
    donor_id: uuid("donor_id")
      .notNull()
      .references(() => donors.id),
    // Hex SHA-256 only. There is deliberately no raw-token column (CONTRACTS §3.16).
    token_hash: text("token_hash").notNull(),
    issued_at: tstz("issued_at").notNull(),
    expires_at: tstz("expires_at").notNull(),
    consumed_at: tstz("consumed_at"),
    revoked_at: tstz("revoked_at"),
  },
  (t) => [
    uniqueIndex("verification_links_token_hash_uq").on(t.token_hash),
    uniqueIndex("verification_links_one_live_per_donation_uq")
      .on(t.donation_id)
      .where(sql`${t.consumed_at} is null and ${t.revoked_at} is null`),
  ],
);

export const offers = pgTable(
  "offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    donation_id: uuid("donation_id")
      .notNull()
      .references(() => donations.id),
    recipient_id: uuid("recipient_id")
      .notNull()
      .references(() => recipients.id),
    courier_id: uuid("courier_id")
      .notNull()
      .references(() => couriers.id),
    short_code: text("short_code").notNull(),
    status: text("status").notNull(),
    wave_no: integer("wave_no").notNull(),
    created_at: tstz("created_at").notNull().defaultNow(),
    sent_at: tstz("sent_at"),
    expires_at: tstz("expires_at"),
    responded_at: tstz("responded_at"),
    close_reason: text("close_reason"),
    provider_mode: text("provider_mode").notNull(),
    provider_message_id: text("provider_message_id"),
    delivery_status: text("delivery_status").notNull().default("unknown"),
    candidate: jsonb("candidate").notNull(),
  },
  (t) => [
    check("offers_status_check", inList(t.status, OFFER_STATUSES)),
    check("offers_provider_mode_check", inList(t.provider_mode, PROVIDER_MODES)),
    check("offers_delivery_status_check", inList(t.delivery_status, DELIVERY_STATUSES)),
    check("offers_wave_no_check", sql`${t.wave_no} >= 1`),
    check("offers_short_code_check", sql`${t.short_code} ~ '^[ACDEFHJKMNPRTUVWXY3479]{4}$'`),
    // Never reused until resetDemo deletes offers (D-026): no WHERE clause.
    uniqueIndex("offers_short_code_uq").on(t.short_code),
    // One active assignment per donation (F1): an accepted row with a close_reason is history and does not block.
    uniqueIndex("offers_one_active_assignment_uq")
      .on(t.donation_id)
      .where(sql`${t.status} = 'accepted' and ${t.close_reason} is null`),
    // One live offer per courier (M-09, F6, D-029).
    uniqueIndex("offers_one_live_offer_per_courier_uq")
      .on(t.courier_id)
      .where(sql`${t.status} in ('pending_send', 'open')`),
    index("offers_status_expires_idx").on(t.status, t.expires_at),
    index("offers_courier_status_idx").on(t.courier_id, t.status),
  ],
);

export const inbound_messages = pgTable(
  "inbound_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    provider_message_id: text("provider_message_id").notNull(),
    provider_event_id: text("provider_event_id"),
    received_at: tstz("received_at").notNull(),
    processing_started_at: tstz("processing_started_at"),
    // Ignored senders are stored with sender_handle and payload null (CONTRACTS §11).
    sender_handle: text("sender_handle"),
    handle_masked: text("handle_masked"),
    ignore_reason: text("ignore_reason"),
    payload: jsonb("payload"),
    result: jsonb("result"),
  },
  (t) => [
    check("inbound_messages_provider_check", inList(t.provider, MESSAGING_PROVIDERS)),
    uniqueIndex("inbound_messages_provider_message_uq").on(t.provider, t.provider_message_id),
  ],
);

export const provider_status_events = pgTable(
  "provider_status_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    provider_event_id: text("provider_event_id").notNull(),
    provider_message_id: text("provider_message_id").notNull(),
    status: text("status").notNull(),
    failure_code: text("failure_code"),
    at: tstz("at").notNull(),
  },
  (t) => [
    check("provider_status_events_provider_check", inList(t.provider, MESSAGING_PROVIDERS)),
    uniqueIndex("provider_status_events_provider_event_uq").on(t.provider, t.provider_event_id),
  ],
);

export const outbound_messages = pgTable(
  "outbound_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identity_id: uuid("identity_id")
      .notNull()
      .references(() => messaging_identities.id),
    purpose: text("purpose").notNull(),
    text: text("text").notNull(),
    idempotency_key: text("idempotency_key").notNull(),
    provider_mode: text("provider_mode").notNull(),
    provider_message_id: text("provider_message_id"),
    correlation: jsonb("correlation"),
    send_result: jsonb("send_result"),
    created_at: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("outbound_messages_purpose_check", inList(t.purpose, MESSAGE_PURPOSES)),
    check("outbound_messages_provider_mode_check", inList(t.provider_mode, PROVIDER_MODES)),
    uniqueIndex("outbound_messages_idempotency_key_uq").on(t.idempotency_key),
  ],
);

export const audit_events = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    at: tstz("at").notNull(),
    donation_id: uuid("donation_id"),
    offer_id: uuid("offer_id"),
    type: text("type").notNull(),
    actor_role: text("actor_role").notNull(),
    actor_id: uuid("actor_id"),
    mode: jsonb("mode").notNull().default(sql`'{}'::jsonb`),
    data: jsonb("data").notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [
    check("audit_events_actor_role_check", inList(t.actor_role, ACTOR_ROLES)),
    // No FKs on donation_id/offer_id: audit rows are append-only history and must outlive resetDemo deletes.
    index("audit_events_donation_at_idx").on(t.donation_id, t.at),
  ],
);

export const policy_config = pgTable(
  "policy_config",
  {
    policy_id: text("policy_id").notNull(),
    policy_version: text("policy_version").notNull(),
    config: jsonb("config").notNull(),
    active: boolean("active").notNull().default(false),
  },
  (t) => [
    uniqueIndex("policy_config_id_version_uq").on(t.policy_id, t.policy_version),
    // One active row.
    uniqueIndex("policy_config_one_active_uq").on(t.active).where(sql`${t.active} = true`),
  ],
);

export const system_status = pgTable("system_status", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updated_at: tstz("updated_at").notNull().defaultNow(),
});
