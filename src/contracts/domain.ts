import { z } from "zod";
import { DeliveryStatus, OfferStatus, ProviderMode, SHORT_CODE_REGEX } from "./enums";
import { UtcString } from "./entities";
import { MatchCandidate } from "./profiles";

// CONTRACTS section 3.2 (source) and section 3.8 (Offer). Added in contracts-2b. Captain-controlled.

export const DonationSource = z.enum(["web_upload", "messaging", "fixture"]);
export type DonationSource = z.infer<typeof DonationSource>;

/** Persisted offer (Dev 2 persists, Dev 3 sends). The UI sees `OfferSummary`, never this. */
export const Offer = z.strictObject({
  id: z.uuid(),
  short_code: z.string().regex(SHORT_CODE_REGEX),
  donation_id: z.uuid(),
  recipient_id: z.uuid(),
  courier_id: z.uuid(),
  status: OfferStatus,
  wave_no: z.number().int().min(1),
  created_at: UtcString,
  sent_at: UtcString.nullable(),
  expires_at: UtcString.nullable(),
  responded_at: UtcString.nullable(),
  close_reason: z.string().nullable(),
  provider_mode: ProviderMode,
  provider_message_id: z.string().nullable(),
  delivery_status: DeliveryStatus,
  candidate: MatchCandidate,
});
export type Offer = z.infer<typeof Offer>;
