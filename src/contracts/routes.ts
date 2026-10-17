// CONTRACTS section 10 as constants (contracts-2b). Changing a path, method, owner or auth is a contract change.
// Each route has a thin src/app/api/**/route.ts re-export (Dev 4); the owner lane owns the handler module.

export type RouteMethod = "GET" | "POST" | "DELETE";
export type RouteOwner = "captain" | "dev1" | "dev2" | "dev3";

export type RouteSpec = {
  readonly method: RouteMethod;
  /** Next.js style: `:id` is a path parameter; a query string is not part of the path. */
  readonly path: string;
  readonly owner: RouteOwner;
  /** Plain-language auth rule from section 10. The handler enforces it; the UI never does. */
  readonly auth: string;
};

export const ROUTES = [
  { method: "GET", path: "/api/health", owner: "captain", auth: "public" },
  { method: "GET", path: "/api/session/actors", owner: "captain", auth: "public, demo mode only" },
  { method: "POST", path: "/api/session", owner: "captain", auth: "demo passcode" },
  { method: "DELETE", path: "/api/session", owner: "captain", auth: "demo passcode" },
  { method: "POST", path: "/api/intake/drafts", owner: "dev1", auth: "donor" },
  { method: "POST", path: "/api/donations/:id/verification", owner: "dev1", auth: "owning donor" },
  { method: "POST", path: "/api/verify/view", owner: "dev1", auth: "valid verification link token; never consumes" },
  { method: "POST", path: "/api/verify/image", owner: "dev1", auth: "valid verification link token; never consumes" },
  { method: "POST", path: "/api/verify/submit", owner: "dev1", auth: "valid verification link token; consumed atomically on success" },
  { method: "GET", path: "/api/donations/:id", owner: "dev2", auth: "owning donor, operator" },
  { method: "GET", path: "/api/dashboard", owner: "dev2", auth: "operator" },
  { method: "POST", path: "/api/donations/:id/operator-actions", owner: "dev2", auth: "operator" },
  { method: "POST", path: "/api/donations/:id/handoff", owner: "dev2", auth: "claiming courier (collected), assigned recipient (delivered), operator" },
  { method: "GET", path: "/api/images/:id", owner: "dev2", auth: "owning donor, operator" },
  { method: "POST", path: "/api/demo/reset", owner: "dev2", auth: "operator, demo mode only" },
  { method: "POST", path: "/api/donations/:id/dispatch", owner: "dev3", auth: "operator" },
  { method: "POST", path: "/api/internal/tick", owner: "dev3", auth: "x-annona-internal-secret header, or an operator session" },
  { method: "POST", path: "/api/messaging/photon/inbound", owner: "dev3", auth: "valid Photon webhook signature, or x-annona-internal-secret" },
  { method: "POST", path: "/api/messaging/simulated/inbound", owner: "dev3", auth: "operator, demo mode and MESSAGING_PROVIDER=fake only" },
  { method: "GET", path: "/api/messaging/simulated/thread", owner: "dev3", auth: "operator, demo mode and MESSAGING_PROVIDER=fake only" },
] as const satisfies readonly RouteSpec[];

/** Repo-relative path of the thin route file for a route (`:id` becomes `[id]`). */
export function routeFile(r: Pick<RouteSpec, "path">): string {
  return `src/app${r.path.replace(/:([A-Za-z_]+)/g, "[$1]")}/route.ts`;
}
