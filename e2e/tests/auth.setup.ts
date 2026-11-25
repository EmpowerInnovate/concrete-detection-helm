import { test as setup } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { deployCfg } from '../lib/config';
import { GITHUB_AUTH_FILE } from '../lib/paths';

/**
 * GitHub sign-in, done by hand. GitHub blocks scripted logins (2FA, device checks), so the tests
 * never type a password. Instead:
 *   - the saved session in .auth/ is tried first; if it still works, nothing is asked,
 *   - otherwise the terminal says "ACTION NEEDED", you sign in in the opened Chrome window,
 *     and the session cookies are saved for the deploy test to reuse.
 *
 * `npm run auth` forces a fresh sign-in (FORCE_AUTH=1).
 */

const WAIT_MS = 10 * 60_000;

function announce(lines: string[]) {
  const bar = '='.repeat(72);
  console.log(`\n${bar}\n${lines.map((l) => `  ${l}`).join('\n')}\n${bar}\n`);
}

setup('sign in to GitHub', async ({ browser }) => {
  setup.setTimeout(WAIT_MS + 2 * 60_000);
  const saved = fs.existsSync(GITHUB_AUTH_FILE) && !process.env.FORCE_AUTH ? GITHUB_AUTH_FILE : undefined;
  const context = await browser.newContext({ storageState: saved });
  const page = await context.newPage();
  const user = async () =>
    (await page.locator('meta[name="user-login"]').getAttribute('content', { timeout: 5_000 }).catch(() => '')) ?? '';

  await page.goto('https://github.com/', { waitUntil: 'domcontentloaded' });
  if (!(await user())) {
    await page.goto('https://github.com/login', { waitUntil: 'domcontentloaded' });
    announce([
      'ACTION NEEDED: sign in to GitHub',
      `Sign in in the Chrome window with an account that can run workflows in ${deployCfg.repo}.`,
      'The tests continue by themselves once you are in. Waiting up to 10 minutes...',
    ]);
    // GitHub leaves /login and /sessions/* (2FA) once you are signed in.
    await page.waitForURL((u) => u.hostname === 'github.com' && !/^\/(login|sessions)/.test(u.pathname), {
      timeout: WAIT_MS,
    });
    await page.waitForLoadState('domcontentloaded');
    if (!(await user())) throw new Error('GitHub sign-in did not complete.');
  } else {
    console.log('GitHub session is still valid - no sign-in needed.');
  }
  console.log(`GitHub: signed in as ${await user()}.`);

  fs.mkdirSync(path.dirname(GITHUB_AUTH_FILE), { recursive: true });
  await context.storageState({ path: GITHUB_AUTH_FILE });
  fs.chmodSync(GITHUB_AUTH_FILE, 0o600);
  await context.close();
});
