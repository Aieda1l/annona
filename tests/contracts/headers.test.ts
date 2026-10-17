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
