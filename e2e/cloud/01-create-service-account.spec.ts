import { cfg, requireSettings } from './support/config';
import { test } from './support/fixtures';
import { createServiceAccount, grantRoles } from './support/gcp';

// Replaces the manual steps: IAM & Admin > Service accounts > Create service account,
// then IAM > Grant access with the roles in SA_ROLES.
test('create the service account and grant its roles', async ({ cloudPage: page }) => {
  requireSettings('projectId', 'saId', 'saRoles');
  test.setTimeout(10 * 60_000 + cfg.loginTimeoutMs);

  const created = await createServiceAccount(page);
  console.log(`[cloud] ${created ? 'Created' : 'Already exists, reusing'}: ${cfg.saEmail}`);

  console.log(`[cloud] Granting ${cfg.saRoles.length} roles on project ${cfg.projectId}: ${cfg.saRoles.join(', ')}`);
  await grantRoles(page, cfg.saEmail, cfg.saRoles);
  console.log('[cloud] Roles saved.');
});
