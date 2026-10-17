import { existsSync } from "node:fs";
import { join } from "node:path";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import type { DispatchStore } from "@/contracts";
import { storeInternals } from "./internal";

// Resolved from the repo root (pnpm scripts, vitest and `next start` all run there); import.meta is unavailable under tsx/CJS.
const migrationsFolder = join(process.cwd(), "src", "db", "migrations");

/** Applies every generated migration; replayable from an empty database and safe to run twice. */
export async function runMigrations(store: DispatchStore): Promise<void> {
  const { kind, db } = storeInternals(store);
  if (!existsSync(join(migrationsFolder, "meta", "_journal.json"))) {
    throw new Error(`Migrations not found at ${migrationsFolder}. Run from the repo root (pnpm db:migrate).`);
  }
  // The two drivers expose different concrete database types; the migrators only need the shared query API.
  if (kind === "postgres") await migratePostgres(db as never, { migrationsFolder });
  else await migratePglite(db as never, { migrationsFolder });
}
