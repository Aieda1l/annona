import { err, ok, type Deps, type Result } from "@/contracts";
import { donation_images, donations, offers, verification_links } from "@/db/schema";
import { seedStore } from "@/db/seed/seed";
import { getEnv } from "@/server/env";
import { SYSTEM_ACTOR, writeAudit } from "./audit";
import { activeProvider, runtime } from "./runtime";

// Slice 2(c): demo reset (CONTRACTS section 9.3, POST /api/demo/reset). Demo mode only (ANNONA_DEMO_MODE=1).
//
// Deleted: verification links, offers (so short codes are free again, D-026), donations and their photos (so M-04's
// committed servings start from zero). Kept: messaging identities (joined phones stay joined), the inbound and
// provider-status ledgers (a provider redelivering an old message after the reset is still a duplicate, so an old
// "YES K7M3" can never claim a new offer that reuses the code), outbound messages and the audit trail (history).
// Then the seed runs again with the current time: profiles, availability windows and the policy are restored.

export async function resetDemo(input: { keep_identities: true }, deps?: Deps): Promise<Result<{ reset_at: string }>> {
  if (input?.keep_identities !== true) return err("VALIDATION_FAILED", "resetDemo always keeps messaging identities.");
  const env = getEnv();
  if (!env.demo_mode) return err("NOT_AUTHORIZED", "Demo reset is only available in demo mode.");

  const { db, clock, store } = await runtime(deps);
  const now = clock.now();
  const deleted = await db.transaction(async (tx) => {
    const links = await tx.delete(verification_links).returning({ id: verification_links.id });
    const offerRows = await tx.delete(offers).returning({ id: offers.id });
    const donationRows = await tx.delete(donations).returning({ id: donations.id });
    const images = await tx.delete(donation_images).returning({ id: donation_images.id });
    return { links: links.length, offers: offerRows.length, donations: donationRows.length, images: images.length };
  });

  const provider = activeProvider(deps);
  await seedStore(store, {
    now,
    messaging_provider: provider,
    handles: { donor: env.demo_donor_handle, courier_a: env.demo_courier_a_handle, courier_b: env.demo_courier_b_handle },
  });
  await writeAudit(db, { at: now, type: "demo.reset", actor: SYSTEM_ACTOR, mode: { messaging: provider === "photon" ? "real" : "fake" }, data: { deleted } });
  return ok({ reset_at: now.toISOString() });
}
