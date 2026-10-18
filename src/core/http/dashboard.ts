import { toResponse } from "@/server/http";
import { getDashboardSnapshot } from "../service/dashboard";
import { NO_STORE, requireActor, type HandlerOptions } from "./common";

// GET /api/dashboard (CONTRACTS section 10): operator only. Dev 4 polls it every 2 s.

export function createDashboardHandler(opts: HandlerOptions = {}) {
  return async function GET(request: Request): Promise<Response> {
    const actor = await requireActor(request, opts);
    if (!actor.ok) return toResponse(actor);
    return toResponse(await getDashboardSnapshot(actor.data, opts.deps), { headers: NO_STORE });
  };
}

export const GET = createDashboardHandler();
