import { ok, type Actor } from "@/contracts";
import { toResponse } from "@/server/http";
import { getActor } from "@/server/session";
import { tick } from "@/workflows";
import type { TickReport } from "@/workflows/tick";
import { failureResponse, forbidden, hasInternalSecret, internalSecretFromEnv, isOperator } from "./auth";

// POST /api/internal/tick (CONTRACTS §10): the relay worker's internal secret, or an operator session ("Run tick now").

export function createTickHandler(deps: {
  tick: () => Promise<TickReport>;
  getActor: (request: Request) => Promise<Actor | null>;
  internalSecret: () => string | undefined;
}) {
  return async function POST(request: Request): Promise<Response> {
    const allowed = hasInternalSecret(request, deps.internalSecret()) || isOperator(await deps.getActor(request));
    if (!allowed) return forbidden();
    try {
      return toResponse(ok(await deps.tick()));
    } catch (error) {
      return failureResponse("POST /api/internal/tick", error);
    }
  };
}

export const POST = createTickHandler({ tick: () => tick(), getActor, internalSecret: internalSecretFromEnv });
