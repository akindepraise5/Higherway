import { defineConfig, devices } from "@playwright/test"

/**
 * `reuseExistingServer` reuses **whatever answers on this port**, and it does
 * not check that the thing answering is this project. A different app left
 * running on 3000 produced ten failures that read exactly like regressions —
 * the first one asserted on an `<h1>` and found "Shop from top local vendors".
 *
 * So the port is overridable. Run against a Higherway dev server on another
 * port with `E2E_PORT=3005 pnpm test:e2e`, and read the failure twice before
 * believing it.
 */
const PORT = Number(process.env.E2E_PORT) || 3000
const baseURL = `http://localhost:${PORT}`

/**
 * End-to-end tests cover the flows that would hurt most if they broke:
 * invite → set password → sign in; upload → duplicate flagged → review;
 * search → open reader → download.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 14"] } },
  ],
  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
