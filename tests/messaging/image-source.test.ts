import { describe, expect, it, vi } from "vitest";
import type { FetchImageResult } from "@/integrations/photon/attachments";
import { createImageSource } from "@/workflows/image-source";

// Where a donor photo comes from: a Photon attachment in real mode, an allowlisted fixture id from the labeled simulated
// phone in fake mode. A fixture id must never be honored in real mode (defense in depth: Photon messages carry none).

const photoBytes: FetchImageResult = { ok: true, image: { mime: "image/jpeg", bytes: new Uint8Array([0xff, 0xd8, 0xff]) } };

function setup(provider: "photon" | "fake", withPhoton = true) {
  const photonFetch = vi.fn(async () => photoBytes);
  const readFixture = vi.fn(async () => photoBytes);
  const source = createImageSource({ provider, photon: withPhoton ? { fetchImage: photonFetch } : null, readFixture });
  return { source, photonFetch, readFixture };
}

describe("createImageSource", () => {
  it("real mode downloads the Photon attachment", async () => {
    const { source, photonFetch, readFixture } = setup("photon");
    expect(await source({ provider_attachment_id: "pho_att_1" })).toBe(photoBytes);
    expect(photonFetch).toHaveBeenCalledWith("pho_att_1");
    expect(readFixture).not.toHaveBeenCalled();
  });

  it("real mode ignores a fixture id", async () => {
    const { source, readFixture } = setup("photon");
    expect(await source({ fixture_id: "sandwich_platter" })).toEqual({ ok: false, reason: "not_found" });
    expect(readFixture).not.toHaveBeenCalled();
  });

  it("real mode without Photon credentials finds nothing", async () => {
    const { source } = setup("photon", false);
    expect(await source({ provider_attachment_id: "pho_att_1" })).toEqual({ ok: false, reason: "not_found" });
  });

  it("fake mode reads the fixture and never calls Photon", async () => {
    const { source, photonFetch, readFixture } = setup("fake");
    expect(await source({ fixture_id: "sandwich_platter", provider_attachment_id: "pho_att_1" })).toBe(photoBytes);
    expect(readFixture).toHaveBeenCalledWith("sandwich_platter");
    expect(photonFetch).not.toHaveBeenCalled();
  });

  it("fake mode with no fixture id finds nothing", async () => {
    const { source } = setup("fake");
    expect(await source({ provider_attachment_id: "pho_att_1" })).toEqual({ ok: false, reason: "not_found" });
  });
});
