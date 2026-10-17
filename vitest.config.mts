import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

// Two projects: node by default, jsdom for component tests (tests/ui/**, tests/intake/**/*.tsx).
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["tests/**/*.test.{ts,tsx}"],
          exclude: ["tests/ui/**", "tests/intake/**/*.tsx", "**/node_modules/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["tests/ui/**/*.test.{ts,tsx}", "tests/intake/**/*.test.tsx"],
          setupFiles: ["./tests/setup-jsdom.ts"],
        },
      },
    ],
  },
});
