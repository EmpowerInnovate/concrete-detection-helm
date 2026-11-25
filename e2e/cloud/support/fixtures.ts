import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { test as base, chromium, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { cfg } from './config';

// Attaches to a real Chrome window over the DevTools port instead of letting Playwright
// launch a browser. That window uses its own profile (CHROME_PROFILE_DIR), so:
//   - Google and GitHub sign-in work (they block browsers Playwright launches itself),
//   - you sign in once and stay signed in for later runs,
//   - no login details ever go into the tests.
// If no Chrome is listening on CDP_PORT, one is started and left open after the run.

const cdpUrl = () => `http://127.0.0.1:${cfg.cdpPort}`;

function findChrome(): string {
  if (cfg.chromePath) return cfg.chromePath;
  const candidates = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
  for (const bin of candidates) {
    try {
      return execFileSync('which', [bin], { encoding: 'utf8' }).trim();
    } catch {
      /* not installed */
    }
  }
  const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (fs.existsSync(macChrome)) return macChrome;
  // Last resort: Playwright's own Chromium. Google may refuse sign-in there.
  console.warn('[cloud] Google Chrome not found - using Playwright Chromium; set CHROME_PATH if Google sign-in is refused.');
  return chromium.executablePath();
}

export function startChrome() {
  fs.mkdirSync(cfg.chromeProfileDir, { recursive: true });
  const exe = findChrome();
  console.log(`[cloud] Starting Chrome (${exe}) with profile ${cfg.chromeProfileDir}`);
  const child = spawn(
    exe,
    [
      `--remote-debugging-port=${cfg.cdpPort}`,
      `--user-data-dir=${cfg.chromeProfileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { detached: true, stdio: 'ignore' },
  );
  child.unref();
}

async function connect(): Promise<Browser> {
  try {
    return await chromium.connectOverCDP(cdpUrl(), { timeout: 3_000 });
  } catch {
    startChrome();
  }
  const deadline = Date.now() + 30_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1_000));
    try {
      return await chromium.connectOverCDP(cdpUrl(), { timeout: 3_000 });
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`Could not reach Chrome on ${cdpUrl()}: ${lastError}`);
}

type WorkerFixtures = { chrome: { browser: Browser; context: BrowserContext } };
type TestFixtures = { cloudPage: Page };

export const test = base.extend<TestFixtures, WorkerFixtures>({
  chrome: [
    async ({}, use) => {
      const browser = await connect();
      const context = browser.contexts()[0] ?? (await browser.newContext());
      await use({ browser, context });
      // Detach only; the Chrome window (and your sign-in) stays.
      await browser.close().catch(() => {});
    },
    { scope: 'worker' },
  ],

  cloudPage: async ({ chrome }, use, testInfo) => {
    const page = await chrome.context.newPage();
    await page.bringToFront();
    await use(page);
    if (testInfo.status !== testInfo.expectedStatus) {
      // Screenshot on failure (the built-in one only covers Playwright-launched browsers).
      const shot = testInfo.outputPath('failure.png');
      await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
      await testInfo.attach('failure', { path: shot, contentType: 'image/png' }).catch(() => {});
      // Leave the tab open so you can see where it stopped.
      return;
    }
    await page.close().catch(() => {});
  },
});

export { expect };

/** Prints a highly visible message in the terminal. */
export function announce(lines: string[]) {
  const bar = '='.repeat(72);
  console.log(`\n${bar}\n${lines.map((l) => `  ${l}`).join('\n')}\n${bar}\n`);
}
