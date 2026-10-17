CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"donation_id" uuid,
	"offer_id" uuid,
	"type" text NOT NULL,
	"actor_role" text NOT NULL,
	"actor_id" uuid,
	"mode" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "audit_events_actor_role_check" CHECK ("actor_role" in ('donor', 'recipient', 'courier', 'operator', 'system'))
);
--> statement-breakpoint
CREATE TABLE "couriers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"approval_status" text NOT NULL,
	"affiliated_recipient_ids" uuid[] NOT NULL,
	"capabilities" jsonb NOT NULL,
	"available_until" timestamp with time zone NOT NULL,
	"location" jsonb NOT NULL,
	"is_synthetic" boolean DEFAULT true NOT NULL,
	CONSTRAINT "couriers_approval_status_check" CHECK ("approval_status" in ('approved', 'pending', 'suspended')),
	CONSTRAINT "couriers_synthetic_check" CHECK ("couriers"."is_synthetic" = true)
);
--> statement-breakpoint
CREATE TABLE "donation_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mime" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "donation_images_size_check" CHECK (octet_length("donation_images"."bytes") <= 5242880)
);
--> statement-breakpoint
CREATE TABLE "donations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"donor_id" uuid NOT NULL,
	"status" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"source" text NOT NULL,
	"source_ref" text,
	"image_id" uuid,
	"ai_status" text NOT NULL,
	"ai_suggestion" jsonb,
	"verified_facts" jsonb,
	"edited_from_ai" text[] DEFAULT '{}'::text[] NOT NULL,
	"latest_decision" jsonb,
	"effective_cutoff_at" timestamp with time zone,
	"claimed_offer_id" uuid,
	"collected_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_synthetic" boolean DEFAULT true NOT NULL,
	CONSTRAINT "donations_status_check" CHECK ("status" in ('draft', 'needs_review', 'eligible', 'unmatched', 'offered', 'claimed', 'collected', 'delivered', 'rejected', 'canceled', 'expired')),
	CONSTRAINT "donations_source_check" CHECK ("source" in ('web_upload', 'messaging', 'fixture')),
	CONSTRAINT "donations_ai_status_check" CHECK ("ai_status" in ('pending', 'succeeded', 'failed', 'skipped')),
	CONSTRAINT "donations_version_check" CHECK ("donations"."version" >= 1),
	CONSTRAINT "donations_synthetic_check" CHECK ("donations"."is_synthetic" = true)
);
--> statement-breakpoint
CREATE TABLE "donors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"org_type" text NOT NULL,
	"licensed_food_establishment" boolean NOT NULL,
	"approval_status" text NOT NULL,
	"location" jsonb NOT NULL,
	"is_synthetic" boolean DEFAULT true NOT NULL,
	CONSTRAINT "donors_approval_status_check" CHECK ("approval_status" in ('approved', 'pending', 'suspended')),
	CONSTRAINT "donors_org_type_check" CHECK ("org_type" in ('restaurant', 'caterer', 'campus_dining')),
	CONSTRAINT "donors_synthetic_check" CHECK ("donors"."is_synthetic" = true)
);
--> statement-breakpoint
CREATE TABLE "inbound_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_message_id" text NOT NULL,
	"provider_event_id" text,
	"received_at" timestamp with time zone NOT NULL,
	"processing_started_at" timestamp with time zone,
	"sender_handle" text,
	"handle_masked" text,
	"ignore_reason" text,
	"payload" jsonb,
	"result" jsonb,
	CONSTRAINT "inbound_messages_provider_check" CHECK ("provider" in ('photon', 'fake'))
);
--> statement-breakpoint
CREATE TABLE "messaging_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_role" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"handle" text NOT NULL,
	"status" text NOT NULL,
	"provider_space_id" text,
	"provider_sender_id" text,
	"joined_at" timestamp with time zone,
	"opted_out_at" timestamp with time zone,
	CONSTRAINT "messaging_identities_role_check" CHECK ("actor_role" in ('courier', 'donor')),
	CONSTRAINT "messaging_identities_provider_check" CHECK ("provider" in ('photon', 'fake')),
	CONSTRAINT "messaging_identities_status_check" CHECK ("status" in ('awaiting_join', 'joined', 'opted_out'))
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"donation_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"courier_id" uuid NOT NULL,
	"short_code" text NOT NULL,
	"status" text NOT NULL,
	"wave_no" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"close_reason" text,
	"provider_mode" text NOT NULL,
	"provider_message_id" text,
	"delivery_status" text DEFAULT 'unknown' NOT NULL,
	"candidate" jsonb NOT NULL,
	CONSTRAINT "offers_status_check" CHECK ("status" in ('pending_send', 'open', 'accepted', 'declined', 'expired', 'superseded', 'send_failed', 'canceled')),
	CONSTRAINT "offers_provider_mode_check" CHECK ("provider_mode" in ('real', 'fake')),
	CONSTRAINT "offers_delivery_status_check" CHECK ("delivery_status" in ('unknown', 'accepted', 'delivered', 'failed')),
	CONSTRAINT "offers_wave_no_check" CHECK ("offers"."wave_no" >= 1),
	CONSTRAINT "offers_short_code_check" CHECK ("offers"."short_code" ~ '^[ACDEFHJKMNPRTUVWXY3479]{4}$')
);
--> statement-breakpoint
CREATE TABLE "outbound_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"text" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"provider_mode" text NOT NULL,
	"provider_message_id" text,
	"correlation" jsonb,
	"send_result" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "outbound_messages_purpose_check" CHECK ("purpose" in ('offer', 'claim_result', 'decline_ack', 'offer_closed', 'join_ack', 'stop_ack', 'draft_ready', 'intake_failed', 'donor_update', 'recipient_update', 'help')),
	CONSTRAINT "outbound_messages_provider_mode_check" CHECK ("provider_mode" in ('real', 'fake'))
);
--> statement-breakpoint
CREATE TABLE "policy_config" (
	"policy_id" text NOT NULL,
	"policy_version" text NOT NULL,
	"config" jsonb NOT NULL,
	"active" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_status_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"provider_message_id" text NOT NULL,
	"status" text NOT NULL,
	"failure_code" text,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "provider_status_events_provider_check" CHECK ("provider" in ('photon', 'fake'))
);
--> statement-breakpoint
CREATE TABLE "recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"approval_status" text NOT NULL,
	"registered_dfdo" boolean NOT NULL,
	"serves_highly_susceptible_population" boolean NOT NULL,
	"accepts_handling_modes" text[] NOT NULL,
	"excluded_allergens" text[] NOT NULL,
	"capacity_servings_available" integer NOT NULL,
	"receiving_closes_at" timestamp with time zone NOT NULL,
	"location" jsonb NOT NULL,
	"is_synthetic" boolean DEFAULT true NOT NULL,
	CONSTRAINT "recipients_excluded_allergens_check" CHECK ("excluded_allergens" <@ ARRAY['milk', 'eggs', 'fish', 'crustacean_shellfish', 'tree_nuts', 'peanuts', 'wheat', 'soybeans', 'sesame']::text[]),
	CONSTRAINT "recipients_handling_modes_check" CHECK ("accepts_handling_modes" <@ ARRAY['refrigerated', 'hot_held', 'ambient', 'frozen', 'unknown']::text[]),
	CONSTRAINT "recipients_approval_status_check" CHECK ("approval_status" in ('approved', 'pending', 'suspended')),
	CONSTRAINT "recipients_capacity_check" CHECK ("recipients"."capacity_servings_available" >= 0),
	CONSTRAINT "recipients_synthetic_check" CHECK ("recipients"."is_synthetic" = true)
);
--> statement-breakpoint
CREATE TABLE "system_status" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"donation_id" uuid NOT NULL,
	"donor_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_donor_id_donors_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_image_id_donation_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."donation_images"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_donation_id_donations_id_fk" FOREIGN KEY ("donation_id") REFERENCES "public"."donations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_recipient_id_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."recipients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_courier_id_couriers_id_fk" FOREIGN KEY ("courier_id") REFERENCES "public"."couriers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_identity_id_messaging_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."messaging_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_links" ADD CONSTRAINT "verification_links_donation_id_donations_id_fk" FOREIGN KEY ("donation_id") REFERENCES "public"."donations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_links" ADD CONSTRAINT "verification_links_donor_id_donors_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_donation_at_idx" ON "audit_events" USING btree ("donation_id","at");--> statement-breakpoint
CREATE INDEX "donations_status_idx" ON "donations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "donations_source_ref_uq" ON "donations" USING btree ("source","source_ref") WHERE "donations"."source_ref" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_messages_provider_message_uq" ON "inbound_messages" USING btree ("provider","provider_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_identities_provider_handle_uq" ON "messaging_identities" USING btree ("provider","handle");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_short_code_uq" ON "offers" USING btree ("short_code");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_one_active_assignment_uq" ON "offers" USING btree ("donation_id") WHERE "offers"."status" = 'accepted' and "offers"."close_reason" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "offers_one_live_offer_per_courier_uq" ON "offers" USING btree ("courier_id") WHERE "offers"."status" in ('pending_send', 'open');--> statement-breakpoint
CREATE INDEX "offers_status_expires_idx" ON "offers" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "offers_courier_status_idx" ON "offers" USING btree ("courier_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "outbound_messages_idempotency_key_uq" ON "outbound_messages" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "policy_config_id_version_uq" ON "policy_config" USING btree ("policy_id","policy_version");--> statement-breakpoint
CREATE UNIQUE INDEX "policy_config_one_active_uq" ON "policy_config" USING btree ("active") WHERE "policy_config"."active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_status_events_provider_event_uq" ON "provider_status_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_links_token_hash_uq" ON "verification_links" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_links_one_live_per_donation_uq" ON "verification_links" USING btree ("donation_id") WHERE "verification_links"."consumed_at" is null and "verification_links"."revoked_at" is null;