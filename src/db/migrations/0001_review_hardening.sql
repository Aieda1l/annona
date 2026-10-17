ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "couriers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "donation_images" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "donations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "donors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inbound_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "messaging_identities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "offers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outbound_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "policy_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "provider_status_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recipients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "system_status" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "verification_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "donations_donor_idx" ON "donations" USING btree ("donor_id");--> statement-breakpoint
CREATE INDEX "offers_donation_status_idx" ON "offers" USING btree ("donation_id","status");--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_claim_linked_check" CHECK ("donations"."status" not in ('claimed', 'collected') or "donations"."claimed_offer_id" is not null);--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_open_has_deadline_check" CHECK ("offers"."status" <> 'open' or "offers"."expires_at" is not null);--> statement-breakpoint
ALTER TABLE "verification_links" ADD CONSTRAINT "verification_links_token_hash_hex_check" CHECK ("verification_links"."token_hash" ~ '^[0-9a-f]{64}$');