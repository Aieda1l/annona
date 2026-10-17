import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { err } from "@/contracts";
import { toResponse } from "@/server/http";
import { FIXTURE_IDS } from "@/lib/ai/fake";
import { createDraftFromImage } from "../index";
import { readJson, requireDonor } from "./common";

// POST /api/intake/drafts (CONTRACTS §10). Donor session only; the actor comes from the signed cookie.
// Body: { image: { mime, bytes_base64 } } or { fixture_id }. Thin: size and MIME rules live in the service.

const MAX_BODY_CHARS = 3_000_000; // 1.5 MiB of bytes is ~2.1M base64 chars; the service enforces the exact limit

const Body = z.union([
  z.strictObject({ image: z.strictObject({ mime: z.string(), bytes_base64: z.string() }) }),
  z.strictObject({ fixture_id: z.enum(FIXTURE_IDS) }),
]);

export function createDraftsHandler(deps: { createDraftFromImage: typeof createDraftFromImage }) {
  return async function POST(request: Request): Promise<Response> {
    const actor = await requireDonor(request);
    if (!actor.ok) return toResponse(actor);

    const json = await readJson(request, MAX_BODY_CHARS);
    if (!json.ok) return toResponse(json);
    const body = Body.safeParse(json.data);
    if (!body.success) return toResponse(err("VALIDATION_FAILED", "Body must be { image } or { fixture_id }."));

    if ("image" in body.data) {
      return toResponse(await deps.createDraftFromImage({ actor: actor.data, image: body.data.image, source: "web_upload" }));
    }

    // fixture_id is an enum of known ids, so it cannot carry a path.
    let bytes: Buffer;
    try {
      bytes = await readFile(join(process.cwd(), "fixtures/intake/images", `${body.data.fixture_id}.jpg`));
    } catch {
      return toResponse(err("NOT_FOUND", "Fixture image is not available."));
    }
    return toResponse(
      await deps.createDraftFromImage({
        actor: actor.data,
        image: { mime: "image/jpeg", bytes_base64: bytes.toString("base64") },
        source: "fixture",
      }),
    );
  };
}

export const POST = createDraftsHandler({ createDraftFromImage });
