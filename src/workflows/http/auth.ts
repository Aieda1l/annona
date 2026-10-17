import { createHash, timingSafeEqual } from "node:crypto";
import { err, type Actor } from "@/contracts";
import { getEnv } from "@/server/env";
import { notImplemented, toResponse } from "@/server/http";

// Shared request checks for my route handlers (CONTRACTS §10, ARCHITECTURE §9): authenticate first, reject with 403.

export const INTERNAL_SECRET_HEADER = "x-annona-internal-secret";

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Constant-time compare. A missing or empty configured secret rejects everything. */
export function hasInternalSecret(request: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const presented = request.headers.get(INTERNAL_SECRET_HEADER);
  if (!presented) return false;
  return timingSafeEqual(digest(presented), digest(secret));
}

export const isOperator = (actor: Actor | null): boolean => actor?.role === "operator";

export const forbidden = (): Response => toResponse(err("NOT_AUTHORIZED", "Not allowed."));

/**
 * ANNONA_INTERNAL_SECRET is not in getEnv() yet (captain request: docs/requests/messaging-env-names.md). Until the
 * captain adds `internal_secret`, this returns undefined and the internal-secret path stays closed, which is safe.
 */
export function internalSecretFromEnv(): string | undefined {
  return (getEnv() as unknown as { internal_secret?: string }).internal_secret;
}

/** 501 while a lane function is still a stub; otherwise a generic 500 that never echoes the error to the caller. */
export function failureResponse(route: string, error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("NOT_IMPLEMENTED")) return notImplemented(route, "Dev 3");
  console.error(`[${route}] failed:`, message);
  return toResponse(err("INTERNAL", "The request could not be completed.", { retryable: true }));
}
