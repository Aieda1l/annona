import { and, desc, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import {
  INBOUND_REPROCESS_AFTER_SECONDS,
  OutboundMessage,
  err,
  ok,
  type DeliveryStatusEvent,
  type Deps,
  type InboundIgnoreReason,
  type InboundResult,
  type Result,
  type ThreadMessage,
} from "@/contracts";
import { inbound_messages, messaging_identities, offers, outbound_messages, provider_status_events } from "@/db/schema";
import { writeAudit, SYSTEM_ACTOR } from "./audit";
import { isUuid, maskHandle } from "./map";
import { activeProvider, runtime } from "./runtime";

// Inbound and outbound message ledger, delivery status, and the simulated-phone thread (CONTRACTS sections 8.2, 8.3,
// 3.10, 11). Handles are personal data: an unknown sender's handle and text are never stored.

const PROVIDERS = new Set(["photon", "fake"]);
const SAFE_TOKEN = /^[A-Za-z0-9_.:-]{1,64}$/;
const PRINTABLE_ID = /^[\x21-\x7e]{1,128}$/;
const MAX_PAYLOAD_JSON = 64 * 1024;
const MASKED = /^\*{3}[^*]{1,4}$/;
const THREAD_LIMIT = 500;
const mode = (provider: string) => (provider === "photon" ? ("real" as const) : ("fake" as const));

type Provider = "photon" | "fake";

export async function recordInboundMessage(
  provider: Provider,
  provider_message_id: string,
  payload: unknown,
  deps?: Deps,
): Promise<{ status: "first" | "duplicate"; stored_result: InboundResult | null }> {
  if (!PROVIDERS.has(provider) || typeof provider_message_id !== "string" || !PRINTABLE_ID.test(provider_message_id)) {
    throw new Error("recordInboundMessage: a provider and a provider_message_id (at most 128 printable characters) are required");
  }
  const { db, clock } = await runtime(deps);
  return db.transaction(async (tx) => {
    const now = clock.now();
    const p = (payload ?? {}) as { sender_handle?: unknown; provider_event_id?: unknown };
    const handle = typeof p.sender_handle === "string" ? p.sender_handle.trim() : "";
    if (p.provider_event_id !== undefined && p.provider_event_id !== null && (typeof p.provider_event_id !== "string" || !PRINTABLE_ID.test(p.provider_event_id))) {
      throw new Error("recordInboundMessage: provider_event_id must be at most 128 printable characters");
    }
    // A huge body is not worth keeping: the row (the dedupe record) is written without the payload.
    const keepPayload = JSON.stringify(payload ?? null).length <= MAX_PAYLOAD_JSON;

    // Only a seeded identity's handle and text are kept. A stranger's are never written (CONTRACTS section 11).
    const known = handle
      ? (await tx.select({ id: messaging_identities.id }).from(messaging_identities).where(and(eq(messaging_identities.provider, provider), sql`lower(${messaging_identities.handle}) = ${handle.toLowerCase()}`)))[0]
      : undefined;

    const inserted = await tx
      .insert(inbound_messages)
      .values({
        provider,
        provider_message_id,
        provider_event_id: typeof p.provider_event_id === "string" ? p.provider_event_id : null,
        received_at: now,
        processing_started_at: now,
        sender_handle: known ? handle : null,
        handle_masked: handle ? maskHandle(handle) : null,
        payload: known && keepPayload ? (payload as object) : null,
      })
      .onConflictDoNothing()
      .returning({ id: inbound_messages.id });
    if (inserted.length === 1) {
      await writeAudit(tx, { at: now, type: "inbound.received", actor: SYSTEM_ACTOR, mode: { messaging: mode(provider) }, data: { provider, provider_message_id } });
      return { status: "first" as const, stored_result: null };
    }

    const [existing] = await tx
      .select()
      .from(inbound_messages)
      .where(and(eq(inbound_messages.provider, provider), eq(inbound_messages.provider_message_id, provider_message_id)));
    if (existing && existing.result !== null) {
      await writeAudit(tx, { at: now, type: "inbound.duplicate", actor: SYSTEM_ACTOR, mode: { messaging: mode(provider) }, data: { provider, provider_message_id } });
      return { status: "duplicate" as const, stored_result: existing.result as InboundResult };
    }

    // CONTRACTS section 8.2: an unfinished row older than 30 s is reclaimed; a fresh one is still in flight.
    const threshold = new Date(now.getTime() - INBOUND_REPROCESS_AFTER_SECONDS * 1000);
    const reclaimed = await tx
      .update(inbound_messages)
      .set({ processing_started_at: now })
      .where(
        and(
          eq(inbound_messages.id, existing!.id),
          isNull(inbound_messages.result),
          or(isNull(inbound_messages.processing_started_at), lt(inbound_messages.processing_started_at, threshold)),
        ),
      )
      .returning({ id: inbound_messages.id });
    if (reclaimed.length === 1) return { status: "first" as const, stored_result: null };
    await writeAudit(tx, { at: now, type: "inbound.duplicate", actor: SYSTEM_ACTOR, mode: { messaging: mode(provider) }, data: { provider, provider_message_id, in_flight: true } });
    return { status: "duplicate" as const, stored_result: null };
  });
}

export async function saveInboundResult(input: { provider: Provider; provider_message_id: string; result: InboundResult }, deps?: Deps): Promise<void> {
  const { db } = await runtime(deps);
  const [row] = await db
    .select({ id: inbound_messages.id })
    .from(inbound_messages)
    .where(and(eq(inbound_messages.provider, input.provider), eq(inbound_messages.provider_message_id, input.provider_message_id)));
  if (!row) throw new Error("saveInboundResult: no inbound message was recorded for this provider_message_id");
  // Conditional on result IS NULL: the first saved result wins, a replay changes nothing.
  await db.update(inbound_messages).set({ result: input.result }).where(and(eq(inbound_messages.id, row.id), isNull(inbound_messages.result)));
}

export async function recordIgnoredInbound(
  input: { provider: Provider; provider_message_id: string; reason: InboundIgnoreReason; handle_masked: string },
  deps?: Deps,
): Promise<void> {
  if (!PROVIDERS.has(input.provider) || (input.reason !== "unknown_sender" && input.reason !== "not_joined")) {
    throw new Error("recordIgnoredInbound: invalid provider or reason");
  }
  const { db, clock } = await runtime(deps);
  const now = clock.now();
  // Belt and braces: whatever the caller passes, at most the last 4 characters are kept.
  const given = String(input.handle_masked ?? "");
  const masked = MASKED.test(given) || given === "****" ? given : maskHandle(given);
  await db.transaction(async (tx) => {
    // The row keeps no handle and no payload (section 11); an upsert covers a caller that never recorded the message first.
    await tx
      .insert(inbound_messages)
      .values({
        provider: input.provider,
        provider_message_id: input.provider_message_id,
        received_at: now,
        processing_started_at: now,
        sender_handle: null,
        handle_masked: masked,
        ignore_reason: input.reason,
        payload: null,
      })
      .onConflictDoUpdate({
        target: [inbound_messages.provider, inbound_messages.provider_message_id],
        set: { sender_handle: null, payload: null, handle_masked: masked, ignore_reason: input.reason },
      });
    await writeAudit(tx, {
      at: now,
      type: "inbound.ignored",
      actor: SYSTEM_ACTOR,
      mode: { messaging: mode(input.provider) },
      data: { provider: input.provider, provider_message_id: input.provider_message_id, reason: input.reason, handle_masked: masked },
    });
  });
}

export async function recordOutboundMessage(input: { message: OutboundMessage; provider_message_id: string | null }, deps?: Deps): Promise<void> {
  const message = OutboundMessage.parse(input.message);
  const { db, clock } = await runtime(deps);
  await db.transaction(async (tx) => {
    const [identity] = await tx.select().from(messaging_identities).where(eq(messaging_identities.id, message.to_identity_id));
    if (!identity) throw new Error("recordOutboundMessage: unknown identity");
    const now = clock.now();
    const sent = input.provider_message_id !== null;
    const inserted = await tx
      .insert(outbound_messages)
      .values({
        identity_id: identity.id,
        purpose: message.purpose,
        text: message.text,
        idempotency_key: message.idempotency_key,
        provider_mode: mode(identity.provider),
        provider_message_id: input.provider_message_id,
        correlation: message.correlation,
        send_result: { sent },
        created_at: now,
      })
      .onConflictDoNothing()
      .returning({ id: outbound_messages.id });

    if (inserted.length === 0 && sent) {
      // A retry of an attempt that earlier failed (no provider id) fills it in; one that already succeeded is left alone.
      await tx
        .update(outbound_messages)
        .set({ provider_message_id: input.provider_message_id, send_result: { sent: true } })
        .where(and(eq(outbound_messages.idempotency_key, message.idempotency_key), isNull(outbound_messages.provider_message_id)));
      return;
    }
    if (inserted.length === 1) {
      await writeAudit(tx, {
        at: now,
        type: "outbound.sent",
        actor: SYSTEM_ACTOR,
        donation_id: message.correlation.donation_id ?? null,
        offer_id: message.correlation.offer_id ?? null,
        mode: { messaging: mode(identity.provider) },
        data: { identity_id: identity.id, purpose: message.purpose, sent },
      });
    }
  });
}

/** True only for a message that was actually accepted by the provider, so a failed attempt can be retried. */
export async function hasOutboundMessage(idempotency_key: string, deps?: Deps): Promise<boolean> {
  const { db } = await runtime(deps);
  const rows = await db
    .select({ id: outbound_messages.id })
    .from(outbound_messages)
    .where(and(eq(outbound_messages.idempotency_key, idempotency_key), isNotNull(outbound_messages.provider_message_id)))
    .limit(1);
  return rows.length === 1;
}

/** A draft_ready text carries a working token; outside fake mode only its last 4 characters are shown (CONTRACTS 8.4 step 9). */
const maskTokens = (text: string) => text.replace(/#[A-Za-z0-9_-]{43}/g, (m) => `#…${m.slice(-4)}`);

export async function listMessages(input: { identity_id?: string }, deps?: Deps): Promise<ThreadMessage[]> {
  if (input.identity_id !== undefined && !isUuid(input.identity_id)) return [];
  const { db } = await runtime(deps);
  // Working tokens are shown only when the app itself runs on fake messaging AND the identity is a fake one (the
  // simulated phone stands in for the donor's phone). Anything else shows the last 4 characters.
  const showTokens = activeProvider(deps) === "fake";
  const idFilter = input.identity_id;
  const [identity] = idFilter ? await db.select().from(messaging_identities).where(eq(messaging_identities.id, idFilter)) : [];
  if (idFilter && !identity) return [];

  const outbound = await db
    .select({ o: outbound_messages, provider: messaging_identities.provider })
    .from(outbound_messages)
    .innerJoin(messaging_identities, eq(outbound_messages.identity_id, messaging_identities.id))
    .where(idFilter ? eq(outbound_messages.identity_id, idFilter) : undefined)
    .orderBy(desc(outbound_messages.created_at))
    .limit(THREAD_LIMIT);
  const inbound = await db
    .select()
    .from(inbound_messages)
    .where(
      and(
        isNotNull(inbound_messages.payload),
        identity ? sql`lower(${inbound_messages.sender_handle}) = ${identity.handle.toLowerCase()} and ${inbound_messages.provider} = ${identity.provider}` : undefined,
      ),
    )
    .orderBy(desc(inbound_messages.received_at))
    .limit(THREAD_LIMIT);

  const thread: ThreadMessage[] = [
    ...outbound.map((r) => ({
      id: r.o.id,
      direction: "outbound" as const,
      text: (showTokens && r.provider === "fake") || r.o.purpose !== "draft_ready" ? r.o.text : maskTokens(r.o.text),
      purpose: r.o.purpose as ThreadMessage["purpose"],
      created_at: r.o.created_at.toISOString(),
    })),
    ...inbound.map((r) => {
      const p = r.payload as { text?: string | null; attachments?: unknown[] } | null;
      const text = typeof p?.text === "string" && p.text !== "" ? p.text : Array.isArray(p?.attachments) && p.attachments.length > 0 ? "(photo)" : "";
      return { id: r.id, direction: "inbound" as const, text, purpose: null, created_at: r.received_at.toISOString() };
    }),
  ];
  return thread.sort((a, b) => (a.created_at === b.created_at ? (a.id < b.id ? -1 : 1) : a.created_at < b.created_at ? -1 : 1)).slice(-500);
}

export async function recordStatusEvent(evt: DeliveryStatusEvent, deps?: Deps): Promise<"first" | "duplicate"> {
  if (!PROVIDERS.has(evt.provider) || !evt.provider_event_id) throw new Error("recordStatusEvent: a provider and a provider_event_id are required");
  const { db, clock } = await runtime(deps);
  const at = new Date(evt.at);
  const inserted = await db
    .insert(provider_status_events)
    .values({
      provider: evt.provider,
      provider_event_id: evt.provider_event_id,
      provider_message_id: evt.provider_message_id,
      status: evt.status,
      failure_code: evt.failure_code !== null && SAFE_TOKEN.test(evt.failure_code) ? evt.failure_code : null,
      at: Number.isFinite(at.getTime()) ? at : clock.now(),
    })
    .onConflictDoNothing()
    .returning({ id: provider_status_events.id });
  return inserted.length === 1 ? "first" : "duplicate";
}

const STATUS_RANK = { unknown: 0, accepted: 1, delivered: 2, failed: 3 } as const;

/**
 * Applies a delivery event to the offer whose provider_message_id it names. Idempotent and monotonic (a late
 * "accepted" never undoes "delivered"), so the caller may always call it, whether recordStatusEvent said first or
 * duplicate: a crash between the two never loses the update. Delivery events never start, extend or stop a deadline.
 */
export async function recordDeliveryStatus(
  evt: DeliveryStatusEvent,
  deps?: Deps,
): Promise<Result<{ offer_id: string | null; offer_status: string | null }>> {
  if (!["accepted", "delivered", "failed"].includes(evt.status)) return err("VALIDATION_FAILED", "Unknown delivery status.");
  const { db, clock } = await runtime(deps);
  return db.transaction(async (tx) => {
    const [offer] = await tx
      .select()
      .from(offers)
      .where(and(eq(offers.provider_message_id, evt.provider_message_id), eq(offers.provider_mode, mode(evt.provider))))
      .for("update");
    if (!offer) return ok({ offer_id: null, offer_status: null });
    const current = STATUS_RANK[offer.delivery_status as keyof typeof STATUS_RANK] ?? 0;
    if (STATUS_RANK[evt.status] > current) {
      await tx.update(offers).set({ delivery_status: evt.status }).where(eq(offers.id, offer.id));
      await writeAudit(tx, {
        at: clock.now(),
        type: "offer.delivery_status",
        actor: SYSTEM_ACTOR,
        donation_id: offer.donation_id,
        offer_id: offer.id,
        mode: { messaging: offer.provider_mode as "real" | "fake" },
        data: { status: evt.status, ...(evt.failure_code && SAFE_TOKEN.test(evt.failure_code) ? { failure_code: evt.failure_code } : {}) },
      });
    }
    return ok({ offer_id: offer.id, offer_status: offer.status });
  });
}
