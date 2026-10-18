import type { NextConfig } from "next";

// Captain-controlled shared config (CLAUDE.md). Change only via a contract-change request.
const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  // Files read at runtime with process.cwd() are invisible to file tracing. Every route that can run vision needs the
  // fixture images (the fake provider hashes them) and the prompt files (the real adapter reads them; if they are
  // missing the provider reports misconfigured and every draft fails closed).
  outputFileTracingIncludes: {
    "/api/intake/drafts": ["./fixtures/intake/images/**", "./src/lib/ai/prompts/**"],
    "/api/messaging/simulated/inbound": ["./fixtures/intake/images/**", "./src/lib/ai/prompts/**"],
    "/api/messaging/photon/inbound": ["./fixtures/intake/images/**", "./src/lib/ai/prompts/**"],
  },
  // T-UI-07: the donor checklist page carries a one-time link. Never send the page URL onward and never cache it.
  async headers() {
    return [
      {
        source: "/v",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
