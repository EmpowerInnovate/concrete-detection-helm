import type { Page } from '@playwright/test';
import { cfg } from './config';
import { announce } from './fixtures';

// The tests never type a password. When a page needs you signed in, they print a message,
// bring the Chrome window to the front and wait (LOGIN_TIMEOUT_MIN) until you have signed in.

const minutes = () => Math.round(cfg.loginTimeoutMs / 60_000);

async function waitUntil(check: () => Promise<boolean>, what: string) {
  const deadline = Date.now() + cfg.loginTimeoutMs;
  while (Date.now() < deadline) {
    if (await check().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(`Timed out after ${minutes()} min waiting for: ${what}`);
}

const onGoogleLogin = (page: Page) => /(^|\.)accounts\.google\.com$/.test(new URL(page.url()).hostname);
const onConsole = (page: Page) => new URL(page.url()).hostname === 'console.cloud.google.com';

/** Opens a Google Cloud console URL, waiting for you to sign in if Google asks. */
export async function openGoogleConsole(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1_500); // the console redirects to sign-in client-side

  if (onGoogleLogin(page) || !onConsole(page)) {
    await page.bringToFront();
    announce([
      'ACTION NEEDED: sign in to Google Cloud',
      'In the Chrome window that just came to the front, sign in with the Google',
      'account that owns the project. The test continues by itself once you are in.',
      `Waiting up to ${minutes()} min...`,
    ]);
    await waitUntil(async () => onConsole(page) && !onGoogleLogin(page), 'Google Cloud sign-in');
    console.log('[cloud] Signed in to Google Cloud - continuing.');
    // Some sign-ins land on the console home page; go back to where we wanted to be.
    if (!page.url().startsWith(url.split('?')[0])) {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
    }
  }
  await page.waitForLoadState('load');
}

async function githubUser(page: Page): Promise<string> {
  return (await page.locator('meta[name="user-login"]').getAttribute('content', { timeout: 5_000 })) ?? '';
}

/** Opens a github.com URL, waiting for you to sign in first if you are signed out. */
export async function openGitHub(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (await githubUser(page).catch(() => '')) return;

  // Signed out: a private repository shows 404, so go through the sign-in page.
  const path = new URL(url).pathname + new URL(url).search;
  await page.goto(`https://github.com/login?return_to=${encodeURIComponent(path)}`, { waitUntil: 'domcontentloaded' });
  await page.bringToFront();
  announce([
    'ACTION NEEDED: sign in to GitHub',
    `In the Chrome window, sign in with an account that can run workflows in ${cfg.githubRepo}.`,
    'The test continues by itself once you are in.',
    `Waiting up to ${minutes()} min...`,
  ]);
  await waitUntil(async () => !/\/(login|session)/.test(new URL(page.url()).pathname) && !!(await githubUser(page)), 'GitHub sign-in');
  console.log(`[cloud] Signed in to GitHub as ${await githubUser(page)} - continuing.`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
}
