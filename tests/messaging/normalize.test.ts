import { describe, expect, it } from "vitest";
import { normalizePhotonEvent } from "@/integrations/photon/normalize";

// T-MS-14 (normalize part): Photon 2.0 envelope -> InboundMessage | DeliveryStatusEvent | ignored.
// Envelope shape follows Photon's published webhook schema (apiVersion 2026-07-01, source imessage.photon);
// data.object follows the real message records seen from GET /messages (docs/handoffs/dev-3.md).
// A real webhook delivery has NOT been observed: the envelope fixtures here are schema-derived (UNVERIFIED live).
// Handles are synthetic @example.invalid emails (ARCHITECTURE §9).

const SERVER_NOW = new Date("2026-10-17T21:00:00.000Z");
const deps = { clock: { now: () => SERVER_NOW } };

const person = (id: string, handle: string, kind: "human" | "agent") => ({
  id,
  handle,
  kind,
  details: {},
  metadata: {},
  platform: "imessage",
  projectId: "pho_prj_test",
});

const messageObject = (status: string, over: Record<string, unknown> = {}) => ({
  id: "pho_msg_test1",
  platform: "imessage",
  projectId: "pho_prj_test",
  status,
  metadata: {},
  createdAt: "2026-10-17T20:59:00.000Z",
  updatedAt: "2026-10-17T20:59:00.000Z",
  content: { type: "text", format: "plain", text: "YES K7M3" },
  sentBy: person("pho_usr_courier", "courier@example.invalid", "human"),
  receivedBy: person("pho_usr_line", "line@example.invalid", "agent"),
  space: { id: "pho_spc_test1", kind: "direct", participantIds: [], details: {}, metadata: {}, platform: "imessage" },
  timestamps: { receivedAt: "2026-10-17T20:59:00.000Z" },
  ...over,
});

const envelope = (type: string, object: unknown, over: Record<string, unknown> = {}) => ({
  id: "evt_test1",
  type,
  apiVersion: "2026-07-01",
  source: "imessage.photon",
  timestamp: "2026-10-17T20:59:01.000Z",
  data: { projectId: "pho_prj_test", object },
  ...over,
});

describe("T-MS-14 message.received", () => {
  it("normalizes a text message and keeps the dedupe key", () => {
    const r = normalizePhotonEvent(envelope("message.received", messageObject("received")), deps);
    expect(r).toEqual({
      ok: true,
      data: {
        provider: "photon",
        provider_message_id: "pho_msg_test1",
        provider_event_id: "evt_test1",
        received_at: "2026-10-17T21:00:00.000Z",
        sender_handle: "courier@example.invalid",
        provider_space_id: "pho_spc_test1",
        provider_line_sender_id: "pho_usr_line",
        text: "YES K7M3",
        attachments: [],
      },
    });
  });

  it("stamps received_at from the server clock, never from the payload", () => {
    const r = normalizePhotonEvent(
      envelope("message.received", messageObject("received", { createdAt: "1999-01-01T00:00:00.000Z" }), {
        timestamp: "1999-01-01T00:00:00.000Z",
      }),
      deps,
    );
    expect(r.ok && "received_at" in r.data && r.data.received_at).toBe("2026-10-17T21:00:00.000Z");
  });

  it("maps an attachment to an image reference without bytes and without a guessed MIME type", () => {
    const r = normalizePhotonEvent(
      envelope(
        "message.received",
        messageObject("received", { content: { type: "attachment", attachmentId: "pho_att_test1" } }),
      ),
      deps,
    );
    expect(r).toMatchObject({
      ok: true,
      data: { text: null, attachments: [{ kind: "image", provider_attachment_id: "pho_att_test1", mime: null }] },
    });
  });

  it("lowercases email handles and trims whitespace", () => {
    const r = normalizePhotonEvent(
      envelope(
        "message.received",
        messageObject("received", { sentBy: person("pho_usr_x", "  Courier@Example.INVALID ", "human") }),
      ),
      deps,
    );
    expect(r).toMatchObject({ ok: true, data: { sender_handle: "courier@example.invalid" } });
  });

  it("tolerates extra fields Photon may add", () => {
    const raw = envelope("message.received", { ...messageObject("received"), futureField: { a: 1 } }, { extra: true });
    expect(normalizePhotonEvent(raw, deps).ok).toBe(true);
  });

  it("ignores content it cannot act on (reactions, typing, groups)", () => {
    const r = normalizePhotonEvent(
      envelope("message.received", messageObject("received", { content: { type: "reaction", reaction: "love" } })),
      deps,
    );
    expect(r).toEqual({ ok: true, data: { ignored: true } });
  });
});

describe("T-MS-14 delivery status events", () => {
  it.each([
    ["message.accepted", "accepted"],
    ["message.delivered", "delivered"],
  ])("%s becomes a %s status event", (type, status) => {
    const r = normalizePhotonEvent(
      envelope(type, messageObject(status, { sentBy: person("pho_usr_line", "line@example.invalid", "agent") })),
      deps,
    );
    expect(r).toEqual({
      ok: true,
      data: {
        provider: "photon",
        provider_event_id: "evt_test1",
        provider_message_id: "pho_msg_test1",
        status,
        failure_code: null,
        at: "2026-10-17T21:00:00.000Z",
      },
    });
  });

  it("carries Photon's failure code on message.failed", () => {
    const r = normalizePhotonEvent(
      envelope("message.failed", messageObject("failed", { failure: { code: "recipient_opted_out", message: "opted out" } })),
      deps,
    );
    expect(r).toMatchObject({ ok: true, data: { status: "failed", failure_code: "recipient_opted_out" } });
  });

  it("still reports failure when Photon gives no failure code", () => {
    const r = normalizePhotonEvent(envelope("message.failed", messageObject("failed")), deps);
    expect(r).toMatchObject({ ok: true, data: { status: "failed", failure_code: null } });
  });
});

describe("T-MS-14 ignored and rejected input", () => {
  it.each(["message.dispatched", "space.updated", "call.started", "external-webhook.received"])(
    "%s is ignored",
    (type) => {
      expect(normalizePhotonEvent(envelope(type, messageObject("dispatched")), deps)).toEqual({
        ok: true,
        data: { ignored: true },
      });
    },
  );

  it("ignores events from other platforms", () => {
    const r = normalizePhotonEvent(
      envelope("message.received", { ...messageObject("received"), platform: "sms" }, { source: "sms.photon" }),
      deps,
    );
    expect(r).toEqual({ ok: true, data: { ignored: true } });
  });

  it.each([
    ["null", null],
    ["a string", "message.received"],
    ["an array", []],
    ["no id", { ...envelope("message.received", messageObject("received")), id: undefined }],
    ["no data", { ...envelope("message.received", messageObject("received")), data: undefined }],
    ["no object", envelope("message.received", undefined)],
    ["no message id", envelope("message.received", { ...messageObject("received"), id: undefined })],
    ["no sender", envelope("message.received", { ...messageObject("received"), sentBy: undefined })],
    [
      "an empty sender handle",
      envelope("message.received", messageObject("received", { sentBy: person("p", "  ", "human") })),
    ],
  ])("rejects %s as VALIDATION_FAILED", (_name, raw) => {
    const r = normalizePhotonEvent(raw, deps);
    expect(r).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED", retryable: false } });
  });
});
