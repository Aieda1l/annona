import { err, ok, type Result } from "@/contracts";

// Validates a donor image before any store or AI call (CONTRACTS §9.2 createDraftFromImage).
// Checks the declared MIME type, the base64 shape and the decoded size. It does not inspect image content.

export type ImageSource = "web_upload" | "messaging" | "fixture";

/**
 * HEIC/HEIF are accepted only from messaging, and only while this is true. Flipped to true in a reviewed PR citing
 * SP-14 (docs/handoffs/dev-1.md): a Photon-downloaded HEIC, unchanged, was accepted and parsed by Gemini. Core's
 * storeDonationImage has its own allowlist (docs/requests/intake-heic-core-allowlist.md). No HEIC conversion in P0.
 */
export const HEIC_ACCEPTED = true;

export const MAX_WEB_BYTES = 1.5 * 1024 * 1024; // web_upload and fixture, after client-side downscale
export const MAX_MESSAGING_BYTES = 5 * 1024 * 1024; // messaging, no server-side resize in P0

const COMMON_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const HEIC_MIMES = new Set(["image/heic", "image/heif"]);

export type ValidatedImage = { mime: string; decoded_bytes: number };

export function validateImage(
  image: { mime: string; bytes_base64: string },
  source: ImageSource,
  opts: { heicAccepted?: boolean } = {},
): Result<ValidatedImage> {
  if (!image || typeof image.mime !== "string" || typeof image.bytes_base64 !== "string") {
    return err("VALIDATION_FAILED", "Image must have a mime string and a base64 string", {
      details: { field: "image" },
    });
  }

  const mime = (image.mime.split(";")[0] ?? "").trim().toLowerCase();
  const heicOk = (opts.heicAccepted ?? HEIC_ACCEPTED) && source === "messaging";
  if (!COMMON_MIMES.has(mime) && !(heicOk && HEIC_MIMES.has(mime))) {
    return err("VALIDATION_FAILED", "Unsupported image type", { details: { field: "image.mime" } });
  }

  const max = source === "messaging" ? MAX_MESSAGING_BYTES : MAX_WEB_BYTES;
  const b64 = image.bytes_base64;
  // Reject oversize on length alone, before scanning the string.
  if (b64.length > Math.ceil(max / 3) * 4) {
    return err("VALIDATION_FAILED", "Image is too large", { details: { field: "image.bytes_base64", max_bytes: max } });
  }
  // Canonical round-trip: bad characters, whitespace, padding or length all change the re-encoded string.
  const bytes = Buffer.from(b64, "base64");
  if (bytes.length === 0 || bytes.toString("base64") !== b64) {
    return err("VALIDATION_FAILED", "Image data is not valid base64", { details: { field: "image.bytes_base64" } });
  }
  const decoded = bytes.length;
  if (decoded > max) {
    return err("VALIDATION_FAILED", "Image is too large", { details: { field: "image.bytes_base64", max_bytes: max } });
  }
  return ok({ mime, decoded_bytes: decoded });
}
