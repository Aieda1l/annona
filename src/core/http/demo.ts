import { err } from "@/contracts";
import { toResponse } from "@/server/http";
import { resetDemo } from "../service/demo";
import { NO_STORE, readJsonBody, requireActor, type HandlerOptions } from "./common";

// POST /api/demo/reset (CONTRACTS section 10): operator only, demo mode only (core checks ANNONA_DEMO_MODE).
// The request has no body (Dev 4's client sends none); an empty JSON object is accepted too, anything else is refused.

const isEmptyObject = (v: unknown) => typeof v === "object" && v !== null && !Array.isArray(v) && Object.keys(v).length === 0;

export function createDemoResetHandler(opts: HandlerOptions = {}) {
  return async function POST(request: Request): Promise<Response> {
    const actor = await requireActor(request, opts);
    if (!actor.ok) return toResponse(actor);
    if (actor.data.role !== "operator") return toResponse(err("NOT_AUTHORIZED", "Only an operator can reset the demo."));
    const body = await readJsonBody(request, 64);
    if (!body.ok) return toResponse(body);
    if (body.data !== undefined && !isEmptyObject(body.data)) return toResponse(err("VALIDATION_FAILED", "Demo reset takes no body."));
    return toResponse(await resetDemo({ keep_identities: true, actor: actor.data }, opts.deps), { headers: NO_STORE });
  };
}

export const POST = createDemoResetHandler();
