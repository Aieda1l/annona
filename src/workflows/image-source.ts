import type { FetchImageResult } from "@/integrations/photon/attachments";

// Where a donor photo comes from. Real mode downloads the Photon attachment; fake mode reads an allowlisted fixture id
// from the labeled simulated phone. A fixture id is never honored in real mode: Photon-normalized messages carry none,
// and a file read must not be reachable from a real inbound message (defense in depth).

export type ImageRef = { provider_attachment_id?: string; fixture_id?: string };

const notFound: FetchImageResult = { ok: false, reason: "not_found" };

export function createImageSource(deps: {
  provider: "photon" | "fake";
  photon: { fetchImage(attachmentId: string): Promise<FetchImageResult> } | null;
  readFixture(id: string): Promise<FetchImageResult>;
}) {
  return async function fetchImage(ref: ImageRef): Promise<FetchImageResult> {
    if (deps.provider === "photon") {
      return ref.provider_attachment_id && deps.photon ? deps.photon.fetchImage(ref.provider_attachment_id) : notFound;
    }
    return ref.fixture_id ? deps.readFixture(ref.fixture_id) : notFound;
  };
}
