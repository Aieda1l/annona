import { z } from "zod";
import { err } from "@/contracts";
import { toResponse } from "@/server/http";
import { submitDonorVerification } from "../index";
import { readJson, requireDonor } from "./common";

// POST /api/donations/:id/verification (CONTRACTS §10). Owning donor only (ownership is enforced by core).
// The raw body goes to the service, which parses it strictly; this handler never trusts or inspects facts.
// It returns the card and never triggers dispatch (D-021).

const MAX_BODY_CHARS = 64_000;
const DonationId = z.uuid();

export function createVerificationHandler(deps: { submitDonorVerification: typeof submitDonorVerification }) {
  return async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
    const actor = await requireDonor(request);
    if (!actor.ok) return toResponse(actor);

    const id = DonationId.safeParse((await ctx.params).id);
    if (!id.success) return toResponse(err("VALIDATION_FAILED", "Donation id must be a UUID."));

    const json = await readJson(request, MAX_BODY_CHARS);
    if (!json.ok) return toResponse(json);

    return toResponse(await deps.submitDonorVerification({ actor: actor.data, donation_id: id.data, raw: json.data }));
  };
}

export const POST = createVerificationHandler({ submitDonorVerification });
