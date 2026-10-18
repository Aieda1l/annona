import * as core from "@/core";
import {
  type Actor,
  type Deps,
  type DonationCard,
  type Result,
  type VerificationLinkView,
} from "@/contracts";
import { getServices } from "@/server/container";
import { createIntakeService } from "./service";

// Server-side barrel owned by Dev 1 after the baseline (keep exported names stable). CONTRACTS §9.2.
// UI components live in ./components (client-safe barrel) and are imported by Dev 4 only from there.

export type ImageInput = { mime: string; bytes_base64: string };

// Bound to the real core and the composition root's vision provider. Core functions are stubs until
// Dev 2's sub-PR 2(a) merges, so these return NOT_IMPLEMENTED from core until then.
function service(deps?: Deps) {
  return createIntakeService({ core, vision: deps?.vision ?? getServices().vision });
}

export async function createDraftFromImage(
  input: { actor: Actor; image: ImageInput; source: "web_upload" | "messaging" | "fixture"; source_ref?: string },
  deps?: Deps,
): Promise<Result<DonationCard>> {
  return service(deps).createDraftFromImage(input, deps);
}

export { parseVerifiedFacts } from "./verified-facts";

export async function submitDonorVerification(
  input: { actor: Actor; donation_id: string; raw: unknown },
  deps?: Deps,
): Promise<Result<DonationCard>> {
  return service(deps).submitDonorVerification(input, deps);
}

export async function getLinkVerification(input: { token: string }, deps?: Deps): Promise<Result<VerificationLinkView>> {
  return service(deps).getLinkVerification(input, deps);
}

export async function getLinkVerificationImage(
  input: { token: string },
  deps?: Deps,
): Promise<Result<{ mime: string; bytes: Uint8Array }>> {
  return service(deps).getLinkVerificationImage(input, deps);
}

export async function submitDonorVerificationByLink(
  input: { token: string; raw: unknown },
  deps?: Deps,
): Promise<Result<VerificationLinkView>> {
  return service(deps).submitDonorVerificationByLink(input, deps);
}
