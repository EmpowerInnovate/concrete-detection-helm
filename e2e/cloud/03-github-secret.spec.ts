import fs from 'node:fs';
import { cfg, keyBase64Path } from './support/config';
import { test } from './support/fixtures';
import { setRepoSecret } from './support/github';

// Optional: puts the base64 key into a repository Actions secret (GITHUB_SECRET_NAME),
// which is what you do by hand under Settings > Secrets and variables > Actions.
test('store the base64 key as a GitHub Actions secret', async ({ cloudPage: page }) => {
  test.skip(!cfg.githubSecretName, 'GITHUB_SECRET_NAME is not set - the pipeline gets the key another way');
  test.setTimeout(5 * 60_000 + 2 * cfg.loginTimeoutMs);

  const file = keyBase64Path();
  if (!fs.existsSync(file)) throw new Error(`${file} not found - run 02-download-key first.`);
  const result = await setRepoSecret(page, cfg.githubSecretName, fs.readFileSync(file, 'utf8').trim());
  console.log(`[cloud] Secret ${cfg.githubSecretName} ${result} in ${cfg.githubRepo}.`);
});
