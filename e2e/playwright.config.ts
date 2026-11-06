import { defineConfig, devices } from '@playwright/test';

// One project per cloud, each pointed at the domain its deploy workflow serves on.
// BASE_URL overrides them all with a single target (e.g. https://161-35-245-143.sslip.io)
// and runs it as the "custom" project.
const targets: Record<string, string> = process.env.BASE_URL
  ? { custom: process.env.BASE_URL }
  : {
      eks: 'https://crackdetectioneks.online',
      aks: 'https://crackdetectionaks.online',
      do: 'https://crackdetectiondo.online',
    };

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    // Left at false on purpose: an untrusted or wrong-name certificate fails the run.
    // Set ALLOW_UNTRUSTED_TLS=1 for letsencrypt-staging or mkcert deployments.
    ignoreHTTPSErrors: process.env.ALLOW_UNTRUSTED_TLS === '1',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: Object.entries(targets).map(([name, baseURL]) => ({ name, use: { baseURL } })),
});
