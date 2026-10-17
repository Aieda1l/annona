import { describe, expect, it } from "vitest";
import { createDraftFromImage, submitDonorVerification } from "@/features/intake";
import { createFakeVisionProvider } from "@/lib/ai/fake";
import { DONOR } from "./doubles/core";

// Smoke test for the barrel wiring only. Outcomes that depend on Dev 2's core (stubs today) are not asserted.
const vision = createFakeVisionProvider();

describe("intake barrel", () => {
  it("createDraftFromImage validates before reaching core", async () => {
    const r = await createDraftFromImage(
      { actor: DONOR, image: { mime: "text/plain", bytes_base64: "AAAA" }, source: "web_upload" },
      { vision },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("VALIDATION_FAILED");
  });

  it("submitDonorVerification parses facts before reaching core", async () => {
    const r = await submitDonorVerification({ actor: DONOR, donation_id: "x", raw: {} }, { vision });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("VALIDATION_FAILED");
  });
});
