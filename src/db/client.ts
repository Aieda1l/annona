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
  if (config.kind === "postgres") {
    if (!config.database_url) throw new Error("createDispatchStore: kind 'postgres' needs database_url (it never falls back to pglite).");
    // Supabase transaction pooler (port 6543) needs prepared statements off (R-INF-7).
    const client = postgres(config.database_url, { prepare: false });
    return { kind: "postgres", db: drizzlePostgres(client, { schema }) as unknown as Db, close: () => client.end() };
  }
  // pglite_dir undefined = in-memory (tests). A directory persists between runs.
  const client = new PGlite(config.pglite_dir);
  return { kind: "pglite", db: drizzlePglite(client, { schema }) as unknown as Db, close: () => client.close() };
}
