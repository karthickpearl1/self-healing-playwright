// Playwright configuration.
//
// Two projects:
//   unit - plain tests of the scoring and report logic, no browser needed
//   e2e  - the claim-form tests, run against the demo app
// APP_VARIANT (v1 | v2 | v2-bug) picks which version of the demo app the e2e tests hit.

import { defineConfig, devices } from '@playwright/test';

const variant = process.env.APP_VARIANT ?? 'v1';
const port = 4173;

export default defineConfig({
  timeout: 20_000,
  expect: { timeout: 3_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0, // retries would hide flakiness; a heal should be a decision, not a retry
  reporter: [['list'], ['./src/reporter/healing-reporter.ts']],
  use: {
    baseURL: `http://localhost:${port}/${variant}/`,
    actionTimeout: 3_000,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'unit', testDir: './tests/unit' },
    { name: 'e2e', testDir: './tests/e2e', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'node demo-app/server.mjs',
    url: `http://localhost:${port}/v1/`,
    reuseExistingServer: !process.env.CI,
  },
});
