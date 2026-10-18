import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// D-040: eval photos of unverified licence stay on the developer's machine.
const ignored = (path: string) => spawnSync("git", ["check-ignore", "-q", path]).status === 0;

describe(".gitignore (D-040)", () => {
  it("ignores the local eval photo folder", () => {
    expect(ignored("fixtures/intake/eval-local/sushi_tray.jpg")).toBe(true);
  });
  it("does not ignore the committed fake-provider and demo images", () => {
    expect(ignored("fixtures/intake/images/pasta_tray.jpg")).toBe(false);
    expect(ignored("fixtures/intake/PROVENANCE.md")).toBe(false);
  });
  it("does not ignore env.example but still ignores local env files", () => {
    expect(ignored(".env.example")).toBe(false);
    expect(ignored(".env.local")).toBe(true);
  });
});
