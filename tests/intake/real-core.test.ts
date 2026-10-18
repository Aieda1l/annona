import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ALLERGENS, err } from "@/contracts";
import * as core from "@/core";
import { audit_events, donation_images, donations } from "@/db/schema";
import { GPS_MARKER, HEIC_PIXELS, JPEG_SCAN, concat, contains, heicWithExif, jpegWithExif } from "./doubles/images";
import { createIntakeService } from "@/features/intake/service";
import { createFakeVisionProvider } from "@/lib/ai/fake";
import { donorActor, factsAt, makeWorld, type World } from "../core/helpers/world";

// Dev 1 service against Dev 2's REAL core (PGlite store, test clock), not the double: storeDonationImage, createDraft,
// attachAiResult, getDonationCard and submitVerification are the real implementations.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

let w: World;
beforeAll(async () => {
  w = await makeWorld();
});
afterAll(async () => w.close());

const image = (id: string) => ({
  mime: "image/jpeg",
  bytes_base64: readFileSync(join(process.cwd(), "fixtures/intake/images", `${id}.jpg`)).toString("base64"),
});
const service = () => createIntakeService({ core, vision: createFakeVisionProvider() });

describe("intake service against the real core", () => {
  it("web upload: draft is created, vision runs, the suggestion is attached and ai_status is succeeded", async () => {
    const r = await service().createDraftFromImage(
      { actor: donorActor(), image: image("sandwich_platter"), source: "web_upload" },
      w.deps(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({ status: "draft", ai_status: "succeeded" });
    expect(r.data.ai_suggestion?.mode).toBe("fake");
    expect(r.data.verified_facts).toBeNull();
  });

  it("a non-donor actor cannot create a draft", async () => {
    const r = await service().createDraftFromImage(
      { actor: { role: "operator", id: donorActor().id }, image: image("sandwich_platter"), source: "web_upload" },
      w.deps(),
    );
    expect(r).toMatchObject({ ok: false, error: { code: "NOT_AUTHORIZED" } });
  });

  it("malformed model output fails closed: the draft exists with ai_status failed and no suggestion", async () => {
    const r = await service().createDraftFromImage(
      { actor: donorActor(), image: image("malformed_output"), source: "fixture" },
      w.deps(),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toMatchObject({ status: "draft", ai_status: "failed", ai_suggestion: null });
  });

  it("a repeated messaging source_ref returns the same draft and does not run vision again", async () => {
    const analyze = vi.fn(createFakeVisionProvider().analyzeFoodImage);
    const s = createIntakeService({ core, vision: { ...createFakeVisionProvider(), analyzeFoodImage: analyze } });
    const input = { actor: donorActor(), image: image("sandwich_platter"), source: "messaging" as const, source_ref: "fake:real-core-1" };
    const a = await s.createDraftFromImage(input, w.deps());
    const b = await s.createDraftFromImage(input, w.deps());
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(b.data.id).toBe(a.data.id);
    expect(analyze).toHaveBeenCalledTimes(1);
  });

  it("session verification: unknown allergens stay unknown, the gate decides, edited_from_ai is recorded", async () => {
    const s = service();
    const draft = await s.createDraftFromImage(
      { actor: donorActor(), image: image("sandwich_platter"), source: "web_upload" },
      w.deps(),
    );
    if (!draft.ok) throw new Error("draft failed");
    const r = await s.submitDonorVerification(
      { actor: donorActor(), donation_id: draft.data.id, raw: factsAt() },
      w.deps(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.status).toBe("eligible");
    expect(r.data.decision).not.toBeNull();
    expect(r.data.verified_facts?.attestation.attested_at).not.toBe("2020-01-01T00:00:00.000Z"); // server-stamped
  });

  it("another donor cannot verify someone else's donation", async () => {
    const s = service();
    const draft = await s.createDraftFromImage(
      { actor: donorActor(), image: image("sandwich_platter"), source: "web_upload" },
      w.deps(),
    );
    if (!draft.ok) throw new Error("draft failed");
    const other = donorActor("00000000-0000-4000-8000-0000000000aa");
    const r = await s.submitDonorVerification({ actor: other, donation_id: draft.data.id, raw: factsAt() }, w.deps());
    expect(r.ok).toBe(false);
  });
  async function draftFor(s = service()) {
    const d = await s.createDraftFromImage({ actor: donorActor(), image: image("sandwich_platter"), source: "web_upload" }, w.deps());
    if (!d.ok) throw new Error("draft failed");
    return d.data;
  }

  it("T-IN-08: all-unknown allergens go to needs_review; the AI-listed allergens do not fill them in", async () => {
    const s = service();
    const d = await draftFor(s);
    expect(d.ai_suggestion?.possible_allergens.length).toBeGreaterThan(0);
    const unknown = Object.fromEntries(ALLERGENS.map((a) => [a, "unknown"]));
    const r = await s.submitDonorVerification(
      { actor: donorActor(), donation_id: d.id, raw: factsAt(undefined, { allergens: unknown }) },
      w.deps(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.status).toBe("needs_review");
    expect(r.data.verified_facts?.allergens).toEqual(unknown);
    expect(r.data.decision?.reasons.filter((x) => x.code === "ALLERGEN_UNKNOWN")).toHaveLength(ALLERGENS.length);
  });

  it("missing holding history (cold holding unknown) never becomes eligible", async () => {
    const s = service();
    const d = await draftFor(s);
    const r = await s.submitDonorVerification(
      { actor: donorActor(), donation_id: d.id, raw: factsAt(undefined, { continuous_cold_holding: "unknown", temperature_log_available: "unknown" }) },
      w.deps(),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.status).not.toBe("eligible");
  });

  it("the stored verified_facts are the donor's answers, not the AI suggestion", async () => {
    const s = service();
    const d = await draftFor(s);
    const raw = factsAt(undefined, { dish_name: "Donor-typed dish name" });
    const r = await s.submitDonorVerification({ actor: donorActor(), donation_id: d.id, raw }, w.deps());
    expect(r.ok).toBe(true);
    const [row] = await w.db.select().from(donations).where(eq(donations.id, d.id));
    expect((row!.verified_facts as { dish_name: string }).dish_name).toBe("Donor-typed dish name");
    expect(row!.edited_from_ai).toContain("dish_name");
  });

  it("a vision timeout leaves a usable draft: ai_status failed, no suggestion, audit records the failure", async () => {
    const slow = { ...createFakeVisionProvider(), analyzeFoodImage: () => new Promise<never>(() => {}) };
    const s = createIntakeService({ core, vision: slow, timeout_ms: 20 });
    const d = await draftFor(s);
    expect(d).toMatchObject({ status: "draft", ai_status: "failed", ai_suggestion: null });
    const events = await w.db.select().from(audit_events).where(eq(audit_events.donation_id, d.id));
    expect(events.map((e) => e.type)).toContain("ai.suggestion_failed");
  });

  it("a provider error becomes ai_status failed, and no provider error text is stored", async () => {
    const bad = { ...createFakeVisionProvider(), analyzeFoodImage: async () => err("PROVIDER_UNAVAILABLE", "boom: secret-detail") };
    const d = await draftFor(createIntakeService({ core, vision: bad }));
    expect(d).toMatchObject({ ai_status: "failed", ai_suggestion: null });
    const [row] = await w.db.select().from(donations).where(eq(donations.id, d.id));
    expect(JSON.stringify(row)).not.toContain("secret-detail");
  });

  it("another donor cannot read the card", async () => {
    const d = await draftFor();
    const other = donorActor("00000000-0000-4000-8000-0000000000bb");
    expect((await core.getDonationCard(other, d.id, w.deps())).ok).toBe(false);
  });
  it("a non-image labelled image/jpeg is refused by core before vision runs and leaves no draft behind", async () => {
    const analyze = vi.fn(createFakeVisionProvider().analyzeFoodImage);
    const s = createIntakeService({ core, vision: { ...createFakeVisionProvider(), analyzeFoodImage: analyze } });
    const before = (await w.db.select().from(donations)).length;
    const html = { mime: "image/jpeg", bytes_base64: Buffer.from("<html><script>alert(1)</script></html>").toString("base64") };
    const r = await s.createDraftFromImage({ actor: donorActor(), image: html, source: "web_upload" }, w.deps());
    expect(r).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(analyze).not.toHaveBeenCalled();
    expect((await w.db.select().from(donations)).length).toBe(before);
  });
  it.each([
    ["a JPEG", "image/jpeg", () => jpegWithExif(), "messaging"],
    ["a HEIC", "image/heic", () => heicWithExif(), "messaging"],
  ] as const)("%s with GPS in its metadata is stored without it, picture data intact", async (_label, mime, make, source) => {
    const s = createIntakeService({ core, vision: createFakeVisionProvider() });
    const r = await s.createDraftFromImage(
      { actor: donorActor(), image: { mime, bytes_base64: Buffer.from(make()).toString("base64") }, source, source_ref: `fake:exif-${mime}` },
      w.deps(),
    );
    expect(r.ok).toBe(true);
    const rows = (await w.db.select().from(donation_images)).filter((row) => row.mime === mime);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(contains(new Uint8Array(row.bytes), GPS_MARKER)).toBe(false);
    const picture = mime === "image/heic" ? HEIC_PIXELS : JPEG_SCAN;
    expect(rows.some((row) => contains(new Uint8Array(row.bytes), picture))).toBe(true);
  });

  it("an MP4 labelled image/heic is refused by core and leaves no draft", async () => {
    const mp4 = concat(Uint8Array.of(0, 0, 0, 24), new TextEncoder().encode("ftypisom"), new Uint8Array(12));
    const before = (await w.db.select().from(donations)).length;
    const s = createIntakeService({ core, vision: createFakeVisionProvider() });
    const r = await s.createDraftFromImage(
      { actor: donorActor(), image: { mime: "image/heic", bytes_base64: Buffer.from(mp4).toString("base64") }, source: "messaging", source_ref: "fake:mp4-1" },
      w.deps(),
    );
    expect(r.ok).toBe(false);
    expect((await w.db.select().from(donations)).length).toBe(before);
  });
});
