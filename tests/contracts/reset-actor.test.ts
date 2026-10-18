// resetDemo deletes every donation, offer, link and photo, so the contract names who is asking (D-041 era request
// docs/requests/dispatch-reset-actor.md, contracts v0.6). This is a compile-time check: `pnpm typecheck` fails if the type
// stops requiring an operator-capable actor, because the @ts-expect-error below would then be unused.
import { describe, expect, it } from "vitest";
import type { Actor, ResetDemoFn } from "@/contracts";

describe("ResetDemoFn", () => {
  it("requires the caller's actor in its input", () => {
    const operator: Actor = { role: "operator", id: "00000000-0000-4000-8000-000000000001" };
    const reset: ResetDemoFn = async () => ({ ok: true, data: { reset_at: "2026-10-18T00:00:00.000Z" } });
    // @ts-expect-error the actor is required, so an input without it does not type-check
    void reset({ keep_identities: true });
    void reset({ keep_identities: true, actor: operator });
    expect(true).toBe(true);
  });
});
