import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Page object for GitHub Actions: start a workflow_dispatch workflow and follow its run.
 * All GitHub selectors live here.
 */
export class GitHubActions {
  constructor(
    readonly page: Page,
    readonly repo: string,
  ) {}

  private get repoUrl() {
    return `https://github.com/${this.repo}`;
  }

  /** Navigate and fail fast with a clear message if the saved GitHub session has expired. */
  async goto(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    const user = await this.page.locator('meta[name="user-login"]').getAttribute('content').catch(() => '');
    if (!user) {
      throw new Error('GitHub session expired or missing. Run `npm run auth` in e2e/ and sign in again.');
    }
  }

  private async runIds(): Promise<Set<string>> {
    const hrefs = await this.page
      .locator('a[href*="/actions/runs/"]')
      .evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
    return new Set(hrefs.map((h) => h.match(/\/actions\/runs\/(\d+)/)?.[1]).filter((x): x is string => !!x));
  }

  /** The "Run workflow" form field for a workflow input: by input id, else by label text. */
  private async field(panel: Locator, input: string): Promise<Locator> {
    const byName = panel.locator(`[name="inputs[${input}]"]`);
    if (await byName.count()) return byName.first();
    const byLabel = panel.getByLabel(input, { exact: false });
    if (await byLabel.count()) return byLabel.first();
    throw new Error(`Workflow input "${input}" not found in the "Run workflow" form.`);
  }

  /** Opens the workflow, fills "Run workflow" with `inputs`, starts it and returns the run URL. */
  async startWorkflow(workflowFile: string, inputs: Record<string, string>, secretInputs: string[] = []): Promise<string> {
    await this.goto(`${this.repoUrl}/actions/workflows/${workflowFile}`);
    await expect(this.page.getByText(/workflow_dispatch/).first(), `${workflowFile} cannot be run by hand`).toBeVisible();

    const before = await this.runIds();

    await this.page.getByRole('button', { name: 'Run workflow', exact: true }).first().click();
    const panel = this.page
      .locator('form[action*="/actions/manual"]')
      .or(this.page.getByRole('dialog').filter({ hasText: /Use workflow from/ }))
      .last();
    await expect(panel).toBeVisible();

    for (const [input, value] of Object.entries(inputs)) {
      const field = await this.field(panel, input);
      const kind = await field.evaluate((el) => `${el.tagName.toLowerCase()}:${(el as HTMLInputElement).type ?? ''}`);
      if (kind.startsWith('select')) await field.selectOption(value);
      else if (kind === 'input:checkbox') await field.setChecked(value === 'true');
      else await field.fill(value);
      const shown = secretInputs.includes(input) ? (value ? `(hidden, ${value.length} characters)` : '(blank)') : value || '(blank)';
      console.log(`  ${input} = ${shown}`);
    }

    await panel.getByRole('button', { name: 'Run workflow', exact: true }).click();

    // The new run appears in the list after a few seconds.
    let runId = '';
    await expect(async () => {
      await this.page.reload({ waitUntil: 'domcontentloaded' });
      runId = [...(await this.runIds())].find((id) => !before.has(id)) ?? '';
      expect(runId, 'new workflow run').not.toBe('');
    }).toPass({ timeout: 120_000, intervals: [5_000] });

    return `${this.repoUrl}/actions/runs/${runId}`;
  }

  /** Reloads the run page every 30 s until it finishes; returns Success / Failure / Cancelled ... */
  async waitForRun(runUrl: string, timeoutMs: number): Promise<string> {
    const finished = /^(Success|Failure|Cancelled|Skipped|Timed out|Startup failure)$/i;
    const deadline = Date.now() + timeoutMs;
    let last = '';
    await this.goto(runUrl);
    while (Date.now() < deadline) {
      const text = await this.page.locator('body').innerText().catch(() => '');
      const status =
        text.match(
          /Status\s*\n?\s*(Success|Failure|Cancelled|Skipped|Timed out|Startup failure|In progress|Queued|Waiting|Pending|Requested)/i,
        )?.[1] ?? '';
      if (status && status !== last) {
        console.log(`  ${new Date().toLocaleTimeString()}  run status: ${status}`);
        last = status;
      }
      if (finished.test(status)) return status;
      await this.page.waitForTimeout(30_000);
      await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    }
    throw new Error(`Run did not finish within ${Math.round(timeoutMs / 60_000)} min (last status: ${last || 'unknown'}): ${runUrl}`);
  }

  /**
   * The app URL from the run summary the deploy workflows write ("- Gallery: https://<host>/").
   * Call on the finished run page. Returns '' when there is no summary.
   */
  async galleryUrlFromSummary(): Promise<string> {
    const text = await this.page.locator('body').innerText().catch(() => '');
    return text.match(/Gallery:\s*(https?:\/\/[^\s/]+)\/?/)?.[1] ?? '';
  }
}
