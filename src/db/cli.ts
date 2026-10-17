import type { DispatchStore } from "@/contracts";
import { getEnv, type Env } from "@/server/env";
import { createDispatchStore } from "./index";
import { closeStore } from "./internal";

// Shared plumbing for the `pnpm db:*` commands (run from the repo root).

/**
 * Everything in a connection URL that must never be printed: the whole URL, its password and its user name.
 * A driver error may quote only a part of the URL, so masking the whole string alone is not enough. Very short user
 * names are left alone, because masking them would garble ordinary words.
 */
export function connectionSecrets(url: string | undefined): string[] {
  if (!url) return [];
  const out = [url];
  try {
    const u = new URL(url);
    const password = decodeURIComponent(u.password);
    const user = decodeURIComponent(u.username);
    if (password.length >= 3) out.push(password);
    if (user.length >= 4) out.push(user);
  } catch {
    // Not a parseable URL: the whole string is still masked.
  }
  return out;
}

/**
 * One line per error in the `cause` chain, safe to print.
 * Drizzle wraps a failed query in an error whose message is `Failed query: <sql>\nparams: <values>`. The params can hold
 * the demo phone handles (personal data, CONTRACTS §12), so the wrapper's message is never printed; the driver's own
 * error below it (SQLSTATE, constraint name) is what an operator needs. Anything equal to `secrets` is masked.
 */
export function describeError(err: unknown, secrets: Array<string | undefined> = []): string {
  const mask = (text: string) => secrets.reduce<string>((acc, s) => (s ? acc.split(s).join("<redacted>") : acc), text);
  const lines: string[] = [];
  const seen = new Set<unknown>();
  for (let e: unknown = err; e !== undefined && e !== null && !seen.has(e); ) {
    seen.add(e);
    if (typeof e !== "object") {
      lines.push(mask(String(e)));
      break;
    }
    const x = e as { message?: unknown; code?: unknown; constraint_name?: unknown; constraint?: unknown; params?: unknown; query?: unknown; cause?: unknown };
    const wrapsQuery = "params" in x && "query" in x;
    const constraint = x.constraint_name ?? x.constraint;
    const detail = [typeof x.code === "string" ? `code ${x.code}` : "", typeof constraint === "string" ? `constraint ${constraint}` : ""].filter(Boolean).join(", ");
    const message = wrapsQuery ? "query failed" : typeof x.message === "string" ? x.message : String(e);
    lines.push(mask(detail ? `${message} (${detail})` : message));
    e = x.cause;
  }
  return lines.join("\n  caused by: ");
}

/** Refuses an env that would silently use the local PGlite while a Postgres URL sits unused. */
export function assertStoreMatchesEnv(env: Pick<Env, "store" | "database_url">): void {
  if (env.store === "pglite" && env.database_url) {
    throw new Error("DATABASE_URL is set but STORE is not 'postgres', so this would use the local PGlite store. Set STORE=postgres, or unset DATABASE_URL.");
  }
}

/**
 * Opens the store described by the environment, runs `fn`, and closes the store. A failure while closing never hides
 * the error from `fn`.
 */
export async function withEnvStore<T>(fn: (store: DispatchStore, env: Env) => Promise<T>, source: NodeJS.ProcessEnv = process.env): Promise<T> {
  const env = getEnv(source);
  assertStoreMatchesEnv(env);
  const store = createDispatchStore({ kind: env.store, database_url: env.database_url, pglite_dir: env.pglite_dir });
  let failed = false;
  try {
    return await fn(store, env);
  } catch (err) {
    failed = true;
    throw err;
  } finally {
    try {
      await closeStore(store);
    } catch (closeErr) {
      if (!failed) throw closeErr;
      console.error(`also failed to close the store: ${describeError(closeErr, connectionSecrets(env.database_url))}`);
    }
  }
}

/** Runs a CLI `main`; prints a sanitized error and exits 1 on failure. */
export function runCli(main: () => Promise<void>): void {
  main().catch((err) => {
    console.error(describeError(err, [...connectionSecrets(process.env.DATABASE_URL), ...connectionSecrets(process.env.TEST_DATABASE_URL)]));
    process.exit(1);
  });
}
