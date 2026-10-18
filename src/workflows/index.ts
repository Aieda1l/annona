import {
  type Deps,
  type DeliveryStatusEvent,
  type InboundMessage,
  type InboundResult,
  type TickReport,
} from "@/contracts";
import * as core from "@/core";
import { createDraftFromImage } from "@/features/intake";
import { createAttachmentFetcher } from "@/integrations/photon/attachments";
import { getServices } from "@/server/container";
import { getEnv } from "@/server/env";
import { bindCore } from "./core-binding";
import { createDeliveryHandler } from "./delivery";
import { readFixtureImage } from "./fixtures";
import { createInboundHandler } from "./inbound";
import { createPhotoHandler } from "./photo";
import { createTicker } from "./tick";

// Barrel owned by Dev 3 after the baseline (keep exported names stable). CONTRACTS §9.4.
// Each call wires the handlers over the real core with the caller's `deps` (tests inject them; routes pass none and
// get the composition root). Wiring is cheap and holds no state, so nothing here is cached.

export type { TickReport } from "@/contracts";

function wiring(deps?: Deps) {
  // The composition root is only touched for what the caller did not inject, so a test with full deps builds nothing.
  const clock = deps?.clock ?? getServices().clock;
  const gateway = deps?.messaging ?? getServices().messaging;
  return { clock, gateway, boundCore: bindCore(deps) };
}

/** Donor photos: Photon attachments in real mode, an allowlisted fixture id from the simulated phone otherwise. */
function photoHandler(deps: Deps | undefined, hasOutboundMessage: (key: string) => Promise<boolean>) {
  const env = getEnv();
  const photon =
    env.messaging_provider === "photon" && env.photon_project_id && env.photon_api_key
      ? createAttachmentFetcher({ project_id: env.photon_project_id, api_key: env.photon_api_key })
      : null;
  return createPhotoHandler({
    fetchImage: async (ref) => {
      if (ref.provider_attachment_id && photon) return photon.fetchImage(ref.provider_attachment_id);
      if (ref.fixture_id) return readFixtureImage(ref.fixture_id);
      return { ok: false, reason: "not_found" };
    },
    createDraft: (input) => createDraftFromImage(input, deps),
    issueLink: (input) => core.issueVerificationLink(input, deps),
    hasOutboundMessage,
    appBaseUrl: () => getEnv().app_base_url,
    demoMode: () => getEnv().demo_mode,
  });
}

/** Same path for real Photon messages and simulated-phone messages, including donor photos. */
export async function handleInbound(msg: InboundMessage, deps?: Deps): Promise<InboundResult> {
  const { gateway, boundCore } = wiring(deps);
  const handler = createInboundHandler({
    core: boundCore,
    gateway,
    photo: photoHandler(deps, boundCore.hasOutboundMessage),
  });
  return handler(msg);
}

export async function handleDeliveryStatus(evt: DeliveryStatusEvent, deps?: Deps): Promise<void> {
  const { boundCore } = wiring(deps);
  await createDeliveryHandler({ core: boundCore })(evt);
}

export async function tick(deps?: Deps): Promise<TickReport> {
  const { gateway, clock, boundCore } = wiring(deps);
  return createTicker({ core: boundCore, gateway, clock }).tick();
}

/** Used only by the operator's "Dispatch now" button. */
export async function dispatchDonation(donation_id: string, deps?: Deps): Promise<TickReport> {
  const { gateway, clock, boundCore } = wiring(deps);
  return createTicker({ core: boundCore, gateway, clock }).dispatchDonation(donation_id);
}

export { formatDraftReadyMessage, formatOfferMessage } from "./templates";
