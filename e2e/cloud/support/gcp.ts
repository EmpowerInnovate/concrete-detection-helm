import fs from 'node:fs';
import path from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { cfg } from './config';
import { openGoogleConsole } from './login';

// Google Cloud console steps. All console selectors live in this file, so if Google changes
// a label, this is the only place to fix (run with --debug and use "Pick locator").

const CONSOLE = 'https://console.cloud.google.com';
const UI_TIMEOUT = 60_000; // the console is slow to render
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** First of several candidate locators that becomes visible. */
async function firstVisible(candidates: Locator[], what: string, timeout = UI_TIMEOUT): Promise<Locator> {
  const any = candidates.reduce((a, b) => a.or(b));
  await any.first().waitFor({ state: 'visible', timeout }).catch(() => {
    throw new Error(`Could not find ${what} on ${any.page().url()}`);
  });
  for (const c of candidates) {
    if (await c.first().isVisible().catch(() => false)) return c.first();
  }
  return any.first();
}

// ---------------------------------------------------------------------------------------
// 1. Create the service account
// ---------------------------------------------------------------------------------------

/** Creates the service account. Returns false when it already existed. */
export async function createServiceAccount(page: Page): Promise<boolean> {
  await openGoogleConsole(page, `${CONSOLE}/iam-admin/serviceaccounts/create?project=${cfg.projectId}`);

  const name = await firstVisible(
    [page.getByLabel('Service account name', { exact: false }), page.locator('input[formcontrolname="displayName"]')],
    'the "Service account name" field',
  );
  await name.fill(cfg.saName);

  const id = await firstVisible(
    [page.getByLabel(/Service account ID/i), page.locator('input[formcontrolname="accountId"]')],
    'the "Service account ID" field',
  );
  // The console derives an ID from the name; replace it with ours.
  await id.fill('');
  await id.fill(cfg.saId);

  if (cfg.saDescription) {
    const desc = await firstVisible(
      [page.getByLabel(/Service account description/i), page.locator('textarea[formcontrolname="description"]')],
      'the "Service account description" field',
    );
    await desc.fill(cfg.saDescription);
  }

  await page.getByRole('button', { name: /Create and continue/i }).click();

  // Either the wizard moves on to "Permissions", or the ID is already taken.
  const alreadyExists = page.getByText(/already exists/i).first();
  const nextStep = page.getByRole('button', { name: /^\s*Continue\s*$/i }).first();
  await alreadyExists.or(nextStep).first().waitFor({ timeout: UI_TIMEOUT });
  if (await alreadyExists.isVisible()) return false;

  // Roles are granted on the IAM page (works for new and existing accounts alike),
  // so finish the wizard here.
  await page.getByRole('button', { name: /^\s*Done\s*$/i }).click();
  await page.waitForURL((u) => !u.pathname.endsWith('/create'), { timeout: UI_TIMEOUT });
  return true;
}

// ---------------------------------------------------------------------------------------
// 2. Grant project roles to the service account (IAM > Grant access)
// ---------------------------------------------------------------------------------------

export async function grantRoles(page: Page, email: string, roles: string[]) {
  await openGoogleConsole(page, `${CONSOLE}/iam-admin/iam?project=${cfg.projectId}`);

  await (await firstVisible([page.getByRole('button', { name: /Grant access/i })], 'the "Grant access" button')).click();

  const principals = await firstVisible(
    [page.getByLabel(/New principals/i), page.getByRole('combobox', { name: /New principals/i })],
    'the "New principals" field',
  );
  await principals.click();
  await principals.pressSequentially(email, { delay: 20 });
  // Pick the matching suggestion if one shows up, otherwise confirm the typed value.
  const suggestion = page.getByRole('option', { name: new RegExp(esc(email), 'i') }).first();
  if (await suggestion.isVisible({ timeout: 5_000 }).catch(() => false)) await suggestion.click();
  else await principals.press('Enter');

  for (let i = 0; i < roles.length; i++) {
    if (i > 0) await page.getByRole('button', { name: /Add another role/i }).click();
    await pickRole(page, i, roles[i]);
  }

  await page.getByRole('button', { name: /^\s*Save\s*$/i }).click();
  // The panel closes when the policy is saved; an error stays in the panel.
  await expect(page.getByRole('button', { name: /Add another role/i })).toBeHidden({ timeout: UI_TIMEOUT });
}

async function pickRole(page: Page, index: number, role: string) {
  const roleFields = page
    .getByRole('combobox', { name: /^\s*(Select a )?role\b/i })
    .or(page.getByLabel(/^\s*(Select a )?role\s*\*?\s*$/i));
  const field = roleFields.nth(index);
  await field.waitFor({ state: 'visible', timeout: UI_TIMEOUT });
  await field.click();

  const filter = await firstVisible(
    [
      page.getByRole('textbox', { name: /filter|search/i }),
      page.getByPlaceholder(/filter|search/i),
    ],
    `the role search box (role "${role}")`,
  );
  await filter.fill(role);

  const option = page
    .getByRole('option')
    .filter({ has: page.getByText(role, { exact: true }) })
    .or(page.locator('.cdk-overlay-container').getByText(role, { exact: true }))
    .first();
  await option.waitFor({ state: 'visible', timeout: UI_TIMEOUT }).catch(() => {
    throw new Error(`Role "${role}" not found in the role picker. Use the exact name the console shows.`);
  });
  await option.click();
  await expect(field).toContainText(role, { timeout: 10_000 }).catch(() => {
    /* some layouts show the role elsewhere; Save will fail if it was not picked */
  });
}

// ---------------------------------------------------------------------------------------
// 3. Create and download a JSON key, then encode it as single-line base64
// ---------------------------------------------------------------------------------------

export async function downloadJsonKey(page: Page, email: string, jsonPath: string) {
  await openGoogleConsole(page, `${CONSOLE}/iam-admin/serviceaccounts?project=${cfg.projectId}`);

  // Open the account (its email is the link in the list), then its "Keys" tab.
  await (await firstVisible([page.getByRole('link', { name: email, exact: true }), page.getByText(email, { exact: true })], `service account ${email} in the list`)).click();
  await (
    await firstVisible(
      [page.getByRole('tab', { name: /^\s*Keys\s*$/ }), page.getByRole('link', { name: /^\s*Keys\s*$/ })],
      'the "Keys" tab',
    )
  ).click();

  await page.getByRole('button', { name: /Add key/i }).click();
  await (
    await firstVisible(
      [page.getByRole('menuitem', { name: /Create new key/i }), page.getByText('Create new key', { exact: true })],
      '"Create new key"',
    )
  ).click();

  const dialog = page.getByRole('dialog').filter({ hasText: /JSON/ });
  await dialog.waitFor({ timeout: UI_TIMEOUT });
  await dialog.getByRole('radio', { name: /JSON/ }).check().catch(() => {
    /* JSON is the default */
  });

  const downloadPromise = page.waitForEvent('download', { timeout: UI_TIMEOUT });
  await dialog.getByRole('button', { name: /^\s*Create\s*$/i }).click();
  const download = await downloadPromise.catch(() => {
    throw new Error(
      'No key file was downloaded. If the console says key creation is disabled, the organization ' +
        'policy iam.disableServiceAccountKeyCreation blocks it. An account can also have at most 10 keys.',
    );
  });

  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  await download.saveAs(jsonPath);
  fs.chmodSync(jsonPath, 0o600);

  // "Private key saved to your computer" -> Close
  await page.getByRole('button', { name: /^\s*Close\s*$/i }).click({ timeout: 10_000 }).catch(() => {});
}

/** Same as `base64 -w 0 key.json`: one line, no wrapping, no trailing newline. */
export function encodeKeyFile(jsonPath: string, base64Path: string, expectedEmail: string): string {
  const raw = fs.readFileSync(jsonPath);
  const key = JSON.parse(raw.toString('utf8'));
  if (key.type !== 'service_account' || key.client_email !== expectedEmail) {
    throw new Error(`${jsonPath} is not a key for ${expectedEmail} (client_email: ${key.client_email})`);
  }
  const b64 = raw.toString('base64');
  fs.writeFileSync(base64Path, b64, { mode: 0o600 });
  return b64;
}
