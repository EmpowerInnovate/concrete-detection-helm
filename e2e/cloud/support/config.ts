import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Settings for the cloud-console automation (cloud/*.spec.ts).
// Read from e2e/cloud.env (copy cloud.env.example), and any variable already set in the
// shell wins over the file. No passwords or tokens are stored here: you sign in yourself
// in the Chrome window the tests open, and that sign-in is kept in CHROME_PROFILE_DIR.

const E2E_DIR = path.resolve(__dirname, '..', '..');
const ENV_FILE = process.env.CLOUD_ENV_FILE || path.join(E2E_DIR, 'cloud.env');

function loadEnvFile(file: string) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvFile(ENV_FILE);

const env = (name: string, fallback = '') => (process.env[name] ?? fallback).trim();
const list = (value: string) => value.split(',').map((s) => s.trim()).filter(Boolean);
const expandHome = (p: string) => (p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);

function json(name: string, fallback: Record<string, string>): Record<string, string> {
  const value = env(name);
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${name} must be JSON, e.g. {"cloud provider":"gcp","apply or destroy":"apply"} - got: ${value}`);
  }
}

const projectId = env('GCP_PROJECT_ID');
const saId = env('SA_ID');

export const cfg = {
  envFile: ENV_FILE,

  // --- Browser -----------------------------------------------------------------------
  // The tests attach to a normal Chrome over the DevTools port, so Google sign-in works
  // (Google refuses sign-in in browsers that Playwright launches itself).
  cdpPort: Number(env('CDP_PORT', '9222')),
  chromePath: env('CHROME_PATH'),
  chromeProfileDir: expandHome(env('CHROME_PROFILE_DIR', '~/.cache/concrete-cloud-chrome')),
  // How long to wait for you to finish signing in when a login page shows up.
  loginTimeoutMs: Number(env('LOGIN_TIMEOUT_MIN', '10')) * 60_000,

  // --- GCP service account -----------------------------------------------------------
  projectId,
  saName: env('SA_NAME', saId),
  saId,
  saDescription: env('SA_DESCRIPTION'),
  saEmail: projectId && saId ? `${saId}@${projectId}.iam.gserviceaccount.com` : '',
  // Role names exactly as the console role picker shows them.
  saRoles: list(env('SA_ROLES')),

  // --- Key file ----------------------------------------------------------------------
  secretsDir: path.resolve(E2E_DIR, expandHome(env('SECRETS_DIR', '.secrets'))),

  // --- GitHub ------------------------------------------------------------------------
  githubRepo: env('GITHUB_REPO', 'EmpowerInnovate/HelmCrackDetetion'),
  // Optional: repository secret to fill with the base64 key (e.g. GCP_SA_KEY). Empty = skip.
  githubSecretName: env('GITHUB_SECRET_NAME'),
  clusterWorkflowFile: env('CLUSTER_WORKFLOW_FILE', 'Cluster.yaml'),
  // Workflow inputs: key = input id (inputs[<id>]) or part of its label; value to set.
  // The value "@key_base64" is replaced by the base64 key from step 02.
  clusterWorkflowInputs: json('CLUSTER_WORKFLOW_INPUTS', {
    'cloud provider': 'gcp',
    'apply or destroy': 'apply',
  }),
  waitForCluster: env('WAIT_FOR_CLUSTER', '1') === '1',
  clusterTimeoutMs: Number(env('CLUSTER_TIMEOUT_MIN', '45')) * 60_000,
};

export const keyJsonPath = () => path.join(cfg.secretsDir, `${cfg.saId}-key.json`);
export const keyBase64Path = () => path.join(cfg.secretsDir, `${cfg.saId}-key.b64.txt`);

const ENV_NAMES: Partial<Record<keyof typeof cfg, string>> = {
  projectId: 'GCP_PROJECT_ID',
  saId: 'SA_ID',
  saRoles: 'SA_ROLES',
  githubRepo: 'GITHUB_REPO',
  githubSecretName: 'GITHUB_SECRET_NAME',
  clusterWorkflowFile: 'CLUSTER_WORKFLOW_FILE',
};

export function requireSettings(...names: (keyof typeof cfg)[]) {
  const missing = names.filter((n) => {
    const v = cfg[n];
    return v === '' || (Array.isArray(v) && v.length === 0);
  });
  if (missing.length) {
    const vars = missing.map((n) => ENV_NAMES[n] ?? n).join(', ');
    throw new Error(`Missing settings: ${vars}. Set them in ${cfg.envFile} (see cloud.env.example).`);
  }
}
