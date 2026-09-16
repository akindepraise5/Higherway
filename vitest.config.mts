import { defineConfig } from "vitest/config"

/**
 * Unit tests cover src/lib — which is pure by design (see CLAUDE.md), so these
 * run with no database, no network and no environment.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
    exclude: ["node_modules", ".next", "tests/e2e/**"],
  },
})
