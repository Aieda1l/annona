import { z } from "zod";
import { err, ok, type Actor, type Deps, type Result } from "@/contracts";
import { getActor } from "@/server/session";

// Shared pieces of Dev 2's route handlers (CONTRACTS section 10, 3.15). The actor always comes from the signed session
// cookie; a missing session is NOT_AUTHORIZED (403) before anything else is read.

export const DonationId = z.uuid();

/** Responses carry live state that must never be cached by a browser or a proxy. */
export const NO_STORE = { "Cache-Control": "no-store" } as const;

/** What a handler needs from outside; tests inject both, production uses the session cookie and the container. */
export type HandlerOptions = { getActor?: (request: Request) => Promise<Actor | null>; deps?: Deps };

export async function requireActor(request: Request, opts: HandlerOptions): Promise<Result<Actor>> {
  const actor = await (opts.getActor ?? getActor)(request);
  return actor ? ok(actor) : err("NOT_AUTHORIZED", "Please sign in.");
}

/** Reads a JSON body of at most `maxChars` characters. An empty body is `undefined` (the caller decides if that is allowed). */
export async function readJsonBody(request: Request, maxChars: number): Promise<Result<unknown>> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return err("VALIDATION_FAILED", "The request body could not be read.");
  }
  if (text.length > maxChars) return err("VALIDATION_FAILED", "The request body is too large.");
  if (text.trim() === "") return ok(undefined);
  try {
    return ok(JSON.parse(text) as unknown);
  } catch {
    return err("VALIDATION_FAILED", "The request body must be JSON.");
  }
}

/** Parses a body against a strict schema; unknown keys, a missing body and wrong types are VALIDATION_FAILED. */
export async function readStrictBody<T>(request: Request, schema: z.ZodType<T>, maxChars = 4_000): Promise<Result<T>> {
  const body = await readJsonBody(request, maxChars);
  if (!body.ok) return body;
  const parsed = schema.safeParse(body.data);
  if (!parsed.success) {
    return err("VALIDATION_FAILED", "The request body is invalid.", { details: { fields: parsed.error.issues.map((i) => i.path.join(".")).slice(0, 10) } });
  }
  return ok(parsed.data);
}
