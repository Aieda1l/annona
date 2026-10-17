import { describe, expect, it } from "vitest";
import { getEnv } from "@/server/env";

// CONTRACTS section 12: the messaging, seed and test env names added by chore/integration-env.
// getEnv takes an explicit source so these tests never touch process.env.

const parse = (source: Record<string, string | undefined>) => getEnv(source as NodeJS.ProcessEnv);

describe("getEnv: messaging names (Dev 3)", () => {
  it("defaults: tick interval 5000 ms, inbound mode poll, no secrets", () => {
    const env = parse({});
    expect(env.tick_interval_ms).toBe(5000);
    expect(env.photon_inbound_mode).toBe("poll");
    expect(env.internal_secret).toBeUndefined();
    expect(env.photon_webhook_secret).toBeUndefined();
  });

  it("treats empty strings (a copied .env.example) as unset", () => {
    const env = parse({
      ANNONA_INTERNAL_SECRET: "",
      TICK_INTERVAL_MS: "",
      PHOTON_INBOUND_MODE: "",
      PHOTON_WEBHOOK_SECRET: "",
    });
    expect(env.tick_interval_ms).toBe(5000);
    expect(env.photon_inbound_mode).toBe("poll");
    expect(env.internal_secret).toBeUndefined();
    expect(env.photon_webhook_secret).toBeUndefined();
  });

  it("reads the values when set", () => {
    const env = parse({
      ANNONA_INTERNAL_SECRET: "internal-secret-value",
      TICK_INTERVAL_MS: "2000",
      PHOTON_INBOUND_MODE: "socket",
      PHOTON_WEBHOOK_SECRET: "whk-value",
    });
    expect(env.internal_secret).toBe("internal-secret-value");
    expect(env.tick_interval_ms).toBe(2000);
    expect(env.photon_inbound_mode).toBe("socket");
    expect(env.photon_webhook_secret).toBe("whk-value");
  });

  it("accepts the three documented inbound modes and rejects anything else", () => {
    for (const mode of ["webhook", "socket", "poll"]) expect(parse({ PHOTON_INBOUND_MODE: mode }).photon_inbound_mode).toBe(mode);
    expect(() => parse({ PHOTON_INBOUND_MODE: "carrier-pigeon" })).toThrow();
  });

  it("rejects a tick interval that is not an integer of at least 500 ms", () => {
    for (const bad of ["abc", "0", "-5", "1.5", "499"]) expect(() => parse({ TICK_INTERVAL_MS: bad }), bad).toThrow();
    expect(parse({ TICK_INTERVAL_MS: "500" }).tick_interval_ms).toBe(500);
  });

  it("an invalid value never appears in the thrown error text", () => {
    let message = "";
    try {
      parse({ PHOTON_INBOUND_MODE: "LEAKME-9f3a" });
    } catch (e) {
      message = String(e instanceof Error ? e.message : e);
    }
    expect(message.length).toBeGreaterThan(0);
    expect(message).not.toContain("LEAKME-9f3a");
  });
});

describe("getEnv: seed and test names (Dev 2)", () => {
  it("handles and TEST_DATABASE_URL are undefined by default", () => {
    const env = parse({});
    expect(env.demo_donor_handle).toBeUndefined();
    expect(env.demo_courier_a_handle).toBeUndefined();
    expect(env.demo_courier_b_handle).toBeUndefined();
    expect(env.test_database_url).toBeUndefined();
  });

  it("trims handles and counts blank or whitespace-only values as unset", () => {
    const env = parse({
      DEMO_DONOR_HANDLE: "  donor@example.invalid  ",
      DEMO_COURIER_A_HANDLE: "   ",
      DEMO_COURIER_B_HANDLE: "",
      TEST_DATABASE_URL: "postgres://test.example.invalid/db",
    });
    expect(env.demo_donor_handle).toBe("donor@example.invalid");
    expect(env.demo_courier_a_handle).toBeUndefined();
    expect(env.demo_courier_b_handle).toBeUndefined();
    expect(env.test_database_url).toBe("postgres://test.example.invalid/db");
  });

  it("existing names are unchanged", () => {
    const env = parse({ ANNONA_DEMO_MODE: "1", STORE: "postgres" });
    expect(env.demo_mode).toBe(true);
    expect(env.store).toBe("postgres");
    expect(env.messaging_provider).toBe("fake");
    expect(env.vision_provider).toBe("fake");
  });
});
