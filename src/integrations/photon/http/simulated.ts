import { randomUUID } from "node:crypto";
import { z } from "zod";
import { err, ok, SimulatedInboundRequestBody, type Actor, type Clock, type InboundMessage, type InboundResult } from "@/contracts";
import { getIdentity, listMessages } from "@/core";
import { getServices } from "@/server/container";
import { getEnv } from "@/server/env";
import { toResponse } from "@/server/http";
import { getActor } from "@/server/session";
import { handleInbound } from "@/workflows";
import { identityFromCore } from "@/workflows/core-adapter";
import type { IdentityView } from "@/workflows/core-port";
import { isFixtureId } from "@/workflows/fixtures";
import { failureResponse, forbidden, isOperator } from "@/workflows/http/auth";

// The labeled simulated phone (CONTRACTS §10): POST sends a message as a fake-provider identity through the SAME
// handleInbound as real Photon messages; GET returns that identity's thread. Operator + demo mode + fake provider only.

export function createSimulatedHandlers(deps: {
  getActor: (request: Request) => Promise<Actor | null>;
  config: () => { demo_mode: boolean; messaging_provider: "fake" | "photon" };
  clock: Clock;
  core: {
    getIdentity: (identity_id: string) => Promise<IdentityView | null>;
    listMessages: (input: { identity_id?: string }) => Promise<unknown[]>;
  };
  handleInbound: (message: InboundMessage) => Promise<InboundResult>;
  newId: () => string;
}) {
  async function allowed(request: Request): Promise<boolean> {
    const { demo_mode, messaging_provider } = deps.config();
    if (!demo_mode || messaging_provider !== "fake") return false;
    return isOperator(await deps.getActor(request));
  }

  return {
    async POST(request: Request): Promise<Response> {
      if (!(await allowed(request))) return forbidden();

      let raw: unknown;
      try {
        raw = JSON.parse(await request.text());
      } catch {
        return toResponse(err("VALIDATION_FAILED", "Body is not valid JSON."));
      }
      const body = SimulatedInboundRequestBody.safeParse(raw);
      if (!body.success) return toResponse(err("VALIDATION_FAILED", "Body must be { identity_id, text, fixture_id? }."));
      const fixture = body.data.fixture_id;
      // An unknown id is a 400, so a path can never get through (the allowlist is shared with the fixture reader).
      if (fixture !== undefined && !isFixtureId(fixture)) {
        return toResponse(err("VALIDATION_FAILED", "Unknown fixture_id."));
      }

      try {
        const identity = await deps.core.getIdentity(body.data.identity_id);
        if (identity === null) return toResponse(err("NOT_FOUND", "No such identity."));
        // The simulated phone may only speak as a fake-provider identity, never as a real Photon one.
        if (identity.provider !== "fake") return forbidden();

        const message: InboundMessage = {
          provider: "fake",
          provider_message_id: `fake_${deps.newId()}`,
          provider_event_id: null,
          received_at: deps.clock.now().toISOString(),
          sender_handle: identity.handle,
          provider_space_id: null,
          provider_line_sender_id: null,
          text: body.data.text === "" ? null : body.data.text,
          attachments: fixture === undefined ? [] : [{ kind: "image", fixture_id: fixture }],
        };
        return toResponse(ok(await deps.handleInbound(message)));
      } catch (error) {
        return failureResponse("POST /api/messaging/simulated/inbound", error);
      }
    },

    async GET(request: Request): Promise<Response> {
      if (!(await allowed(request))) return forbidden();

      const identity_id = z.uuid().safeParse(new URL(request.url).searchParams.get("identity_id"));
      if (!identity_id.success) return toResponse(err("VALIDATION_FAILED", "identity_id is required."));

      try {
        // Same rule as POST: the simulated phone only ever shows fake-provider identities, never a real teammate's thread.
        const identity = await deps.core.getIdentity(identity_id.data);
        if (identity === null) return toResponse(err("NOT_FOUND", "No such identity."));
        if (identity.provider !== "fake") return forbidden();
        return toResponse(ok({ messages: await deps.core.listMessages({ identity_id: identity_id.data }) }));
      } catch (error) {
        return failureResponse("GET /api/messaging/simulated/thread", error);
      }
    },
  };
}

const handlers = createSimulatedHandlers({
  getActor,
  config: () => {
    const env = getEnv();
    return { demo_mode: env.demo_mode, messaging_provider: env.messaging_provider };
  },
  clock: { now: () => getServices().clock.now() },
  core: {
    getIdentity: async (id) => identityFromCore(await getIdentity(id)),
    listMessages: (input) => listMessages(input),
  },
  handleInbound: (message) => handleInbound(message),
  newId: randomUUID,
});

export const POST = handlers.POST;
export const GET = handlers.GET;
