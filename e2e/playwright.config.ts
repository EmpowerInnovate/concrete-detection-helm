import { defineConfig, devices, type PlaywrightTestProject } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { DEPLOYED_URL_FILE, GITHUB_AUTH_FILE } from './lib/paths';

dotenv.config({ path: path.join(__dirname, '.env') });

const deploying = process.env.DEPLOY === '1';
const tlsMode = (process.env.TLS_MODE ?? 'letsencrypt').trim();

// ---------------------------------------------------------------------------------------------
// App checks (tests/app.spec.ts) without deploying: one project per cloud, each pointed at the
// domain its deploy workflow serves on. BASE_URL overrides them all with a single target
// (e.g. https://161-35-245-143.sslip.io) and runs it as the "custom" project.
// ---------------------------------------------------------------------------------------------
const targets: Record<string, string> = process.env.BASE_URL
  ? { custom: process.env.BASE_URL }
  : {
      eks: 'https://crackdetectioneks.online',
      aks: 'https://crackdetectionaks.online',
      do: 'https://crackdetectiondo.online',
    };

const appProjects: PlaywrightTestProject[] = Object.entries(targets).map(([name, baseURL]) => ({
  name,
  testMatch: /[\\/]app\.spec\.ts$/,
  use: { baseURL },
}));

// ---------------------------------------------------------------------------------------------
// Deploy (DEPLOY=1, `npm run deploy`): sign in to GitHub by hand -> run the deploy workflow for
// DEPLOY_PROVIDER -> run the app checks against the URL that deploy reported.
// The "app" project reads that URL when its worker starts, i.e. after the deploy test wrote it.
// ---------------------------------------------------------------------------------------------
const deployedUrl = () => (fs.existsSync(DEPLOYED_URL_FILE) ? fs.readFileSync(DEPLOYED_URL_FILE, 'utf8').trim() : '');

const deployProjects: PlaywrightTestProject[] = [
  {
    name: 'setup',
    testMatch: /auth\.setup\.ts/,
    // Signing in to GitHub is done by hand, so this project always runs headed.
    use: { headless: false, channel: 'chrome' },
  },
  {
    name: 'deploy',
    testMatch: /deploy-app\.spec\.ts/,
    dependencies: ['setup'],
    use: { storageState: GITHUB_AUTH_FILE },
  },
  // App checks after a deploy (skipped for uninstall, and for tls_mode=none: they test HTTPS).
  ...((process.env.DEPLOY_ACTION ?? 'deploy') === 'deploy' && tlsMode !== 'none'
    ? [
        {
          name: 'app',
          testMatch: /[\\/]app\.spec\.ts$/,
          dependencies: ['deploy'],
          use: {
            baseURL: deployedUrl() || 'https://deploy-did-not-report-a-url.invalid',
            ignoreHTTPSErrors: tlsMode !== 'letsencrypt' || process.env.ALLOW_UNTRUSTED_TLS === '1',
          },
        },
      ]
    : []),
];

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  workers: deploying ? 1 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI || deploying ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    // Left at false on purpose: an untrusted or wrong-name certificate fails the run.
    // Set ALLOW_UNTRUSTED_TLS=1 for letsencrypt-staging or mkcert deployments.
    ignoreHTTPSErrors: process.env.ALLOW_UNTRUSTED_TLS === '1',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: deploying ? deployProjects : appProjects,
});
