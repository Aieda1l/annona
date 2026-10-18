import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ClaimResult } from "@/contracts";
import { claimOffer, createNextOffers, declineOffer, openOfferForSend } from "@/core";
import { createDispatchStore } from "@/db";
import { closeStore, storeInternals } from "@/db/internal";
import { runMigrations } from "@/db/run-migrations";
import { buildSeed, describeStaleIdentity, resolveHandles } from "@/db/seed/seed";
import { donations, offers, policy_config } from "@/db/schema";
import { COURIER_A, T0, at, courierActor, insertDonation, insertOffer, makeEligibleDonation, makeWorld, resetWorld, type World } from "./helpers/world";

// Follow-ups from the #21 review (captain) and Dev 3's review of #29. Each failed before its fix.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

let w: World;
beforeAll(async () => {
  w = await makeWorld();
});
afterAll(async () => w.close());
beforeEach(async () => resetWorld(w));

describe("a fresh checkout can open a PGlite store in a folder whose parent does not exist yet", () => {
  it("creates the missing parent folders", async () => {
    const root = mkdtempSync(join(tmpdir(), "annona-fresh-"));
    const store = createDispatchStore({ kind: "pglite", database_url: undefined, pglite_dir: join(root, ".data", "nested", "pglite") });
    try {
      await runMigrations(store);
      expect((await storeInternals(store).db.select().from(policy_config)).length).toBe(0); // opened and migrated
    } finally {
      await closeStore(store);
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("seed handles: a real handle in the wrong shape must fail loudly, naming the variable and never echoing the value", () => {
  const E164 = "+" + ["4930", "1234567"].join("");
  const handles = (over: Record<string, string>) => ({ messaging_provider: "photon" as const, handles: { donor: "d@t.test", courier_a: "a@t.test", courier_b: "b@t.test", ...over } });
  it.each([
    ["donor", "DEMO_DONOR_HANDLE", "9199207442"],
    ["courier_a", "DEMO_COURIER_A_HANDLE", "(919) 920-7442"],
    ["courier_b", "DEMO_COURIER_B_HANDLE", "not a handle"],
    ["donor", "DEMO_DONOR_HANDLE", "@missing-local.com"],
    ["donor", "DEMO_DONOR_HANDLE", "a@b"],
    ["courier_a", "DEMO_COURIER_A_HANDLE", "+0123456789"],
    ["courier_b", "DEMO_COURIER_B_HANDLE", "+12"],
  ])("%s with %j is refused, naming %s", (key, variable, bad) => {
    let message = "";
    try {
      resolveHandles(handles({ [key]: bad }));
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain(variable);
    expect(message).not.toContain(bad);
  });
  it("accepts E.164 numbers and emails, and lowercases the emails", () => {
    const h = resolveHandles(handles({ donor: E164, courier_a: " Foo.Bar@Example.COM ", courier_b: "x+tag@mail.test" }));
    expect(h).toMatchObject({ donor: E164, courier_a: "foo.bar@example.com", courier_b: "x+tag@mail.test" });
  });
  it("two handles that differ only by case are the same person and are refused", () => {
    expect(() => resolveHandles(handles({ donor: "Same@T.test", courier_a: "same@t.test" }))).toThrow(/differ/);
  });
  it("fake mode keeps its leniency (synthetic handles) but still lowercases emails", () => {
    const h = resolveHandles({ messaging_provider: "fake", handles: { donor: "Donor@Example.Invalid" } });
    expect(h.donor).toBe("donor@example.invalid");
    expect(buildSeed({ now: T0, messaging_provider: "fake" }).identityRows.every((r) => r.handle === r.handle.toLowerCase())).toBe(true);
  });
});

describe("the stale-identity warning names a remedy that exists", () => {
  it("says to set the identity back to awaiting_join and re-run the seed, and never mentions resetDemo", () => {
    const text = describeStaleIdentity({ id: "id-1", actor_role: "courier", status: "joined", provider_differs: true, handle_differs: true });
    expect(text).toContain("id-1");
    expect(text).toContain("awaiting_join");
    expect(text).toContain("pnpm db:seed");
    expect(text).not.toMatch(/resetDemo|un-join/);
    expect(text).toContain("provider and handle");
  });
});

async function openOne() {
  const id = await makeEligibleDonation(w);
  const created = await createNextOffers({ donation_id: id }, w.deps());
  const offer = created.ok ? created.data[0]! : (undefined as never);
  await openOfferForSend({ offer_id: offer.id }, w.deps());
  return { id, offer };
}
const cmd = (offer_id: string) => ({ offer_ref: { offer_id }, actor: courierActor(COURIER_A), source: "messaging" as const, source_event_id: null });
const breakPolicy = () => w.db.update(policy_config).set({ config: { broken: true } }).where(eq(policy_config.active, true));

describe("a system fault is not an ineligible pickup: nothing is cancelled and nobody is told no (Dev 3 review)", () => {
  it("claimOffer with an unreadable policy fails the call and leaves the offer open and the donation offered", async () => {
    const { id, offer } = await openOne();
    await breakPolicy();
    await expect(claimOffer(cmd(offer.id), w.deps(at(0.2)))).rejects.toThrow();
    expect((await w.db.select().from(offers).where(eq(offers.id, offer.id)))[0]).toMatchObject({ status: "open", close_reason: null });
    expect((await w.db.select().from(donations).where(eq(donations.id, id)))[0]!.status).toBe("offered");
  });
  it("a corrupt policy is an INTERNAL result in dispatch, not a raw schema error", async () => {
    const id = await makeEligibleDonation(w);
    await breakPolicy();
    expect(await createNextOffers({ donation_id: id }, w.deps())).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
  });
  it("openOfferForSend with a corrupt policy is an INTERNAL result and the offer stays pending", async () => {
    const id = await makeEligibleDonation(w);
    const created = await createNextOffers({ donation_id: id }, w.deps());
    const offer = created.ok ? created.data[0]! : (undefined as never);
    await breakPolicy();
    expect(await openOfferForSend({ offer_id: offer.id }, w.deps())).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    expect((await w.db.select().from(offers).where(eq(offers.id, offer.id)))[0]!.status).toBe("pending_send");
  });
});

describe("a replay never reports success without an assignment (Dev 3 review)", () => {
  it("if the facts can no longer be read, the replay is not already_claimed_by_you, and the result still satisfies the schema", async () => {
    const { id, offer } = await openOne();
    expect((await claimOffer(cmd(offer.id), w.deps(at(0.2)))).code).toBe("claimed");
    await w.db.update(donations).set({ verified_facts: null }).where(eq(donations.id, id));
    const again = await claimOffer(cmd(offer.id), w.deps(at(0.4)));
    expect(again.code).not.toBe("already_claimed_by_you");
    expect(again.assignment).toBeNull();
    expect(ClaimResult.safeParse(again).success).toBe(true);
  });
});

describe("an offer that was never sent cannot be answered (a guessed short code)", () => {
  it("claim and decline on a pending_send offer are offer_closed, and change nothing", async () => {
    const id = await makeEligibleDonation(w);
    const created = await createNextOffers({ donation_id: id }, w.deps());
    const offer = created.ok ? created.data[0]! : (undefined as never);
    expect(await claimOffer(cmd(offer.id), w.deps(at(0.2)))).toMatchObject({ code: "offer_closed", assignment: null });
    expect(await declineOffer(cmd(offer.id), w.deps(at(0.2)))).toMatchObject({ code: "offer_closed" });
    expect((await w.db.select().from(offers).where(eq(offers.id, offer.id)))[0]!.status).toBe("pending_send");
    expect((await w.db.select().from(donations).where(eq(donations.id, id)))[0]!.status).toBe("offered");
    void insertDonation;
    void insertOffer;
  });
});
