import fs from 'node:fs';
import { cfg, keyBase64Path, keyJsonPath, requireSettings } from './support/config';
import { expect, test } from './support/fixtures';
import { downloadJsonKey, encodeKeyFile } from './support/gcp';

// Replaces: Service account > Keys > Add key > Create new key > JSON, then
// `base64 -w 0 key.json`. Writes both files to SECRETS_DIR (git-ignored, mode 600).
test('download a JSON key and encode it as single-line base64', async ({ cloudPage: page }) => {
  requireSettings('projectId', 'saId');
  test.setTimeout(5 * 60_000 + cfg.loginTimeoutMs);

  const jsonPath = keyJsonPath();
  if (fs.existsSync(jsonPath) && process.env.NEW_KEY !== '1') {
    console.log(`[cloud] Reusing existing key ${jsonPath} (set NEW_KEY=1 to create a new one).`);
  } else {
    await downloadJsonKey(page, cfg.saEmail, jsonPath);
    console.log(`[cloud] Key saved: ${jsonPath}`);
  }

  const b64 = encodeKeyFile(jsonPath, keyBase64Path(), cfg.saEmail);
  expect(b64).not.toContain('\n');
  expect(JSON.parse(Buffer.from(b64, 'base64').toString('utf8')).client_email).toBe(cfg.saEmail);
  console.log(`[cloud] Base64 key (one line, ${b64.length} characters): ${keyBase64Path()}`);
  console.log(`[cloud]   copy it with:  xclip -selection clipboard < ${keyBase64Path()}`);
});
