import { and, eq, sql } from "drizzle-orm";
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
// A STOP from a SIMULATED phone is undone by the reset: a rehearsal that tests STOP must not leave the demo without a
// courier. "Simulated" means provider `fake` AND a synthetic handle (`...@example.invalid`, what the seed uses): a
// fake-provider identity that carries a real handle (a person's number or email put into the demo env) is never
// re-joined here. A STOP from a REAL phone (provider `photon`) is never undone either: that person opted out of messages
// and only their own JOIN may reverse it. The audit event records how many opt-outs were kept.
//
// The deletes and the fake-identity restore commit together. The seed is a separate store call afterwards; if it fails
// the availability windows are stale until the reset is run again (a retry heals it).

/** The seed's synthetic handles end like this; only such identities are re-joined by a reset. */
const SYNTHETIC_HANDLE_SUFFIX = "@example.invalid";

export async function resetDemo(input: { keep_identities: true; actor?: Actor }, deps?: Deps): Promise<Result<{ reset_at: string }>> {
  if (input?.keep_identities !== true) return err("VALIDATION_FAILED", "resetDemo always keeps messaging identities.");
  // The caller must name who is asking, and that must be an operator. (ResetDemoFn in src/contracts has no actor yet; the
  // request docs/requests/dispatch-reset-actor.md asks the captain to add it. Until then a caller that omits it is refused.)
  if (input.actor?.role !== "operator") return err("NOT_AUTHORIZED", "Only an operator can reset the demo.");
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
      .where(and(eq(messaging_identities.status, "opted_out"), eq(messaging_identities.provider, "fake"), sql`lower(${messaging_identities.handle}) like ${"%" + SYNTHETIC_HANDLE_SUFFIX}`))
      .returning({ id: messaging_identities.id });
    // Everything still opted out after the restore: a real phone, or a fake-provider identity whose handle is not synthetic.
    const kept = await tx.select({ id: messaging_identities.id }).from(messaging_identities).where(eq(messaging_identities.status, "opted_out"));
    return {
      links: links.length,
      offers: offerRows.length,
      donations: donationRows.length,
      images: images.length,
      simulated_identities_restored: restored.length,
      opt_outs_kept: kept.length,
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
