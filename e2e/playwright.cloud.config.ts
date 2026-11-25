import { defineConfig } from '@playwright/test';

// Cloud-console automation (cloud/*.spec.ts), kept apart from the app checks in tests/.
// Runs one test at a time, in file order (00 -> 04), in a real Chrome window you can watch
// and sign in to. See README.md "Cloud setup automation".
export default defineConfig({
  testDir: './cloud',
  testMatch: /\d\d-.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  maxFailures: 1, // later steps need the earlier ones
  timeout: 15 * 60_000,
  expect: { timeout: 30_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-cloud' }]],
  outputDir: 'test-results-cloud',
  use: { trace: 'off', actionTimeout: 60_000, navigationTimeout: 90_000 },
});
