import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDispatchStore } from "@/db";
import { assertStoreMatchesEnv, describeError, withEnvStore } from "@/db/cli";
import { closeStore, storeInternals } from "@/db/internal";
import { runMigrations } from "@/db/run-migrations";
import { SEED_IDENTITY_IDS, seedStore } from "@/db/seed/seed";
import { messaging_identities } from "@/db/schema";

// The `pnpm db:*` plumbing: errors never print query params (they can hold phone handles), a Postgres URL is never
// silently ignored, a close failure never hides the real error, and a re-seed reports identities it could not update.

vi.mock("@/db/internal", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/db/internal")>();
  return { ...real, closeStore: vi.fn(real.closeStore) };
});

const NOW = new Date("2026-10-17T23:10:00.000Z");
const PHONE = "+15550100123"; // synthetic
const envOf = (vars: Record<string, string>): NodeJS.ProcessEnv => ({ NODE_ENV: "test", ...vars });

afterEach(() => vi.restoreAllMocks());

describe("describeError", () => {
  // The shape drizzle-orm 0.45 throws: message is `Failed query: <sql>\nparams: <values>`, the driver error is the cause.
  const drizzleStyle = () => {
    const driver = Object.assign(new Error('duplicate key value violates unique constraint "messaging_identities_provider_handle_uq"'), {
      code: "23505",
      constraint_name: "messaging_identities_provider_handle_uq",
    });
    return Object.assign(new Error(`Failed query: insert into messaging_identities ...\nparams: ${PHONE},photon`), {
      query: "insert into messaging_identities ...",
      params: [PHONE, "photon"],
      cause: driver,
    });
  };

  it("never prints the query params, but keeps the SQLSTATE and constraint name", () => {
    const text = describeError(drizzleStyle());
    expect(text).not.toContain(PHONE);
    expect(text).not.toContain("params:");
    expect(text).toContain("query failed");
    expect(text).toContain("code 23505");
    expect(text).toContain("constraint messaging_identities_provider_handle_uq");
  });

  it("masks secrets that appear in a message", () => {
    const url = "postgres://user:pw@db.example.invalid:5432/app";
    expect(describeError(new Error(`connect failed: ${url}`), [url, undefined])).toBe("connect failed: <redacted>");
  });

  it("handles plain errors, non-errors and a cause cycle", () => {
    expect(describeError(new Error("boom"))).toBe("boom");
    expect(describeError("just a string")).toBe("just a string");
    const a: Error & { cause?: unknown } = new Error("a");
    const b: Error & { cause?: unknown } = new Error("b");
    a.cause = b;
    b.cause = a;
    expect(describeError(a)).toBe("a\n  caused by: b");
  });
});

describe("assertStoreMatchesEnv", () => {
  it("refuses DATABASE_URL with the pglite store, allows every other combination", () => {
    expect(() => assertStoreMatchesEnv({ store: "pglite", database_url: "postgres://x" })).toThrow(/STORE=postgres/);
    expect(() => assertStoreMatchesEnv({ store: "pglite", database_url: undefined })).not.toThrow();
    expect(() => assertStoreMatchesEnv({ store: "postgres", database_url: "postgres://x" })).not.toThrow();
  });
});

describe("withEnvStore", () => {
  const withTmpDir = async (fn: (dir: string) => Promise<void>) => {
    const dir = mkdtempSync(join(tmpdir(), "annona-cli-"));
    try {
      await fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it("runs fn against the store described by the env and closes it", async () => {
    await withTmpDir(async (dir) => {
      vi.mocked(closeStore).mockClear();
      const seen = await withEnvStore(async (store, env) => {
        await runMigrations(store);
        return { kind: store.kind, provider: env.messaging_provider };
      }, envOf({ PGLITE_DIR: dir }));
      expect(seen).toEqual({ kind: "pglite", provider: "fake" });
      expect(vi.mocked(closeStore)).toHaveBeenCalledTimes(1);
    });
  });

  it("rejects before opening anything when DATABASE_URL would be ignored", async () => {
    vi.mocked(closeStore).mockClear();
    const fn = vi.fn();
    await expect(withEnvStore(fn, envOf({ DATABASE_URL: "postgres://u:p@db.example.invalid/app" }))).rejects.toThrow(/STORE=postgres/);
    expect(fn).not.toHaveBeenCalled();
    expect(vi.mocked(closeStore)).not.toHaveBeenCalled();
  });

  it("a close failure does not hide the error from fn", async () => {
    await withTmpDir(async (dir) => {
      const real = await vi.importActual<typeof import("@/db/internal")>("@/db/internal");
      vi.mocked(closeStore).mockImplementationOnce(async (s) => {
        await real.closeStore(s);
        throw new Error("close boom");
      });
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      await expect(
        withEnvStore(async () => {
          throw new Error("the real failure");
        }, envOf({ PGLITE_DIR: dir })),
      ).rejects.toThrow("the real failure");
      expect(logged).toHaveBeenCalledWith(expect.stringContaining("close boom"));
    });
  });

  it("a close failure is reported when fn succeeded", async () => {
    await withTmpDir(async (dir) => {
      const real = await vi.importActual<typeof import("@/db/internal")>("@/db/internal");
      vi.mocked(closeStore).mockImplementationOnce(async (s) => {
        await real.closeStore(s);
        throw new Error("close boom");
      });
      await expect(withEnvStore(async () => "ok", envOf({ PGLITE_DIR: dir }))).rejects.toThrow("close boom");
    });
  });
});

describe("seedStore report", () => {
  const fresh = async () => {
    const s = createDispatchStore({ kind: "pglite", database_url: undefined, pglite_dir: undefined });
    await runMigrations(s);
    return s;
  };
  const photon = { donor: "d@t.test", courier_a: "a@t.test", courier_b: "b@t.test" };

  it("reports nothing on a first seed and on a repeat with the same options", async () => {
    const s = await fresh();
    try {
      expect(await seedStore(s, { now: NOW, messaging_provider: "fake" })).toEqual({ stale_identities: [] });
      expect(await seedStore(s, { now: NOW, messaging_provider: "fake" })).toEqual({ stale_identities: [] });
    } finally {
      await closeStore(s);
    }
  });

  it("names a joined identity whose provider/handle the seed could not update, without printing handles", async () => {
    const s = await fresh();
    try {
      await seedStore(s, { now: NOW, messaging_provider: "fake" });
      const { db } = storeInternals(s);
      await db.update(messaging_identities).set({ status: "joined", joined_at: NOW }).where(eq(messaging_identities.id, SEED_IDENTITY_IDS.courier_a));
      const report = await seedStore(s, { now: NOW, messaging_provider: "photon", handles: photon });
      expect(report.stale_identities).toEqual([
        { id: SEED_IDENTITY_IDS.courier_a, actor_role: "courier", status: "joined", provider_differs: true, handle_differs: true },
      ]);
      const text = JSON.stringify(report);
      for (const h of Object.values(photon)) expect(text).not.toContain(h);
    } finally {
      await closeStore(s);
    }
  });
});
