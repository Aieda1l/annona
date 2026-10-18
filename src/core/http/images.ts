import { err } from "@/contracts";
import { toResponse } from "@/server/http";
import { getDonationImage } from "../service/images";
import { DonationId, requireActor, type HandlerOptions } from "./common";

// GET /api/images/:id (CONTRACTS section 10): the photo bytes, for the owning donor or an operator. Served with the
// stored type only, nosniff and a no-content CSP, so a stored file can never run as a page (see storeDonationImage).

export function createImageHandler(opts: HandlerOptions = {}) {
  return async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
    const actor = await requireActor(request, opts);
    if (!actor.ok) return toResponse(actor);
    const id = DonationId.safeParse((await ctx.params).id);
    if (!id.success) return toResponse(err("NOT_FOUND", "Photo not found."));
    const image = await getDonationImage(actor.data, id.data, opts.deps);
    if (!image.ok) return toResponse(image);
    return new Response(image.data.bytes as Uint8Array<ArrayBuffer>, {
      status: 200,
      headers: {
        "Content-Type": image.data.mime,
        "Content-Length": String(image.data.bytes.length),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, no-store",
      },
    });
  };
}

export const GET = createImageHandler();
