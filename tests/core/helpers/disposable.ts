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
