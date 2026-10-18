import { z } from "zod";
import { err, type Result } from "@/contracts";
import { toResponse } from "@/server/http";
import { getLinkVerification, getLinkVerificationImage, submitDonorVerificationByLink } from "../index";
import { readJson } from "./common";
import { clientKey, createRateLimiter, type RateLimiter } from "./rate-limit";

// POST /api/verify/{view,image,submit} (CONTRACTS section 8.4, 10). The token is the only authority: no session is
// read, no cookie is set. Every response is no-store and no-referrer. Invalid, expired, used or revoked tokens all
// return the same 403 with the same message, so a response never reveals why. The token is never logged or echoed.

const UNIFORM_MESSAGE = "This link has expired or was already used. Text the photo again for a new link.";
const HEADERS = { "cache-control": "no-store", "referrer-policy": "no-referrer" } as const;
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const MAX_TOKEN_BODY_CHARS = 2_000;
const MAX_SUBMIT_BODY_CHARS = 66_000;

const Token = z.string().min(1).max(512);
const TokenBody = z.strictObject({ token: Token });
const SubmitBody = z.strictObject({ token: Token, facts: z.record(z.string(), z.unknown()) });

/** Every token failure looks the same; other errors pass through unchanged. */
function uniform<T>(result: Result<T>): Result<T> {
  if (!result.ok && (result.error.code === "NOT_AUTHORIZED" || result.error.code === "NOT_FOUND")) {
    return err("NOT_AUTHORIZED", UNIFORM_MESSAGE);
  }
  return result;
}

const respond = <T>(result: Result<T>) => toResponse(uniform(result), { headers: HEADERS });

type Deps = {
  getLinkVerification: typeof getLinkVerification;
  getLinkVerificationImage: typeof getLinkVerificationImage;
  submitDonorVerificationByLink: typeof submitDonorVerificationByLink;
  /** Defaults to 60 requests per minute per client across the three routes. */
  allow?: RateLimiter;
};

export function createVerifyHandlers(deps: Deps) {
  const allow = deps.allow ?? createRateLimiter({ limit: 60, windowMs: 60_000 });
  // Checked before the body is read or core is called, so a flood writes no link.rejected rows.
  const limited = (request: Request) =>
    allow(clientKey(request))
      ? null
      : toResponse(err("RATE_LIMITED", "Too many requests. Please wait a minute and try again.", { retryable: true }), {
          headers: { ...HEADERS, "retry-after": "60" },
        });

  async function parse<S extends z.ZodType>(request: Request, schema: S, max: number): Promise<Result<z.infer<S>>> {
    const json = await readJson(request, max);
    if (!json.ok) return json;
    const parsed = schema.safeParse(json.data);
    return parsed.success ? { ok: true, data: parsed.data } : err("VALIDATION_FAILED", "Request body is not valid.");
  }

  return {
    /** Never consumes the link. */
    async VIEW(request: Request): Promise<Response> {
      const slow = limited(request);
      if (slow) return slow;
      const body = await parse(request, TokenBody, MAX_TOKEN_BODY_CHARS);
      if (!body.ok) return respond(body);
      return respond(await deps.getLinkVerification({ token: body.data.token }));
    },

    async IMAGE(request: Request): Promise<Response> {
      const slow = limited(request);
      if (slow) return slow;
      const body = await parse(request, TokenBody, MAX_TOKEN_BODY_CHARS);
      if (!body.ok) return respond(body);
      const image = uniform(await deps.getLinkVerificationImage({ token: body.data.token }));
      if (!image.ok) return toResponse(image, { headers: HEADERS });
      if (!IMAGE_MIMES.has(image.data.mime)) return respond(err("INTERNAL", "The stored image cannot be served."));
      return new Response(new Blob([image.data.bytes as BlobPart]), {
        status: 200,
        headers: { ...HEADERS, "content-type": image.data.mime, "x-content-type-options": "nosniff" },
      });
    },

    /** The service parses the facts strictly before any core call. */
    async SUBMIT(request: Request): Promise<Response> {
      const slow = limited(request);
      if (slow) return slow;
      const body = await parse(request, SubmitBody, MAX_SUBMIT_BODY_CHARS);
      if (!body.ok) return respond(body);
      return respond(await deps.submitDonorVerificationByLink({ token: body.data.token, raw: body.data.facts }));
    },
  };
}

export const { VIEW, IMAGE, SUBMIT } = createVerifyHandlers({
  getLinkVerification,
  getLinkVerificationImage,
  submitDonorVerificationByLink,
});
