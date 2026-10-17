import { z } from "zod";
import { err, ok, type Clock, type DeliveryStatusEvent, type InboundMessage, type Result } from "@/contracts";

// Photon 2.0 webhook envelope -> Annona payloads (CONTRACTS §3.10, R-PH-8).
// Envelope per Photon's published schema: { id, type, apiVersion, source, timestamp, data: { projectId, object } }.
// Photon bodies are parsed loosely (extra fields allowed). Time comes from the injected Clock, never the payload.
// This module must not import @/server/container: the container imports this barrel (import cycle).

const SYSTEM_CLOCK: Clock = { now: () => new Date() };

const Envelope = z.looseObject({
  id: z.string().min(1),
  type: z.string().min(1),
  data: z.looseObject({ object: z.unknown() }).optional(),
});

const Person = z.looseObject({ handle: z.string() });

const MessageObject = z.looseObject({
  id: z.string().min(1),
  platform: z.string().optional(),
  content: z.looseObject({ type: z.string() }).optional(),
  sentBy: Person.optional(),
  receivedBy: z.looseObject({ id: z.string().optional() }).optional(),
  space: z.looseObject({ id: z.string().optional() }).optional(),
  failure: z.looseObject({ code: z.string().optional() }).optional(),
});

const STATUS_BY_TYPE = {
  "message.accepted": "accepted",
  "message.delivered": "delivered",
  "message.failed": "failed",
} as const;

type Normalized = InboundMessage | DeliveryStatusEvent | { ignored: true };

const IGNORED: Result<Normalized> = ok({ ignored: true });

const invalid = (message: string) => err<Normalized>("VALIDATION_FAILED", message);

/** Trimmed; emails are lowercased so identity lookup is stable. */
function normalizeHandle(handle: string): string {
  const trimmed = handle.trim();
  return trimmed.includes("@") ? trimmed.toLowerCase() : trimmed;
}

export function normalizePhotonEvent(raw: unknown, deps?: { clock?: Clock }): Result<Normalized> {
  const envelope = Envelope.safeParse(raw);
  if (!envelope.success) return invalid("Photon event is not a valid envelope");
  const { id: eventId, type } = envelope.data;

  const isReceived = type === "message.received";
  const status = STATUS_BY_TYPE[type as keyof typeof STATUS_BY_TYPE];
  if (!isReceived && status === undefined) return IGNORED; // dispatched, space, call and every other event type

  const object = MessageObject.safeParse(envelope.data.data?.object);
  if (!object.success) return invalid(`Photon ${type} has no valid data.object`);
  const message = object.data;
  if (message.platform !== "imessage") return IGNORED;

  const at = (deps?.clock ?? SYSTEM_CLOCK).now().toISOString();

  if (!isReceived) {
    return ok({
      provider: "photon",
      provider_event_id: eventId,
      provider_message_id: message.id,
      status,
      failure_code: status === "failed" ? (message.failure?.code ?? null) : null,
      at,
    });
  }

  const handle = message.sentBy === undefined ? "" : normalizeHandle(message.sentBy.handle);
  if (handle === "") return invalid("Photon message.received has no sender handle");

  const content = message.content;
  let text: string | null = null;
  let attachments: InboundMessage["attachments"] = [];
  if (content?.type === "text" && typeof content.text === "string") {
    text = content.text;
  } else if (content?.type === "attachment" && typeof content.attachmentId === "string") {
    // MIME is only known after GET /attachments/{id}; bytes are fetched later, and only for a joined donor.
    attachments = [{ kind: "image", provider_attachment_id: content.attachmentId, mime: null }];
  } else {
    return IGNORED; // reactions, typing, groups and other content we do not act on
  }

  return ok({
    provider: "photon",
    provider_message_id: message.id,
    provider_event_id: eventId,
    received_at: at,
    sender_handle: handle,
    provider_space_id: message.space?.id ?? null,
    provider_line_sender_id: message.receivedBy?.id ?? null,
    text,
    attachments,
  });
}
