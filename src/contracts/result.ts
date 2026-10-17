import type { ErrorCode } from "./enums";

export { ERROR_CODES, ErrorCode } from "./enums";

/** CONTRACTS §3.15 */
export type ResultError = {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
};
export type Result<T> = { ok: true; data: T } | { ok: false; error: ResultError };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err<T = never>(
  code: ErrorCode,
  message: string,
  opts: { details?: Record<string, unknown>; retryable?: boolean } = {},
): Result<T> {
  return {
    ok: false,
    error: { code, message, retryable: opts.retryable ?? false, ...(opts.details ? { details: opts.details } : {}) },
  };
}

/** CONTRACTS §3.15 HTTP status mapping. Claim and decline outcomes are not errors (200). */
export const HTTP_STATUS_BY_ERROR_CODE = {
  VALIDATION_FAILED: 400,
  NOT_AUTHORIZED: 403,
  NOT_FOUND: 404,
  INVALID_TRANSITION: 409,
  CONFLICT: 409,
  DUPLICATE_EVENT: 409,
  RATE_LIMITED: 429,
  AI_OUTPUT_INVALID: 502,
  PROVIDER_UNAVAILABLE: 502,
  NOT_IMPLEMENTED: 501,
  INTERNAL: 500,
} as const satisfies Record<ErrorCode, number>;

/** Typed stub result for lane barrels at baseline (CONTRACTS §9.0). */
export function notImplementedResult<T = never>(owner: string, name: string): Result<T> {
  return err("NOT_IMPLEMENTED", `${name} is not implemented yet (owner ${owner})`);
}

/** Stub for functions whose return type is not a Result. */
export function notImplementedError(owner: string, name: string): Error {
  return new Error(`NOT_IMPLEMENTED (owner ${owner}): ${name}`);
}
