import {
  notImplementedResult,
  type Actor,
  type DonationCard,
  type Result,
  type VerificationLinkView,
} from "@/contracts";

// Server-side barrel owned by Dev 1 after the baseline (keep exported names stable). CONTRACTS §9.2.
// UI components live in ./components (client-safe barrel) and are imported by Dev 4 only from there.

const OWNER = "Dev 1";

export type ImageInput = { mime: string; bytes_base64: string };

export async function createDraftFromImage(_input: {
  actor: Actor;
  image: ImageInput;
  source: "web_upload" | "messaging" | "fixture";
  source_ref?: string;
}): Promise<Result<DonationCard>> {
  return notImplementedResult(OWNER, "createDraftFromImage");
}

export { parseVerifiedFacts } from "./verified-facts";

export async function submitDonorVerification(_input: {
  actor: Actor;
  donation_id: string;
  raw: unknown;
}): Promise<Result<DonationCard>> {
  return notImplementedResult(OWNER, "submitDonorVerification");
}

export async function getLinkVerification(_input: { token: string }): Promise<Result<VerificationLinkView>> {
  return notImplementedResult(OWNER, "getLinkVerification");
}

export async function submitDonorVerificationByLink(_input: {
  token: string;
  raw: unknown;
}): Promise<Result<VerificationLinkView>> {
  return notImplementedResult(OWNER, "submitDonorVerificationByLink");
}
