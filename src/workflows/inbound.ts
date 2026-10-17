import type {
  ClaimCommand,
  InboundMessage,
  InboundResult,
  MessagingGateway,
  MessagePurpose,
  OutboundMessage,
} from "@/contracts";
import type { IdentityView, MessagingCore } from "./core-port";
import { parseCommand, type ParsedCommand } from "./grammar";
import { createOutboundSender } from "./outbound";
import {
  askForCodeText,
  declineAckText,
  formatClaimReply,
  genericNoAssignmentText,
  helpText,
  joinAckText,
  stopAckText,
} from "./templates";

// The one inbound path for real Photon messages and simulated-phone messages (CONTRACTS §9.4).
// Order matters for safety (prompt §5): record -> dedupe -> resolve identity -> parse -> act -> reply once -> save.

/** Handles in logs show only their last 4 characters (CONTRACTS §3.11). */
const maskHandle = (handle: string): string => `…${handle.trim().slice(-4)}`;

export function createInboundHandler(deps: { core: MessagingCore; gateway: MessagingGateway }) {
  const { core, gateway } = deps;
  const send = createOutboundSender({ core, gateway });

  /** Sends at most one reply per inbound message, keyed so a reprocessed message never sends twice. */
  async function reply(
    identity: IdentityView,
    msg: InboundMessage,
    purpose: MessagePurpose,
    text: string,
  ): Promise<OutboundMessage> {
    const message: OutboundMessage = {
      to_identity_id: identity.id,
      text,
      purpose,
      correlation: { inbound_message_id: msg.provider_message_id },
      idempotency_key: `reply:${msg.provider_message_id}:v1`,
    };
    if (!(await core.hasOutboundMessage(message.idempotency_key))) await send(message);
    return message;
  }

  async function offerRef(identity: IdentityView, short_code: string | null): Promise<ClaimCommand["offer_ref"] | null> {
    if (short_code !== null) return { short_code };
    const open = await core.findOpenOffersForCourier(identity.actor_id);
    return open.length === 1 && open[0] ? { offer_id: open[0].offer_id } : null;
  }

  async function process(msg: InboundMessage, parsed: ParsedCommand): Promise<InboundResult> {
    const identity = await core.resolveIdentityByHandle(msg.provider, msg.sender_handle);
    const ignore = (reason: "unknown_sender" | "not_joined") =>
      core.recordIgnoredInbound({
        provider: msg.provider,
        provider_message_id: msg.provider_message_id,
        reason,
        handle_masked: maskHandle(msg.sender_handle),
      });

    if (identity === null) {
      await ignore("unknown_sender");
      return { outcome: "ignored", command: parsed.command, reply: null };
    }
    if (identity.status !== "joined" && parsed.command !== "join") {
      await ignore("not_joined");
      return { outcome: "rejected", command: parsed.command, reply: null };
    }

    // An image only means "photo" from a donor; from anyone else it is an unknown command (CONTRACTS §3.10).
    const command = parsed.command === "photo" && identity.actor_role !== "donor" ? "unknown" : parsed.command;

    switch (command) {
      case "join": {
        const joined = await core.joinIdentity({
          identity_id: identity.id,
          provider_space_id: msg.provider_space_id,
          provider_sender_id: msg.provider_line_sender_id,
        });
        // Throwing leaves the inbound row unfinished, so Photon's retry (or the 30 s reclaim, D-029) reprocesses it.
        if (!joined.ok) throw new Error(`core could not apply JOIN: ${joined.error.code}`);
        return { outcome: "processed", command, reply: await reply(identity, msg, "join_ack", joinAckText()) };
      }
      case "stop": {
        const optedOut = await core.optOutIdentity({ identity_id: identity.id });
        if (!optedOut.ok) throw new Error(`core could not apply STOP (opt out): ${optedOut.error.code}`);
        return { outcome: "processed", command, reply: await reply(identity, msg, "stop_ack", stopAckText()) };
      }
      case "accept":
      case "decline": {
        const ref = await offerRef(identity, parsed.short_code);
        if (ref === null) {
          return { outcome: "processed", command, reply: await reply(identity, msg, "help", askForCodeText()) };
        }
        const cmd: ClaimCommand = {
          offer_ref: ref,
          actor: { role: identity.actor_role, id: identity.actor_id },
          source: msg.provider === "fake" ? "simulated_messaging" : "messaging",
          source_event_id: msg.provider_message_id,
        };
        if (command === "accept") {
          const claim_result = await core.claimOffer(cmd);
          const refused = claim_result.code === "not_authorized" || claim_result.code === "offer_not_found";
          const text = refused ? genericNoAssignmentText() : formatClaimReply(claim_result);
          return {
            outcome: refused ? "rejected" : "processed",
            command,
            claim_result,
            reply: await reply(identity, msg, "claim_result", text),
          };
        }
        const decline_result = await core.declineOffer(cmd);
        const refused = decline_result.code === "not_authorized" || decline_result.code === "offer_not_found";
        const acknowledged = decline_result.code === "declined" || decline_result.code === "already_declined";
        const text = refused
          ? genericNoAssignmentText()
          : acknowledged
            ? declineAckText()
            : decline_result.message_for_actor;
        return {
          outcome: refused ? "rejected" : "processed",
          command,
          decline_result,
          reply: await reply(identity, msg, "decline_ack", text),
        };
      }
      case "photo":
        // Donor photo intake (download, Dev 1 draft, checklist link) lands in slice 2 (T-MS-18).
        return { outcome: "ignored", command, reply: null };
      default:
        return { outcome: "processed", command, reply: await reply(identity, msg, "help", helpText()) };
    }
  }

  return async function handleInbound(msg: InboundMessage): Promise<InboundResult> {
    const recorded = await core.recordInboundMessage(msg.provider, msg.provider_message_id, msg);
    if (recorded.status === "duplicate") {
      // Return the stored first result without sending anything; an unfinished first delivery has none yet.
      return recorded.stored_result
        ? { ...recorded.stored_result, outcome: "duplicate", reply: null }
        : { outcome: "duplicate", command: "unknown", reply: null };
    }

    const result = await process(msg, parseCommand(msg));
    await core.saveInboundResult({ provider: msg.provider, provider_message_id: msg.provider_message_id, result });
    return result;
  };
}
