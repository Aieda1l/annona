import { createHash } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  VerifiedFacts,
  VisionSuggestion,
  err,
  ok,
  type Actor,
  type Deps,
  type DonationCard,
  type DonationSource,
  type Result,
} from "@/contracts";
import { donation_images, donations, donors, policy_config, verification_links } from "@/db/schema";
import { evaluateEligibility } from "../eligibility";
import { canTransition } from "../state";
import { parseUtc } from "../time";
import { writeAudit } from "./audit";
import { buildCard } from "./cards";
import { donorFromRow, policyFromRow, iso } from "./map";
import { runtime } from "./runtime";

// Slice 2(a): intake-facing core (CONTRACTS section 9.3, S-01, S-02, S-03 session path). Dev 1 calls these and never
// writes donation rows directly. Time comes only from the injected Clock.

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function storeDonationImage(input: { mime: string; bytes: Uint8Array }, deps?: Deps): Promise<Result<{ image_id: string }>> {
  if (typeof input?.mime !== "string" || !ALLOWED_IMAGE_MIME.has(input.mime)) {
    return err("VALIDATION_FAILED", "Please upload a JPEG, PNG or WebP photo.");
  }
  if (!(input.bytes instanceof Uint8Array) || input.bytes.length === 0) return err("VALIDATION_FAILED", "The photo is empty.");
  if (input.bytes.length > MAX_IMAGE_BYTES) return err("VALIDATION_FAILED", "The photo is larger than 5 MB.");

  const { db, clock } = await runtime(deps);
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const [row] = await db
    .insert(donation_images)
    .values({ mime: input.mime, bytes: input.bytes, sha256, created_at: clock.now() })
    .returning({ id: donation_images.id });
  return ok({ image_id: row!.id });
}

export async function createDraft(
  input: { actor: Actor; image_id: string; source: DonationSource; source_ref: string | null },
  deps?: Deps,
): Promise<Result<DonationCard>> {
  const { actor, image_id, source, source_ref } = input;
  if (actor?.role !== "donor" || !actor.id) return err("NOT_AUTHORIZED", "Only a donor can start a draft.");
  // CONTRACTS section 3.2: a messaging draft is keyed by its inbound photo; the other sources carry no reference.
  if (source === "messaging" ? !source_ref : source_ref !== null) {
    return err("VALIDATION_FAILED", source === "messaging" ? "A messaging draft needs the inbound photo reference." : "This source has no reference.");
  }

  const { db, clock } = await runtime(deps);
  return db.transaction(async (tx): Promise<Result<DonationCard>> => {
    const [donor] = await tx.select().from(donors).where(eq(donors.id, actor.id!));
    const now = clock.now();
    const check = canTransition({
      from: null,
      to: "draft",
      trigger: "createDraft",
      ctx: { now, effective_cutoff_at: null, collected_at: null, actor_role: "donor", donor_status: donor?.approval_status as "approved" | "pending" | "suspended" | undefined },
    });
    if (!donor || !check.ok) return err("NOT_AUTHORIZED", "Only an approved or pending donor can start a draft.");

    const findExisting = async () =>
      source_ref === null
        ? undefined
        : (await tx.select().from(donations).where(and(eq(donations.source, source), eq(donations.source_ref, source_ref))))[0];

    const replay = async (existing: typeof donations.$inferSelect): Promise<Result<DonationCard>> =>
      existing.donor_id === actor.id ? ok(await buildCard(tx, existing, "donor")) : err("CONFLICT", "That photo already belongs to another donation.");

    const existing = await findExisting();
    if (existing) return replay(existing);

    const [image] = await tx.select({ id: donation_images.id }).from(donation_images).where(eq(donation_images.id, image_id));
    if (!image) return err("NOT_FOUND", "Photo not found.");

    // ON CONFLICT DO NOTHING: two reprocessed copies of one inbound photo create exactly one draft.
    const [created] = await tx
      .insert(donations)
      .values({ donor_id: actor.id!, status: "draft", version: 1, source, source_ref, image_id, ai_status: "pending", created_at: now, updated_at: now })
      .onConflictDoNothing()
      .returning();
    if (!created) {
      const raced = await findExisting();
      return raced ? replay(raced) : err("CONFLICT", "Could not create the draft; please try again.", { retryable: true });
    }

    await writeAudit(tx, { at: now, type: "donation.created", actor, donation_id: created.id, data: { source } });
    return ok(await buildCard(tx, created, "donor"));
  });
}

const SAFE_ERROR_CODE = /^[A-Za-z0-9_.:-]{1,64}$/;

export async function attachAiResult(
  input: { donation_id: string; result: { ok: true; suggestion: VisionSuggestion } | { ok: false; error_code: string } },
  deps?: Deps,
): Promise<Result<DonationCard>> {
  const { db, clock } = await runtime(deps);
  return db.transaction(async (tx): Promise<Result<DonationCard>> => {
    const [row] = await tx.select().from(donations).where(eq(donations.id, input.donation_id)).for("no key update");
    if (!row) return err("NOT_FOUND", "Donation not found.");
    if (row.status !== "draft") return err("INVALID_TRANSITION", "The AI result can only be attached to a draft.");
    // The suggestion is an immutable snapshot: a repeat call after success changes nothing.
    if (row.ai_status === "succeeded") return ok(await buildCard(tx, row, "donor"));

    const now = clock.now();
    const actor: Actor = { role: "system", id: null };
    const parsed = input.result.ok ? VisionSuggestion.safeParse(input.result.suggestion) : null;

    if (input.result.ok && parsed?.success) {
      const [updated] = await tx
        .update(donations)
        .set({ ai_suggestion: parsed.data, ai_status: "succeeded", updated_at: now })
        .where(and(eq(donations.id, row.id), eq(donations.status, "draft")))
        .returning();
      await writeAudit(tx, { at: now, type: "ai.suggestion_attached", actor, donation_id: row.id, mode: { vision: parsed.data.mode }, data: { provider: parsed.data.provider, prompt_version: parsed.data.prompt_version } });
      return ok(await buildCard(tx, updated!, "donor"));
    }

    // A failure, or a suggestion that does not satisfy the schema: record it and let the donor fill the form by hand.
    const error_code = !input.result.ok && SAFE_ERROR_CODE.test(input.result.error_code) ? input.result.error_code : "AI_OUTPUT_INVALID";
    const [failed] = await tx
      .update(donations)
      .set({ ai_status: "failed", updated_at: now })
      .where(and(eq(donations.id, row.id), eq(donations.status, "draft")))
      .returning();
    await writeAudit(tx, { at: now, type: "ai.suggestion_failed", actor, donation_id: row.id, data: { error_code } });
    return input.result.ok ? err("AI_OUTPUT_INVALID", "The AI result did not match the expected shape.", { details: { donation_id: row.id } }) : ok(await buildCard(tx, failed!, "donor"));
  });
}

const MAX_EDITED_FIELDS = 40;

export async function submitVerification(
  input: {
    auth: { actor: Actor } | { link_token: string };
    donation_id: string;
    facts: VerifiedFacts;
    edited_from_ai: string[];
  },
  deps?: Deps,
): Promise<Result<{ card: DonationCard; resubmit_token: string | null }>> {
  if (!input?.auth || !("actor" in input.auth)) {
    // The link path consumes a verification link in the same transaction; it ships with slice 2(d).
    return err("NOT_IMPLEMENTED", "Verification by link is not implemented yet.");
  }
  const actor = input.auth.actor;

  const { db, clock } = await runtime(deps);
  return db.transaction(async (tx): Promise<Result<{ card: DonationCard; resubmit_token: string | null }>> => {
    const [row] = await tx.select().from(donations).where(eq(donations.id, input.donation_id)).for("no key update");
    if (!row) return err("NOT_FOUND", "Donation not found.");
    if (actor?.role !== "donor" || actor.id === null || actor.id !== row.donor_id) {
      return err("NOT_AUTHORIZED", "Only the donor who owns this donation can verify it.");
    }

    const now = clock.now();
    // The server stamps the attestation time; whatever the client sent is ignored (CONTRACTS section 3.4).
    const raw = input.facts as unknown as { attestation?: unknown };
    const candidate =
      raw && typeof raw === "object" && raw.attestation && typeof raw.attestation === "object"
        ? { ...raw, attestation: { ...(raw.attestation as object), attested_at: iso(now) } }
        : raw;
    const parsed = VerifiedFacts.safeParse(candidate);
    if (!parsed.success) {
      return err("VALIDATION_FAILED", "Some answers are missing or invalid.", {
        details: { fields: parsed.error.issues.map((i) => i.path.join(".")).slice(0, 20) },
      });
    }
    const facts = parsed.data;
    const edited = Array.isArray(input.edited_from_ai) ? input.edited_from_ai : [];
    if (edited.length > MAX_EDITED_FIELDS || edited.some((f) => typeof f !== "string" || f.length === 0 || f.length > 60)) {
      return err("VALIDATION_FAILED", "edited_from_ai must be a short list of field names.");
    }

    const [donor] = await tx.select().from(donors).where(eq(donors.id, row.donor_id));
    const [policyRow] = await tx.select().from(policy_config).where(eq(policy_config.active, true));
    if (!donor || !policyRow) return err("INTERNAL", "The donor profile or the active policy is missing.");

    let decision;
    try {
      decision = evaluateEligibility({ facts, donor: donorFromRow(donor), policy: policyFromRow(policyRow), now });
    } catch {
      // A broken policy or clock stops the gate; nothing is stored and the donation is not advanced.
      return err("INTERNAL", "The eligibility check could not run.");
    }

    const transition = canTransition({
      from: row.status as DonationCard["status"],
      to: decision.outcome,
      trigger: "submitVerification",
      ctx: { now, effective_cutoff_at: null, collected_at: row.collected_at ? iso(row.collected_at) : null, authorized_owner: true, gate_outcome: decision.outcome },
    });
    if (!transition.ok) return err("INVALID_TRANSITION", transition.message);

    const cutoffMs = Math.min(parseUtc(facts.donor_pickup_by), facts.discard_by === null ? Number.POSITIVE_INFINITY : parseUtc(facts.discard_by));
    const [updated] = await tx
      .update(donations)
      .set({
        status: decision.outcome,
        version: row.version + 1,
        verified_facts: facts,
        edited_from_ai: edited,
        latest_decision: decision,
        effective_cutoff_at: Number.isFinite(cutoffMs) ? new Date(cutoffMs) : null,
        updated_at: now,
      })
      .where(and(eq(donations.id, row.id), inArray(donations.status, ["draft", "needs_review"]), isNull(donations.collected_at), eq(donations.version, row.version)))
      .returning();
    if (!updated) return err("CONFLICT", "The donation changed while you were saving; please reload.", { retryable: true });

    // S-03: every other live link for the donation is revoked.
    await tx
      .update(verification_links)
      .set({ revoked_at: now })
      .where(and(eq(verification_links.donation_id, row.id), isNull(verification_links.consumed_at), isNull(verification_links.revoked_at)));

    await writeAudit(tx, { at: now, type: "donor.verification_submitted", actor, donation_id: row.id, data: { edited_field_count: edited.length } });
    await writeAudit(tx, {
      at: now,
      type: "eligibility.evaluated",
      actor: { role: "system", id: null },
      donation_id: row.id,
      data: { outcome: decision.outcome, reason_codes: decision.reasons.map((r) => r.code), policy_version: decision.policy_version },
    });
    return ok({ card: await buildCard(tx, updated, "donor"), resubmit_token: null });
  });
}
