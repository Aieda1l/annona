import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import { Offer, DonationSource, ROUTES, routeFile, type RouteSpec } from "@/contracts";
import type * as F from "@/contracts";

// contracts-2b (CONTRACTS v0.5): Offer entity (section 3.8), the section 10 route table, and function signature types.

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("DonationSource and Offer (section 3.2, 3.8)", () => {
  const offer = {
    id: U(1),
    short_code: "K7M3",
    donation_id: U(2),
    recipient_id: U(3),
    courier_id: U(4),
    status: "open",
    wave_no: 1,
    created_at: "2026-10-17T23:00:00.000Z",
    sent_at: "2026-10-17T23:00:05.000Z",
    expires_at: "2026-10-17T23:01:05.000Z",
    responded_at: null,
    close_reason: null,
    provider_mode: "fake",
    provider_message_id: null,
    delivery_status: "unknown",
    candidate: {
      recipient_id: U(3),
      courier_id: U(4),
      eta_to_pickup_minutes: 5,
      transit_minutes: 12,
      estimated_pickup_at: "2026-10-17T23:06:00.000Z",
      estimated_dropoff_at: "2026-10-17T23:28:00.000Z",
      slack_minutes: 40,
      rank: 1,
    },
  };
  it("parses the documented offer and the three sources", () => {
    expect(Offer.safeParse(offer).success).toBe(true);
    expect(DonationSource.options).toEqual(["web_upload", "messaging", "fixture"]);
  });
  it("rejects a bad short code, wave 0 and unknown keys", () => {
    expect(Offer.safeParse({ ...offer, short_code: "ABCD1" }).success).toBe(false);
    expect(Offer.safeParse({ ...offer, short_code: "0000" }).success).toBe(false);
    expect(Offer.safeParse({ ...offer, wave_no: 0 }).success).toBe(false);
    expect(Offer.safeParse({ ...offer, courier_handle: "x" }).success).toBe(false);
  });
});

describe("ROUTES (CONTRACTS section 10)", () => {
  it("lists the 20 documented method+path pairs, each once", () => {
    expect(ROUTES).toHaveLength(20);
    const keys = ROUTES.map((r) => `${r.method} ${r.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every route has a thin route file that exports its method", () => {
    for (const r of ROUTES as readonly RouteSpec[]) {
      const file = join(process.cwd(), routeFile(r));
      expect(existsSync(file), `${r.method} ${r.path} -> ${routeFile(r)}`).toBe(true);
      expect(readFileSync(file, "utf8"), `${r.method} ${r.path}`).toMatch(new RegExp(`export\\s*\\{[^}]*\\b${r.method}\\b`));
    }
  });

  it("every route file in src/app/api is in the table", () => {
    const known = new Set((ROUTES as readonly RouteSpec[]).map((r) => routeFile(r)));
    const onDisk = (readdirSync(join(process.cwd(), "src/app/api"), { recursive: true }) as string[])
      .filter((f) => f.replaceAll("\\", "/").endsWith("route.ts"))
      .map((f) => `src/app/api/${f.replaceAll("\\", "/")}`);
    expect(onDisk.sort()).toEqual([...known].sort());
    expect(known.size).toBe(19); // 20 method+path pairs; /api/session holds POST and DELETE in one file
  });

  it("owners are the documented lanes and auth is never empty", () => {
    for (const r of ROUTES as readonly RouteSpec[]) {
      expect(["captain", "dev1", "dev2", "dev3"]).toContain(r.owner);
      expect(r.auth.length).toBeGreaterThan(0);
    }
  });

  it("only operator-facing demo routes mention demo mode", () => {
    const demo = (ROUTES as readonly RouteSpec[]).filter((r) => /demo mode/.test(r.auth)).map((r) => r.path);
    expect(demo.sort()).toEqual(
      ["/api/demo/reset", "/api/messaging/simulated/inbound", "/api/messaging/simulated/thread", "/api/session/actors"].sort(),
    );
  });
});

describe("function signature types (compile-time, checked by pnpm typecheck)", () => {
  it("pure-function inputs match CONTRACTS section 5 and 6 (v0.5)", () => {
    expectTypeOf<F.MatchInput["now"]>().toEqualTypeOf<Date>();
    expectTypeOf<F.EligibilityInput["now"]>().toEqualTypeOf<Date>();
    expectTypeOf<F.MatchInput["active_provider"]>().toEqualTypeOf<"photon" | "fake">();
    expectTypeOf<F.MatchInput["committed_servings"]>().toEqualTypeOf<Record<string, number>>();
    expectTypeOf<F.MatchInput["busy_courier_ids"]>().toEqualTypeOf<string[]>();
    // Matching never receives a handle.
    expectTypeOf<keyof F.MatchIdentity>().toEqualTypeOf<"actor_id" | "actor_role" | "status" | "provider">();
    expectTypeOf<F.FindCandidatesFn>().returns.toEqualTypeOf<F.MatchCandidate[]>();
    expectTypeOf<F.EvaluateEligibilityFn>().returns.toEqualTypeOf<F.EligibilityDecision>();
  });

  it("lane function types resolve to the documented results", () => {
    expectTypeOf<F.TickFn>().returns.resolves.toEqualTypeOf<F.TickReport>();
    expectTypeOf<F.GetDonationCardFn>().returns.resolves.toEqualTypeOf<F.Result<F.DonationCard>>();
    expectTypeOf<F.ClaimOfferFn>().returns.resolves.toEqualTypeOf<F.ClaimResult>();
    expectTypeOf<F.ListMessagesFn>().returns.resolves.toEqualTypeOf<F.ThreadMessage[]>();
  });
});
