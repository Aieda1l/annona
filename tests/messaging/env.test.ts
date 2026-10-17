import { afterEach, describe, expect, it, vi } from "vitest";
import { internalSecretFromEnv } from "@/workflows/http/auth";

// The internal-secret routes and the worker read ANNONA_INTERNAL_SECRET through getEnv() (never process.env directly).
// An unset or blank value must leave the internal-secret path closed.

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("internalSecretFromEnv", () => {
  it("returns the configured secret", () => {
    vi.stubEnv("ANNONA_INTERNAL_SECRET", "a-test-secret");
    expect(internalSecretFromEnv()).toBe("a-test-secret");
  });

  it.each([undefined, "", "   "])("returns undefined (path closed) when the value is %j", (value) => {
    vi.stubEnv("ANNONA_INTERNAL_SECRET", value as string);
    expect(internalSecretFromEnv()).toBeUndefined();
  });
});
