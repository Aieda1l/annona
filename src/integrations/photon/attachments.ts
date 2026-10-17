// Downloads an inbound photo's exact bytes through the Photon API (prompt §5 photo; R-PH-9, SP-14).
// Measured live: GET /attachments/{id} for metadata, then GET /attachments/{id}/content; both ready on the first try.
// If Photon is not ready it answers 409 ATTACHMENT_NOT_READY with Retry-After. Bytes are returned untouched: no
// conversion, no re-encoding. Failures are reasons, never thrown, and never carry the API key.

const BASE_URL = "https://api.photon.codes";
const MAX_BYTES = 5 * 1024 * 1024; // message photos <= 5 MB (donation_images CHECK)
const MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_MS = 5000; // Photon documents Retry-After: 5
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

const fail = (reason: Extract<FetchImageResult, { ok: false }>["reason"]): FetchImageResult => ({ ok: false, reason });

export function createAttachmentFetcher(config: { project_id: string; api_key: string }, options: AttachmentFetcherOptions = {}) {
  const doFetch = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const base = `${options.baseUrl ?? BASE_URL}/v1/projects/${config.project_id}/attachments`;
  const request = (url: string) =>
    doFetch(url, { headers: { authorization: `Bearer ${config.api_key}` }, signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS) });

  const retryAfterMs = (response: Response): number => {
    const seconds = Number(response.headers.get("retry-after"));
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_RETRY_MS;
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

          const bytes = new Uint8Array(await response.arrayBuffer());
          if (bytes.length > MAX_BYTES) return fail("too_large");
          if (size !== null && bytes.length !== size) return fail("unavailable"); // truncated or wrong file
          const mime = (response.headers.get("content-type") ?? declaredType).split(";")[0]?.trim().toLowerCase() ?? declaredType;
          return { ok: true, image: { mime, bytes } };
        }
        return fail("not_ready");
      } catch {
        return fail("unavailable"); // network error, abort or timeout
      }
    },
  };
}
