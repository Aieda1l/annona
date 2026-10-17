import { z } from "zod";
import { err, ok, type Actor } from "@/contracts";
import { toResponse } from "@/server/http";
import { getActor } from "@/server/session";
import { dispatchDonation } from "@/workflows";
import type { TickReport } from "@/workflows/tick";
import { failureResponse, forbidden, isOperator } from "./auth";

// POST /api/donations/:id/dispatch (CONTRACTS §10): operator only. The relay's internal secret is not accepted here.

export function createDispatchHandler(deps: {
  dispatchDonation: (donation_id: string) => Promise<TickReport>;
  getActor: (request: Request) => Promise<Actor | null>;
}) {
  return async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
    if (!isOperator(await deps.getActor(request))) return forbidden();

    const id = z.uuid().safeParse((await ctx.params).id);
    if (!id.success) return toResponse(err("VALIDATION_FAILED", "The donation id is not valid."));

    try {
      return toResponse(ok(await deps.dispatchDonation(id.data)));
    } catch (error) {
      return failureResponse("POST /api/donations/:id/dispatch", error);
    }
  };
}

export const POST = createDispatchHandler({ dispatchDonation: (id) => dispatchDonation(id), getActor });
