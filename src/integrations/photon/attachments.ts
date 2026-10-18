// Downloads an inbound photo's exact bytes through the Photon API (prompt §5 photo; R-PH-9, SP-14).
// Measured live: GET /attachments/{id} for metadata, then GET /attachments/{id}/content; both ready on the first try.
// If Photon is not ready it answers 409 ATTACHMENT_NOT_READY with Retry-After. Bytes are returned untouched: no
// conversion, no re-encoding. Failures are reasons, never thrown, and never carry the API key.

const BASE_URL = "https://api.photon.codes";
const MAX_BYTES = 5 * 1024 * 1024; // message photos <= 5 MB (donation_images CHECK)
const MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_MS = 5000; // Photon documents Retry-After: 5
const MAX_RETRY_MS = 10_000; // a huge Retry-After must never park an inbound request
// ASSUMPTION: the content endpoint may hold a request up to ~10 s before answering NOT_READY (OpenAPI), so a
// per-attempt timeout shorter than that would cut off the very answer we are waiting for.
const ATTEMPT_TIMEOUT_MS = 12_000;

export type FetchedImage = { mime: string; bytes: Uint8Array };

export type FetchImageResult =
  | { ok: true; image: FetchedImage }
  | { ok: false; reason: "not_found" | "too_large" | "not_image" | "not_ready" | "unavailable" };

export type AttachmentFetcherOptions = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  baseUrl?: string;
};

const ascii = (bytes: Uint8Array, from: number, to: number): string => String.fromCharCode(...bytes.slice(from, to));

/**
 * The image type named by the file's own first bytes, or null when they are not a type intake knows. Photon's reported
 * type was unconfirmed at the SP-14 spike, and an iPhone HEIC can arrive labelled as something else, so the bytes decide.
 * A prefix check only; core and intake still validate what they are handed.
 */
export function sniffImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && ascii(bytes, 1, 4) === "PNG" && bytes[0] === 0x89) return "image/png";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12);
    if (["heic", "heix", "hevc", "hevx"].includes(brand)) return "image/heic";
    if (["mif1", "msf1", "heif"].includes(brand)) return "image/heif";
  }
  return null;
}

const fail = (reason: Extract<FetchImageResult, { ok: false }>["reason"]): FetchImageResult => ({ ok: false, reason });

export function createAttachmentFetcher(config: { project_id: string; api_key: string }, options: AttachmentFetcherOptions = {}) {
  const doFetch = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const base = `${options.baseUrl ?? BASE_URL}/v1/projects/${config.project_id}/attachments`;
  const request = (url: string) =>
    doFetch(url, { headers: { authorization: `Bearer ${config.api_key}` }, signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS) });

  const retryAfterMs = (response: Response): number => {
    const seconds = Number(response.headers.get("retry-after"));
    return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, MAX_RETRY_MS) : DEFAULT_RETRY_MS;
  };

  return {
    async fetchImage(attachmentId: string): Promise<FetchImageResult> {
      try {
        const url = `${base}/${encodeURIComponent(attachmentId)}`;
        const metaResponse = await request(url);
        if (metaResponse.status === 404) return fail("not_found");
        if (!metaResponse.ok) return fail("unavailable");

        const meta = (await metaResponse.json().catch(() => null)) as { contentType?: unknown; sizeBytes?: unknown } | null;
        const declaredType = typeof meta?.contentType === "string" ? meta.contentType.toLowerCase() : "";
        const size = typeof meta?.sizeBytes === "number" ? meta.sizeBytes : null;
        if (!declaredType.startsWith("image/")) return fail("not_image");
        if (size !== null && size > MAX_BYTES) return fail("too_large");

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
          const response = await request(`${url}/content`);
          if (response.status === 409) {
            if (attempt === MAX_ATTEMPTS) return fail("not_ready");
            await sleep(retryAfterMs(response));
            continue;
          }
          if (!response.ok) return fail("unavailable");

          // Bound the download before buffering it. Metadata usually carries the size; when it does not, the body must
          // vouch for itself with a Content-Length, otherwise it cannot be bounded and is refused.
          const lengthHeader = response.headers.get("content-length");
          const declaredLength = lengthHeader === null ? Number.NaN : Number(lengthHeader);
          if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) return fail("too_large");
          if (size === null && !Number.isFinite(declaredLength)) return fail("unavailable");

          const bytes = new Uint8Array(await response.arrayBuffer());
          if (bytes.length > MAX_BYTES) return fail("too_large");
          if (size !== null && bytes.length !== size) return fail("unavailable"); // truncated or wrong file
          const mime = (response.headers.get("content-type") ?? declaredType).split(";")[0]?.trim().toLowerCase() ?? declaredType;
          // The metadata said image; re-check what was actually served, which is what intake will be handed.
          if (!mime.startsWith("image/")) return fail("not_image");
          return { ok: true, image: { mime: sniffImageMime(bytes) ?? mime, bytes } };
        }
        return fail("not_ready");
      } catch {
        return fail("unavailable"); // network error, abort or timeout
      }
    },
  };
}
