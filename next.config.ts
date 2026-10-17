import type { NextConfig } from "next";

// Captain-controlled shared config (CLAUDE.md). Change only via a contract-change request.
const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  outputFileTracingIncludes: {
    "/api/intake/drafts": ["./fixtures/intake/images/**"],
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
