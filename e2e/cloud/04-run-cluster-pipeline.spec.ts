import fs from 'node:fs';
import { cfg, keyBase64Path, requireSettings } from './support/config';
import { expect, test } from './support/fixtures';
import { startWorkflow, waitForRun } from './support/github';

// Replaces: Actions > "Kubernetes Cluster Provisioning" (Cluster.yaml) > Run workflow,
// choose gcp + apply, and watch the run until the cluster is up.
test('create the cluster with the provisioning pipeline', async ({ cloudPage: page }) => {
  requireSettings('githubRepo', 'clusterWorkflowFile');
  test.setTimeout(cfg.clusterTimeoutMs + 10 * 60_000 + cfg.loginTimeoutMs);

  // "@key_base64" in CLUSTER_WORKFLOW_INPUTS is replaced by the key from step 02.
  const inputs: Record<string, string> = {};
  for (const [k, v] of Object.entries(cfg.clusterWorkflowInputs)) {
    if (v === '@key_base64') {
      const file = keyBase64Path();
      if (!fs.existsSync(file)) throw new Error(`${file} not found - run 02-download-key first.`);
      inputs[k] = fs.readFileSync(file, 'utf8').trim();
    } else {
      inputs[k] = v;
    }
  }

  console.log(`[cloud] Starting ${cfg.clusterWorkflowFile} in ${cfg.githubRepo}:`);
  const runUrl = await startWorkflow(page, cfg.clusterWorkflowFile, inputs);
  console.log(`[cloud] Run started: ${runUrl}`);

  if (!cfg.waitForCluster) return;
  const status = await waitForRun(page, runUrl, cfg.clusterTimeoutMs);
  expect(status, `pipeline run ${runUrl}`).toMatch(/^Success$/i);
});
