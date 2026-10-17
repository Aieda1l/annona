import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { DispatchStoreConfig } from "@/contracts";
import * as schema from "./schema";

// One Drizzle implementation, two drivers (D-006). Never silently switch drivers (prompt §6 step 1).

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export type OpenedDb = {
  kind: DispatchStoreConfig["kind"];
  db: Db;
  close: () => Promise<void>;
};

export function openDb(config: DispatchStoreConfig): OpenedDb {
  // Exactly the two contract kinds. Anything else is a bug, not a reason to pick a driver.
  if (config.kind !== "postgres" && config.kind !== "pglite") {
    throw new Error(`createDispatchStore: unknown store kind '${String(config.kind)}' (expected 'pglite' or 'postgres').`);
  }
  if (config.kind === "postgres") {
    if (!config.database_url || config.database_url.trim() === "") throw new Error("createDispatchStore: kind 'postgres' needs database_url (it never falls back to pglite).");
    // Supabase transaction pooler (port 6543) needs prepared statements off (R-INF-7).
    const client = postgres(config.database_url, { prepare: false });
    return { kind: "postgres", db: drizzlePostgres(client, { schema }) as unknown as Db, close: () => client.end() };
  }
  // pglite_dir undefined = in-memory (tests). A directory persists between runs.
  // PGlite does not create parent folders, so a fresh clone (no `.data/`) would fail with ENOENT.
  if (config.pglite_dir && !config.pglite_dir.includes("://")) mkdirSync(config.pglite_dir, { recursive: true });
  const client = new PGlite(config.pglite_dir);
  return {
    kind: "pglite",
    db: drizzlePglite(client, { schema }) as unknown as Db,
    close: async () => {
      // Closing before the WASM database finished starting would hang forever.
      await client.waitReady;
      await client.close();
    },
  };
}
