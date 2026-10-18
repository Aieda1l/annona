import { z } from "zod";
import { HandoffStep, err } from "@/contracts";
import { toResponse } from "@/server/http";
import { recordHandoff } from "../service/handoff";
import { DonationId, NO_STORE, readStrictBody, requireActor, type HandlerOptions } from "./common";

// POST /api/donations/:id/handoff (CONTRACTS section 10): body { step }. Always recorded as simulated; the client
// cannot choose otherwise. Core checks who may record which step (claiming courier, assigned recipient, operator).

const Body = z.strictObject({ step: HandoffStep });

export function createHandoffHandler(opts: HandlerOptions = {}) {
  return async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
    const actor = await requireActor(request, opts);
    if (!actor.ok) return toResponse(actor);
    const id = DonationId.safeParse((await ctx.params).id);
    if (!id.success) return toResponse(err("NOT_FOUND", "Donation not found."));
    const body = await readStrictBody(request, Body);
    if (!body.ok) return toResponse(body);
    const result = await recordHandoff({ actor: actor.data, donation_id: id.data, step: body.data.step, simulated: true }, opts.deps);
    return toResponse(result, { headers: NO_STORE });
  };
}

export const POST = createHandoffHandler();
