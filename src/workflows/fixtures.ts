import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FetchImageResult } from "@/integrations/photon/attachments";

// Fixture photos for the labeled simulated phone (CONTRACTS §10): fake mode has no Photon attachment, so the phone sends
// a fixture id and the server reads the image here. The ids mirror Dev 1's fixtures/intake/images/*.jpg. Only an exact
// allowlisted id ever becomes a file name, so an id can never carry a path.

export const FIXTURE_IDS = ["sandwich_platter", "buffet_ambiguous", "pasta_tray", "blurry", "malformed_output"] as const;
export type FixtureId = (typeof FIXTURE_IDS)[number];

export const isFixtureId = (value: string): value is FixtureId => (FIXTURE_IDS as readonly string[]).includes(value);

// NOTE (deployment): resolved against process.cwd(). That is right for `pnpm start` / `pnpm dev` on the demo laptop, but
// fragile under a Next standalone or serverless build, where the images would have to be traced into the bundle.
const DEFAULT_DIR = () => join(process.cwd(), "fixtures/intake/images");

export async function readFixtureImage(id: string, dir: string = DEFAULT_DIR()): Promise<FetchImageResult> {
  if (!isFixtureId(id)) return { ok: false, reason: "not_found" };
  try {
    const bytes = new Uint8Array(await readFile(join(dir, `${id}.jpg`)));
    return { ok: true, image: { mime: "image/jpeg", bytes } };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
