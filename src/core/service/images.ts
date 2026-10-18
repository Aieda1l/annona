import { eq } from "drizzle-orm";
import { err, ok, type Actor, type Deps, type Result } from "@/contracts";
import { donation_images, donations } from "@/db/schema";
import { isUuid } from "./map";
import { runtime } from "./runtime";

// GET /api/images/:id (CONTRACTS section 10, 11): the owning donor or an operator. Lane-internal; the handler in
// ../http/images is its only caller. Verification-link access to the photo is getVerificationLinkImage (slice 2(d)).

const NO = "You can't view this photo.";

export async function getDonationImage(actor: Actor, image_id: string, deps?: Deps): Promise<Result<{ mime: string; bytes: Uint8Array }>> {
  if (actor?.role !== "operator" && actor?.role !== "donor") return err("NOT_AUTHORIZED", NO);
  if (!isUuid(image_id)) return err("NOT_FOUND", "Photo not found.");
  const { db } = await runtime(deps);
  const [image] = await db.select().from(donation_images).where(eq(donation_images.id, image_id));
  if (!image) return err("NOT_FOUND", "Photo not found.");
  if (actor.role === "donor") {
    // A photo belongs to the donor of the donation that uses it; a photo no donation uses yet is operator-only.
    const owners = await db.select({ donor_id: donations.donor_id }).from(donations).where(eq(donations.image_id, image_id));
    if (actor.id === null || !owners.some((o) => o.donor_id === actor.id)) return err("NOT_AUTHORIZED", NO);
  }
  return ok({ mime: image.mime, bytes: image.bytes });
}
