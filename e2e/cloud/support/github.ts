import { expect, type Locator, type Page } from '@playwright/test';
import { cfg } from './config';
import { announce } from './fixtures';
import { openGitHub } from './login';

// GitHub web UI steps: update an Actions secret, start a workflow and follow its run.

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const repoUrl = () => `https://github.com/${cfg.githubRepo}`;

/** GitHub asks to confirm access (password / 2FA / passkey) before some settings pages. */
async function waitForSudo(page: Page) {
  const isSudo = async () =>
    /\/sessions\/sudo/.test(page.url()) ||
    (await page.getByRole('heading', { name: /Confirm access/i }).isVisible().catch(() => false));
  if (!(await isSudo())) return;
  await page.bringToFront();
  announce([
    'ACTION NEEDED: GitHub "Confirm access"',
    'Confirm it in the Chrome window (password, 2FA app or passkey).',
    'The test continues by itself afterwards.',
  ]);
  const deadline = Date.now() + cfg.loginTimeoutMs;
  while (Date.now() < deadline && (await isSudo())) await page.waitForTimeout(2_000);
  if (await isSudo()) throw new Error('Timed out waiting for GitHub "Confirm access".');
}

/** Creates or updates a repository Actions secret through the web UI. */
export async function setRepoSecret(page: Page, name: string, value: string) {
  const base = `${repoUrl()}/settings/secrets/actions`;
  await openGitHub(page, base);
  await waitForSudo(page);

  const editResponse = await page.goto(`${base}/${encodeURIComponent(name)}`, { waitUntil: 'domcontentloaded' });
  await waitForSudo(page);
  const exists = editResponse?.status() === 200 && !/\/new$/.test(page.url());

  if (!exists) {
    await page.goto(`${base}/new`, { waitUntil: 'domcontentloaded' });
    await waitForSudo(page);
    const nameField = page.locator('input[name="secret_name"]').or(page.getByLabel(/^Name/)).first();
    await nameField.fill(name);
  }

  const valueField = page
    .locator('textarea[name="secret_value"]')
    .or(page.getByLabel(/^(Secret|Value)\b/))
    .first();
  await valueField.fill(value);
  await page.getByRole('button', { name: /^(Add|Update) secret$/ }).click();

  await expect(page.getByText(new RegExp(`(Repository )?secret .*(added|updated)`, 'i')).first()).toBeVisible({
    timeout: 30_000,
  });
  return exists ? 'updated' : 'added';
}

async function runIds(page: Page): Promise<Set<string>> {
  const hrefs = await page
    .locator('a[href*="/actions/runs/"]')
    .evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
  return new Set(hrefs.map((h) => h.match(/\/actions\/runs\/(\d+)/)?.[1]).filter((x): x is string => !!x));
}

async function fieldFor(panel: Locator, key: string): Promise<Locator> {
  const byName = panel.locator(`[name="inputs[${key}]"]`);
  if (await byName.count()) return byName.first();
  const byLabel = panel.getByLabel(new RegExp(esc(key), 'i'));
  if (await byLabel.count()) return byLabel.first();
  throw new Error(
    `Workflow input "${key}" not found. Use the input id from the workflow file or part of its label ` +
      `(CLUSTER_WORKFLOW_INPUTS).`,
  );
}

/** Fills the "Run workflow" form, starts the run and returns the run URL. */
export async function startWorkflow(page: Page, workflowFile: string, inputs: Record<string, string>): Promise<string> {
  const workflowUrl = `${repoUrl()}/actions/workflows/${workflowFile}`;
  await openGitHub(page, workflowUrl);
  await expect(page.getByText(/workflow_dispatch/).first(), `${workflowFile} has no workflow_dispatch trigger`).toBeVisible({
    timeout: 30_000,
  });

  const before = await runIds(page);

  await page.getByRole('button', { name: /^\s*Run workflow\s*$/ }).first().click();
  const panel = page
    .locator('form[action*="/actions/manual"]')
    .or(page.getByRole('dialog').filter({ hasText: /Use workflow from/ }))
    .or(page.locator('details-menu, [role="menu"], .Overlay').filter({ hasText: /Use workflow from/ }))
    .last();
  await panel.waitFor({ state: 'visible', timeout: 30_000 });

  for (const [key, value] of Object.entries(inputs)) {
    const field = await fieldFor(panel, key);
    const kind = await field.evaluate((el) => `${el.tagName.toLowerCase()}:${(el as HTMLInputElement).type ?? ''}`);
    if (kind.startsWith('select')) await field.selectOption(value);
    else if (kind === 'input:checkbox') await field.setChecked(value === 'true');
    else await field.fill(value);
    console.log(`[cloud]   ${key} = ${value.length > 60 ? `(${value.length} characters)` : value}`);
  }

  await panel.getByRole('button', { name: /^\s*Run workflow\s*$/ }).click();

  // The new run shows up in the list after a few seconds.
  let runId = '';
  await expect(async () => {
    await page.reload({ waitUntil: 'domcontentloaded' });
    const after = await runIds(page);
    runId = [...after].find((id) => !before.has(id)) ?? '';
    expect(runId, 'new workflow run').not.toBe('');
  }).toPass({ timeout: 120_000, intervals: [5_000] });

  return `${repoUrl()}/actions/runs/${runId}`;
}

/** Follows a run page until it finishes; returns Success / Failure / Cancelled ... */
export async function waitForRun(page: Page, runUrl: string, timeoutMs: number): Promise<string> {
  const finished = /^(Success|Failure|Cancelled|Skipped|Timed out|Startup failure)$/i;
  const deadline = Date.now() + timeoutMs;
  let last = '';
  await page.goto(runUrl, { waitUntil: 'domcontentloaded' });
  while (Date.now() < deadline) {
    const text = await page.locator('body').innerText().catch(() => '');
    const status = text.match(/Status\s*\n?\s*(Success|Failure|Cancelled|Skipped|Timed out|Startup failure|In progress|Queued|Waiting|Pending|Requested)/i)?.[1] ?? '';
    if (status && status !== last) {
      console.log(`[cloud] ${new Date().toLocaleTimeString()}  run status: ${status}`);
      last = status;
    }
    if (finished.test(status)) return status;
    await page.waitForTimeout(30_000);
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  }
  throw new Error(`Run did not finish within ${Math.round(timeoutMs / 60_000)} min (last status: ${last || 'unknown'}): ${runUrl}`);
}
