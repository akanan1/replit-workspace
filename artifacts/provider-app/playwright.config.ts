import { defineConfig, devices } from "@playwright/test";

// Dedicated ports so the suite doesn't fight `pnpm dev` running on the
// usual 8080 / 5174.
const API_PORT = 8082;
const APP_PORT = 5175;
const APP_BASE_URL = `http://localhost:${APP_PORT}`;

if (!process.env["TEST_DATABASE_URL"]) {
  throw new Error(
    "TEST_DATABASE_URL must be set for E2E tests (separate from DATABASE_URL).",
  );
}

const testDatabaseUrl = process.env["TEST_DATABASE_URL"];

export default defineConfig({
  testDir: "./e2e",
  // Real-browser flows do real DB writes against a shared test DB —
  // serial keeps assertions deterministic. Switch to parallel after
  // adding per-worker schemas / data isolation.
  workers: 1,
  fullyParallel: false,
  reporter: process.env["CI"] ? "github" : "list",
  use: {
    baseURL: APP_BASE_URL,
    trace: "on-first-retry",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Boot both services. webServer waits for each to respond on its port
  // before the first test runs, and tears them down at the end.
  webServer: [
    {
      // api-server: bind to API_PORT, talk to the test database.
      command: "pnpm --filter @workspace/api-server run dev",
      url: `http://localhost:${API_PORT}/api/healthz`,
      timeout: 120_000,
      reuseExistingServer: !process.env["CI"],
      env: {
        PORT: String(API_PORT),
        DATABASE_URL: testDatabaseUrl,
        // Force mock EHR so a flaky vendor sandbox can't take E2E down.
        EHR_MODE: "",
        // Email links land in the pino sink — we don't consume them in
        // the current scenario but keep it consistent with integration.
        EMAIL_PROVIDER: "",
        // Cookies need to be httponly+lax (default) and NOT secure since
        // we're on http:// in tests.
        NODE_ENV: "development",
      },
    },
    {
      // Vite dev server for the SPA. Proxies /api to the api-server on
      // API_PORT (instead of the dev-time default 8080).
      command: "pnpm --filter @workspace/provider-app run dev",
      url: APP_BASE_URL,
      timeout: 120_000,
      reuseExistingServer: !process.env["CI"],
      env: {
        PORT: String(APP_PORT),
        API_PROXY_TARGET: `http://localhost:${API_PORT}`,
      },
    },
  ],
});
