import { and, eq } from "drizzle-orm";
import { err, ok, type Actor, type Deps, type Result } from "@/contracts";
import { donation_images, donations, messaging_identities, offers, verification_links } from "@/db/schema";
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
//
// A STOP from a SIMULATED phone (provider `fake`) is undone by the reset: a rehearsal that tests STOP must not leave the
// demo without a courier. A STOP from a REAL phone (provider `photon`) is never undone here: that person opted out of
// messages and only their own JOIN may reverse it. The audit event records how many real opt-outs were kept.
//
// The deletes and the fake-identity restore commit together. The seed is a separate store call afterwards; if it fails
// the availability windows are stale until the reset is run again (a retry heals it).

export async function resetDemo(input: { keep_identities: true; actor?: Actor }, deps?: Deps): Promise<Result<{ reset_at: string }>> {
  if (input?.keep_identities !== true) return err("VALIDATION_FAILED", "resetDemo always keeps messaging identities.");
  // Callers that know who is asking (the HTTP handler) pass the actor; one that is given must be an operator.
  if (input.actor !== undefined && input.actor?.role !== "operator") return err("NOT_AUTHORIZED", "Only an operator can reset the demo.");
  const env = getEnv();
  if (!env.demo_mode) return err("NOT_AUTHORIZED", "Demo reset is only available in demo mode.");

  const { db, clock, store } = await runtime(deps);
  const now = clock.now();
  const deleted = await db.transaction(async (tx) => {
    const links = await tx.delete(verification_links).returning({ id: verification_links.id });
    const offerRows = await tx.delete(offers).returning({ id: offers.id });
    const donationRows = await tx.delete(donations).returning({ id: donations.id });
    const images = await tx.delete(donation_images).returning({ id: donation_images.id });
    const restored = await tx
      .update(messaging_identities)
      .set({ status: "joined", opted_out_at: null, joined_at: now })
      .where(and(eq(messaging_identities.status, "opted_out"), eq(messaging_identities.provider, "fake")))
      .returning({ id: messaging_identities.id });
    const kept = await tx
      .select({ id: messaging_identities.id })
      .from(messaging_identities)
      .where(and(eq(messaging_identities.status, "opted_out"), eq(messaging_identities.provider, "photon")));
    return {
      links: links.length,
      offers: offerRows.length,
      donations: donationRows.length,
      images: images.length,
      simulated_identities_restored: restored.length,
      real_opt_outs_kept: kept.length,
    };
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
