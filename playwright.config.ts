import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

// End-to-end tests run the app against the SEPARATE test Supabase project (.env.test), never production.
config({ path: ".env.test" });

const PORT = 3100;
const enabled = Boolean(process.env.TEST_SUPABASE_URL && process.env.TEST_SUPABASE_ANON_KEY && process.env.TEST_SUPABASE_SERVICE_ROLE_KEY);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1, // the flow tests share one creative, in order
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 5"] }, testMatch: /mobile\.spec\.ts|a11y\.spec\.ts/ },
  ],
  webServer: enabled
    ? {
        // Production build: faster and what real users get (dev mode compiles each page on first visit).
        command: `npx next build && npx next start -p ${PORT}`,
        url: `http://localhost:${PORT}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 600_000,
        env: {
          NEXT_DIST_DIR: ".next-e2e",
          NEXT_PUBLIC_SUPABASE_URL: process.env.TEST_SUPABASE_URL!,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.TEST_SUPABASE_ANON_KEY!,
          SUPABASE_SERVICE_ROLE_KEY: process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!,
          NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`,
          CRON_SECRET: "e2e-secret",
        },
      }
    : undefined,
});
