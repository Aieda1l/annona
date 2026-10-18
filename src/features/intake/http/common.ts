import { err, type Actor, type Result } from "@/contracts";
import { getActor } from "@/server/session";

// Shared request helpers for the intake handlers. Nothing here logs request bodies, tokens or images.

/** The signed session's donor, or a NOT_AUTHORIZED error. The actor never comes from the request body. */
export async function requireDonor(request: Request): Promise<Result<Actor>> {
  const actor = await getActor(request);
  if (!actor || actor.role !== "donor") return err("NOT_AUTHORIZED", "Not authorized.");
  return { ok: true, data: actor };
}

/** Read and parse a JSON body, rejecting anything over `maxChars` before parsing. */
export async function readJson(request: Request, maxChars: number): Promise<Result<unknown>> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxChars) return err("VALIDATION_FAILED", "Request body is too large.");
  let text: string;
  try {
    text = await request.text();
  } catch {
    return err("VALIDATION_FAILED", "Request body could not be read.");
  }
  if (text.length > maxChars) return err("VALIDATION_FAILED", "Request body is too large.");
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return err("VALIDATION_FAILED", "Request body must be JSON.");
  }
}
