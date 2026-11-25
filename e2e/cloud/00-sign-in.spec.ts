import { cfg } from './support/config';
import { test } from './support/fixtures';
import { openGitHub, openGoogleConsole } from './support/login';

// Asks for both sign-ins up front (only if needed), so the rest of the run is unattended.
// Already signed in from an earlier run? This passes in a few seconds.
test('sign in to Google Cloud and GitHub', async ({ cloudPage: page }) => {
  test.setTimeout(2 * cfg.loginTimeoutMs + 2 * 60_000);
  const project = cfg.projectId ? `?project=${cfg.projectId}` : '';
  await openGoogleConsole(page, `https://console.cloud.google.com/iam-admin/serviceaccounts${project}`);
  console.log('[cloud] Google Cloud: signed in.');
  if (cfg.githubSecretName || cfg.clusterWorkflowFile) {
    await openGitHub(page, `https://github.com/${cfg.githubRepo}/actions`);
    console.log('[cloud] GitHub: signed in.');
  }
});
