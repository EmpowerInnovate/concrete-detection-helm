import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { checkProvider, deployCfg, WORKFLOWS, workflowInputs } from '../lib/config';
import { GitHubActions } from '../lib/github';
import { DEPLOYED_URL_FILE } from '../lib/paths';

/**
 * Replaces the manual GitHub step: Actions → "<cloud>-deploy crack detection" → Run workflow
 * with the cluster you created (DEPLOY_PROVIDER = gke | eks | aks | do), then follows the run.
 * On success it reads the app URL from the run summary, waits until the app answers there,
 * and hands the URL to the app checks (tests/app.spec.ts) that run next.
 *
 * Runs only with DEPLOY=1 (npm run deploy / deploy:gke / ...).
 */

test.skip(!deployCfg.enabled, 'Deploy runs only with DEPLOY=1 (npm run deploy)');

test(`${deployCfg.action} crack-detection on ${deployCfg.provider || '?'} cluster "${deployCfg.clusterName}"`, async ({ page, request }) => {
  test.setTimeout(deployCfg.timeoutMs + 20 * 60_000);
  const provider = checkProvider();
  const wf = WORKFLOWS[provider];
  if (deployCfg.action !== 'deploy' && !wf.hasAction) {
    throw new Error(`DEPLOY_ACTION=${deployCfg.action} is not supported by ${wf.file} (only eks and aks can uninstall).`);
  }

  fs.rmSync(DEPLOYED_URL_FILE, { force: true });
  const gh = new GitHubActions(page, deployCfg.repo);
  let runUrl = '';

  await test.step(`Start ${wf.file} in ${deployCfg.repo}`, async () => {
    const { inputs, secret } = workflowInputs(provider);
    if (!wf.hasAction) delete inputs.action;
    console.log(`Starting ${wf.file}:`);
    runUrl = await gh.startWorkflow(wf.file, inputs, secret);
    console.log(`Run started: ${runUrl}`);
  });

  if (!deployCfg.waitForRun) return;

  await test.step('Wait for the run to finish', async () => {
    const status = await gh.waitForRun(runUrl, deployCfg.timeoutMs);
    expect(status, `deploy run ${runUrl}`).toMatch(/^Success$/i);
  });

  if (deployCfg.action !== 'deploy') return;

  const appUrl = await test.step('Read the app URL from the run summary', async () => {
    const url = (await gh.galleryUrlFromSummary()) || (deployCfg.domain ? `https://${deployCfg.domain}` : '');
    expect(url, 'app URL (run summary has no "Gallery:" line and DOMAIN is blank)').not.toBe('');
    console.log(`App URL: ${url}/`);
    return url;
  });

  await test.step('App answers at that URL', async () => {
    // DNS and the load balancer can lag a little behind the workflow.
    const insecure = deployCfg.tlsMode !== 'letsencrypt';
    await expect
      .poll(
        async () => (await request.get(`${appUrl}/`, { ignoreHTTPSErrors: insecure, timeout: 15_000 }).catch(() => null))?.status() ?? 0,
        { timeout: 10 * 60_000, intervals: [10_000] },
      )
      .toBe(200);
  });

  // The app checks (project "app") read this file to know where to point.
  fs.mkdirSync(path.dirname(DEPLOYED_URL_FILE), { recursive: true });
  fs.writeFileSync(DEPLOYED_URL_FILE, appUrl);
});
