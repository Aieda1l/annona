import { describe, expect, it, vi } from "vitest";
import { err, scene1_vision_suggestion, type VisionProvider, type VisionSuggestion } from "@/contracts";
import { createIntakeService, type IntakeService } from "@/features/intake/service";
import { createCoreDouble, DONOR } from "./doubles/core";
import { jpegOfSize } from "./doubles/images";

// Review (MEDIUM): one upload can cost up to three paid provider calls (retry, then escalation). A double click or a
// replayed request must not multiply that. Web and fixture drafts carry no source_ref (CONTRACTS §3.2), so the
// service shares the in-flight result only, keyed by donor and image bytes. Nothing is reused once it settles.

const DONOR_B = { role: "donor", id: "00000000-0000-4000-8000-0000000000bb" } as const;
const image = (fill: number) => ({ mime: "image/jpeg", bytes_base64: Buffer.from(jpegOfSize(200, fill)).toString("base64") });
const good = { ...scene1_vision_suggestion, mode: "real" } as VisionSuggestion;

function setup(impl: VisionProvider["analyzeFoodImage"] = async () => ({ ok: true, data: good })) {
  const d = createCoreDouble();
  const analyzeFoodImage = vi.fn(impl);
  const vision = { mode: "real", model: "m", status: "ok", analyzeFoodImage } as VisionProvider;
  const service: IntakeService = createIntakeService({ core: d.core, vision });
  return { ...d, service, analyzeFoodImage };
}
const draft = (
  s: IntakeService,
  img = image(1),
  actor: typeof DONOR | typeof DONOR_B = DONOR,
  source: "web_upload" | "fixture" = "web_upload",
) => s.createDraftFromImage({ actor, image: img, source });

describe("repeated web and fixture uploads", () => {
  it("two simultaneous identical uploads make one draft and one provider call", async () => {
    const { service, analyzeFoodImage, core } = setup();
    const [a, b] = await Promise.all([draft(service), draft(service)]);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(b.data.id).toBe(a.data.id);
    expect(analyzeFoodImage).toHaveBeenCalledTimes(1);
    expect(core.createDraft).toHaveBeenCalledTimes(1);
  });

  it("a repeat after the first request settled is a new draft, never a stored card snapshot", async () => {
    // A settled card can be stale (donor verified, or the operator reset the demo), so only in-flight work is shared.
    const { service, analyzeFoodImage, core } = setup();
    await draft(service);
    await draft(service);
    expect(analyzeFoodImage).toHaveBeenCalledTimes(2);
    expect(core.createDraft).toHaveBeenCalledTimes(2);
  });

  it("works for fixtures too", async () => {
    const { service, analyzeFoodImage } = setup();
    await Promise.all([draft(service, image(1), DONOR, "fixture"), draft(service, image(1), DONOR, "fixture")]);
    expect(analyzeFoodImage).toHaveBeenCalledTimes(1);
  });

  it("a different photo, or a different donor with the same photo, is not merged", async () => {
    const { service, analyzeFoodImage } = setup();
    await draft(service, image(1));
    await draft(service, image(2));
    await draft(service, image(1), DONOR_B);
    expect(analyzeFoodImage).toHaveBeenCalledTimes(3);
  });

  it("a failed AI attempt is not remembered: the donor can retry straight away", async () => {
    let calls = 0;
    const { service, analyzeFoodImage } = setup(async () =>
      ++calls === 1 ? err("PROVIDER_UNAVAILABLE", "down", { retryable: true }) : { ok: true, data: good },
    );
    const first = await draft(service);
    expect(first.ok && first.data.ai_status).toBe("failed");
    const second = await draft(service);
    expect(second.ok && second.data.ai_status).toBe("succeeded");
    expect(analyzeFoodImage).toHaveBeenCalledTimes(2);
  });

  it("a validation failure is not remembered", async () => {
    const { service } = setup();
    const bad = { mime: "text/plain", bytes_base64: Buffer.alloc(10, 1).toString("base64") };
    expect((await draft(service, bad)).ok).toBe(false);
    expect((await draft(service, bad)).ok).toBe(false);
  });

  it("messaging drafts are left to core's source_ref idempotency", async () => {
    const { service, analyzeFoodImage } = setup();
    const input = { actor: DONOR, image: image(1), source: "messaging" as const };
    await service.createDraftFromImage({ ...input, source_ref: "fake:a" });
    await service.createDraftFromImage({ ...input, source_ref: "fake:b" });
    expect(analyzeFoodImage).toHaveBeenCalledTimes(2);
  });
});
