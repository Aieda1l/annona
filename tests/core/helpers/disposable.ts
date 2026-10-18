import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";

// Gated Postgres tests (TEST_DATABASE_URL) migrate, seed and wipe the database they are pointed at, so they refuse
// anything that is not obviously disposable. Never point TEST_DATABASE_URL at the shared demo database.

export function databaseName(url: string): string | undefined {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, "")) || undefined;
  } catch {
    return undefined;
  }
}

/** Accepts a database whose name contains the whole word test, tests or disposable (annona_test, disposable-1). */
export function assertDisposableDatabase(url: string): void {
  const name = databaseName(url);
  if (!name || !/(^|[_-])(test|tests|disposable)([_-]|$)/i.test(name)) {
    throw new Error("TEST_DATABASE_URL must point at a disposable database whose name contains 'test' or 'disposable' (e.g. annona_test). Refusing to use it.");
  }
}

/**
 * Drops every table the tests created (the public and drizzle schemas) in the disposable database. It checks the name
 * again and that the connection really is to that database, so it can never empty anything else.
 */
export async function emptyDisposableDatabase(db: Db, url: string): Promise<void> {
  assertDisposableDatabase(url);
  const [row] = (await db.execute(sql`select current_database() as name`)) as unknown as { name: string }[];
  if (row?.name !== databaseName(url)) throw new Error("connected to an unexpected database; nothing was dropped");
  await db.execute(sql.raw("drop schema if exists drizzle cascade"));
  await db.execute(sql.raw("drop schema public cascade"));
  await db.execute(sql.raw("create schema public"));
}
