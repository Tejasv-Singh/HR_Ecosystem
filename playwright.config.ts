import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false, // the suite shares one database
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "line" : [["list"]],
  timeout: 90_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      AUTH_URL: BASE_URL,
      EMAIL_DRIVER: "console",
      // Every scenario signs up and logs in from the same address; without this
      // the suite would spend most of its run behind a 429. See lib/rate-limit.ts.
      RATE_LIMIT_MULTIPLIER: "100",
    },
  },
});
