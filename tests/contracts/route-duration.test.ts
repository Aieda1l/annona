// Routes that can wait on the vision model need a function time limit above the model budget, or the platform can cut
// the request off before the app's own timeout answers (and the donor then sees a generic error instead of the
// fail-closed "AI draft not available" path). The vision budget is 15 s (D-012, `VISION_TIMEOUT_MS`); the limit is 30 s.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const VISION_ROUTES = [
  "src/app/api/intake/drafts/route.ts", // web upload and fixture drafts
  "src/app/api/messaging/photon/inbound/route.ts", // a photo by message becomes a draft
  "src/app/api/messaging/simulated/inbound/route.ts", // the simulated phone does the same
];

describe("routes that wait on the vision model", () => {
  it.each(VISION_ROUTES)("%s sets maxDuration to 30 seconds", (path) => {
    const source = readFileSync(join(process.cwd(), path), "utf8");
    expect(source).toMatch(/^export const maxDuration = 30;$/m);
  });

  it("30 seconds is above the app's own vision budget, so the app's timeout answers first", () => {
    const service = readFileSync(join(process.cwd(), "src/features/intake/service.ts"), "utf8");
    const budget = Number(/export const VISION_TIMEOUT_MS = ([\d_]+);/.exec(service)?.[1]?.replaceAll("_", ""));
    expect(budget).toBeGreaterThan(0);
    expect(budget).toBeLessThan(30_000);
  });
});
