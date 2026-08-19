import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/client-acceptance",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: process.env.CLIENT_ACCEPTANCE_BASE_URL || process.env.E2E_BASE_URL || "http://127.0.0.1:4173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // Accessibility assertions must inspect the settled UI, not intermediate
    // Framer Motion opacity frames whose transient blending produces
    // nondeterministic color-contrast findings across browsers and retries.
    reducedMotion: "reduce",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 5"] },
    },
  ],
});
