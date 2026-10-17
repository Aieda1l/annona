import { z } from "zod";
import { MessagePurpose } from "./enums";
import { UtcString } from "./entities";

// Operator/demo report shapes. Added in contracts-2 (spec v0.5). Captain-controlled.

const Count = z.number().int().min(0);

/** CONTRACTS section 9.4: returned by tick() and dispatchDonation(). */
export const TickReport = z.strictObject({
  at: UtcString,
  expired_offers: Count,
  expired_donations: Count,
  offers_created: Count,
  offers_sent: Count,
  send_failures: Count,
});
export type TickReport = z.infer<typeof TickReport>;

/**
 * CONTRACTS section 3.10 (v0.5): one element of GET /api/messaging/simulated/thread. `purpose` is set only for
 * outbound messages. Never carries a handle.
 */
export const ThreadMessage = z.strictObject({
  id: z.uuid(),
  direction: z.enum(["inbound", "outbound"]),
  text: z.string(),
  purpose: MessagePurpose.nullable(),
  created_at: UtcString,
});
export type ThreadMessage = z.infer<typeof ThreadMessage>;
