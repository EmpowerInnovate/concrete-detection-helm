import fs from 'node:fs';
import path from 'node:path';

/**
 * Settings for the deploy tests (tests/deploy-app.spec.ts), read from e2e/.env.
 * No passwords: you sign in to GitHub by hand. Cloud credentials the workflows need
 * (GCP key, DO token, ...) come from .env or files on your machine and are never printed.
 */

export type Provider = 'gke' | 'eks' | 'aks' | 'do';
const PROVIDERS: Provider[] = ['gke', 'eks', 'aks', 'do'];

const env = (name: string, fallback = '') => (process.env[name] ?? fallback).trim();

const provider = env('DEPLOY_PROVIDER').toLowerCase() as Provider;

export const deployCfg = {
  /** Set by `npm run deploy*`; without it only the normal app checks run. */
  enabled: process.env.DEPLOY === '1',
  provider,
  repo: env('GITHUB_REPO', 'EmpowerInnovate/concrete-detection-helm'),
  /** deploy | uninstall (uninstall exists only for eks and aks). */
  action: env('DEPLOY_ACTION', 'deploy'),
  clusterName: env('CLUSTER_NAME', 'crack-detection-cluster'),
  imageTag: env('IMAGE_TAG', 'auto'),
  /** Empty = the workflow serves on <ip>.sslip.io (or the Azure name). */
  domain: process.env.DOMAIN !== undefined ? env('DOMAIN') : '',
  domainSet: process.env.DOMAIN !== undefined,
  tlsMode: env('TLS_MODE', 'letsencrypt'),
  waitForRun: env('WAIT_FOR_DEPLOY', 'true').toLowerCase() === 'true',
  timeoutMs: Number(env('DEPLOY_TIMEOUT_MIN', '40')) * 60_000,
};

/** Workflow file and default domain per provider (from .github/workflows). */
export const WORKFLOWS: Record<Provider, { file: string; defaultDomain: string; hasAction: boolean }> = {
  gke: { file: 'MAHESH_DEPLOY-SSL-GKE.yaml', defaultDomain: 'maheshconcretegallery.online', hasAction: false },
  eks: { file: 'MAHESH_DEPLOY-EKS.yaml', defaultDomain: 'crackdetectioneks.online', hasAction: true },
  aks: { file: 'MAHESH_DEPLOY-AKS.yaml', defaultDomain: 'crackdetectionaks.online', hasAction: true },
  do: { file: 'MAHESH_DEPLOY-SSL-DO.yaml', defaultDomain: 'crackdetectiondo.online', hasAction: false },
};

export function checkProvider(): Provider {
  if (!PROVIDERS.includes(provider)) {
    throw new Error(`Set DEPLOY_PROVIDER in e2e/.env to the cluster you created: ${PROVIDERS.join(' | ')}`);
  }
  return provider;
}

function required(name: string): string {
  const v = env(name);
  if (!v) throw new Error(`Missing ${name} in e2e/.env (needed for DEPLOY_PROVIDER=${provider}).`);
  return v;
}

/** Single-line base64 GCP key: GCP_SA_KEY_FILE may point at the key JSON or at its .b64 copy. */
function gcpKeyBase64(): string {
  const file = required('GCP_SA_KEY_FILE').replace(/^~(?=\/)/, process.env.HOME ?? '~');
  if (!fs.existsSync(file)) throw new Error(`GCP_SA_KEY_FILE not found: ${file}`);
  const raw = fs.readFileSync(file, 'utf8').trim();
  const b64 = raw.startsWith('{') ? Buffer.from(raw).toString('base64') : raw.replace(/\s+/g, '');
  const key = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  if (key.type !== 'service_account') throw new Error(`${path.basename(file)} is not a service account key.`);
  return b64;
}

/**
 * Inputs for the "Run workflow" form, by input id. Also returns which ones are secret
 * (only their length is ever logged).
 */
export function workflowInputs(p: Provider): { inputs: Record<string, string>; secret: string[] } {
  const domain = deployCfg.domainSet ? deployCfg.domain : WORKFLOWS[p].defaultDomain;
  const common = { domain, tls_mode: deployCfg.tlsMode };

  switch (p) {
    case 'gke':
      return {
        inputs: {
          gcp_sa_key_base64: gcpKeyBase64(),
          gcp_cluster_name: deployCfg.clusterName,
          gcp_cluster_zone: env('GCP_CLUSTER_ZONE', 'us-central1-a'),
          gcp_project_id: required('GCP_PROJECT_ID'),
          image_tag: deployCfg.imageTag,
          ...common,
        },
        secret: ['gcp_sa_key_base64'],
      };
    case 'eks':
      return {
        inputs: {
          action: deployCfg.action,
          // Blank = the workflow uses the repository secrets AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY.
          aws_access_key_id: env('AWS_ACCESS_KEY_ID'),
          aws_secret_access_key: env('AWS_SECRET_ACCESS_KEY'),
          aws_region: env('AWS_REGION', 'us-east-1'),
          eks_cluster_name: deployCfg.clusterName,
          build_images: env('BUILD_IMAGES', 'true'),
          image_tag: deployCfg.imageTag,
          ...common,
        },
        secret: ['aws_access_key_id', 'aws_secret_access_key'],
      };
    case 'aks':
      return {
        inputs: {
          action: deployCfg.action,
          azure_subscription_id: required('AZURE_SUBSCRIPTION_ID'),
          azure_tenant_id: required('AZURE_TENANT_ID'),
          // Blank = the workflow uses the repository secrets AZURE_CLIENT_ID / AZURE_CLIENT_SECRET.
          azure_client_id: env('AZURE_CLIENT_ID'),
          azure_client_secret: env('AZURE_CLIENT_SECRET'),
          aks_cluster_name: deployCfg.clusterName,
          aks_resource_group: env('AKS_RESOURCE_GROUP'),
          build_images: env('BUILD_IMAGES', 'true'),
          image_tag: deployCfg.imageTag,
          dns_label: env('AKS_DNS_LABEL', 'crack-detection-mahesh'),
          ...common,
        },
        secret: ['azure_client_secret'],
      };
    case 'do':
      return {
        inputs: {
          do_token: required('DO_TOKEN'),
          do_cluster_name: deployCfg.clusterName,
          image_tag: deployCfg.imageTag,
          ...common,
        },
        secret: ['do_token'],
      };
  }
}
