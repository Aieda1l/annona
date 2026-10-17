import { describe, expect, it } from "vitest";
import { FIXTURE_IDS, isFixtureId, readFixtureImage } from "@/workflows/fixtures";

// The simulated phone sends a fixture id instead of a Photon attachment (CONTRACTS §10). The reader only ever opens
// files named by the allowlist, so an id can never carry a path. These read the real images under fixtures/intake/images.

describe("simulated-phone fixtures", () => {
  it("allows exactly the ids that have an image", () => {
    expect([...FIXTURE_IDS].sort()).toEqual(["blurry", "buffet_ambiguous", "malformed_output", "pasta_tray", "sandwich_platter"]);
  });

  it.each(["sandwich_platter", "pasta_tray"])("reads %s as a JPEG, untouched", async (id) => {
    const result = await readFixtureImage(id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.image.mime).toBe("image/jpeg");
    expect(Array.from(result.image.bytes.subarray(0, 3))).toEqual([0xff, 0xd8, 0xff]);
  });

  it.each(["../../etc/passwd", "sandwich_platter.jpg", "", "SANDWICH_PLATTER", "pasta-tray"])(
    "refuses %j as not found, without touching the disk",
    async (id) => {
      expect(isFixtureId(id)).toBe(false);
      expect(await readFixtureImage(id)).toEqual({ ok: false, reason: "not_found" });
    },
  );

  it("reports unavailable if an allowed id's file is missing", async () => {
    expect(await readFixtureImage("blurry", "/nonexistent-directory")).toEqual({ ok: false, reason: "unavailable" });
  });
});
