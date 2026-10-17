import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

// T-UI-07 (header side): the donor checklist page /v carries a one-time token in its URL fragment. The browser
// never sends the fragment to the server, but the page URL must not leak onward through the Referer header, and
// the response must never be cached.

type Rule = { source: string; headers: { key: string; value: string }[] };
const rules = async (): Promise<Rule[]> => (await nextConfig.headers!()) as Rule[];
const headerMap = (r: Rule) => Object.fromEntries(r.headers.map((h) => [h.key.toLowerCase(), h.value]));

describe("next.config headers", () => {
  it("defines a headers() function", () => {
    expect(typeof nextConfig.headers).toBe("function");
  });

  it("/v is never cached and sends no referrer", async () => {
    const rule = (await rules()).find((r) => r.source === "/v");
    expect(rule, "a rule for /v").toBeDefined();
    const h = headerMap(rule!);
    expect(h["referrer-policy"]).toBe("no-referrer");
    expect(h["cache-control"]).toBe("no-store");
  });

  it("covers /v only: no other route gets these headers from this config", async () => {
    const sources = (await rules()).map((r) => r.source);
    expect(sources).toEqual(["/v"]);
  });
});

// Deployment: files read at runtime with process.cwd() are invisible to Next's file tracing, so a serverless build
// can omit them. Every route that can run vision needs the fixture images (the fake provider hashes them) and the
// prompt file (the real adapter reads it; if it is missing the provider reports misconfigured and every draft fails).
describe("next.config outputFileTracingIncludes", () => {
  const includes = (nextConfig.outputFileTracingIncludes ?? {}) as Record<string, string[]>;
  const VISION_ROUTES = ["/api/intake/drafts", "/api/messaging/simulated/inbound", "/api/messaging/photon/inbound"];

  it.each(VISION_ROUTES)("%s traces the fixture images and the prompt files", (route) => {
    expect(includes[route], route).toBeDefined();
    expect(includes[route]).toContain("./fixtures/intake/images/**");
    expect(includes[route]).toContain("./src/lib/ai/prompts/**");
  });
});
