import { err } from "@/contracts";
import { toResponse } from "@/server/http";
import { getDonationCard } from "../service/cards";
import { DonationId, NO_STORE, requireActor, type HandlerOptions } from "./common";

// GET /api/donations/:id (CONTRACTS section 10): the owning donor (reduced card) or an operator (full card).

export function createDonationHandler(opts: HandlerOptions = {}) {
  return async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
    const actor = await requireActor(request, opts);
    if (!actor.ok) return toResponse(actor);
    const id = DonationId.safeParse((await ctx.params).id);
    if (!id.success) return toResponse(err("NOT_FOUND", "Donation not found."));
    return toResponse(await getDonationCard(actor.data, id.data, opts.deps), { headers: NO_STORE });
  };
}

export const GET = createDonationHandler();
