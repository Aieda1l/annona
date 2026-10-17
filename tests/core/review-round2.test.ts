import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDispatchStore } from "@/db";
import { closeStore } from "@/db/internal";
import { runMigrations } from "@/db/run-migrations";
import { buildSeed } from "@/db/seed/seed";

// Dev 3's review of #21: MEDIUM 1 (fresh clone has no .data/) and MEDIUM 2 (a handle in the wrong shape never matches).

const NOW = new Date("2026-10-17T20:00:00.000Z");
const ok = { donor: "+10000000001", courier_a: "+10000000002", courier_b: "Courier@Example.com" };

describe("PGlite directory on a fresh checkout (MEDIUM 1)", () => {
  it("creates a not-yet-existing nested folder instead of failing with ENOENT", async () => {
    const root = mkdtempSync(join(tmpdir(), "annona-fresh-"));
    const dir = join(root, ".data", "pglite");
    try {
      expect(existsSync(join(root, ".data"))).toBe(false);
      const s = createDispatchStore({ kind: "pglite", database_url: undefined, pglite_dir: dir });
      await runMigrations(s);
      await closeStore(s);
      expect(existsSync(dir)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);
});

describe("photon handle shape (MEDIUM 2)", () => {
  const build = (handles: Partial<typeof ok>) => buildSeed({ now: NOW, messaging_provider: "photon", handles: { ...ok, ...handles } });

  it("accepts E.164 phones and emails, and lowercases emails", () => {
    const { identityRows } = build({});
    expect(identityRows.map((r) => r.handle)).toEqual(["+10000000001", "+10000000002", "courier@example.com"]);
  });

  it.each(["10000000001", "(000) 000-0001", "+0123456789", "+1999", "not a handle", "a@b", "a b@c.d"])(
    "rejects %j, names the variable, and never echoes the value",
    (bad) => {
      let message = "";
      try {
        build({ donor: bad });
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toMatch(/DEMO_DONOR_HANDLE/);
      expect(message).toMatch(/E\.164|email/);
      expect(message).not.toContain(bad);
    },
  );

  it("names the right variable for each persona", () => {
    expect(() => build({ courier_a: "555" })).toThrow(/DEMO_COURIER_A_HANDLE/);
    expect(() => build({ courier_b: "555" })).toThrow(/DEMO_COURIER_B_HANDLE/);
  });

  it("does not apply the shape rule to fake mode", () => {
    const { identityRows } = buildSeed({ now: NOW, messaging_provider: "fake", handles: { donor: "whatever" } });
    expect(identityRows[0]?.handle).toBe("whatever");
  });
});
