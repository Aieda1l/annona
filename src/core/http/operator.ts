import { z } from "zod";
import { OperatorAction, err } from "@/contracts";
import { toResponse } from "@/server/http";
import { MAX_NOTE_CHARS, operatorAction } from "../service/operator";
import { DonationId, NO_STORE, readStrictBody, requireActor, type HandlerOptions } from "./common";

// POST /api/donations/:id/operator-actions (CONTRACTS section 10): operator only, body { action, note }.

const Body = z.strictObject({ action: OperatorAction, note: z.string().max(MAX_NOTE_CHARS) });

export function createOperatorActionHandler(opts: HandlerOptions = {}) {
  return async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
    const actor = await requireActor(request, opts);
    if (!actor.ok) return toResponse(actor);
    // Role before body: a non-operator learns nothing about what a valid request looks like.
    if (actor.data.role !== "operator") return toResponse(err("NOT_AUTHORIZED", "Only an operator can do this."));
    const id = DonationId.safeParse((await ctx.params).id);
    if (!id.success) return toResponse(err("NOT_FOUND", "Donation not found."));
    const body = await readStrictBody(request, Body);
    if (!body.ok) return toResponse(body);
    return toResponse(await operatorAction({ actor: actor.data, donation_id: id.data, ...body.data }, opts.deps), { headers: NO_STORE });
  };
}

export const POST = createOperatorActionHandler();
