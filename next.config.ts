import type { NextConfig } from "next";

// Captain-controlled shared config (CLAUDE.md). Change only via a contract-change request.
const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  outputFileTracingIncludes: {
    "/api/intake/drafts": ["./fixtures/intake/images/**"],
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
