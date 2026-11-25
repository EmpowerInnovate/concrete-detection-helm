# Playwright end-to-end tests

These tests check the deployed crack-detection app on each cloud's domain:

| Project | URL |
| --- | --- |
| `eks` | https://crackdetectioneks.online |
| `aks` | https://crackdetectionaks.online |
| `do`  | https://crackdetectiondo.online |

Each test run covers:
- the HTTPS certificate is trusted and issued for the domain;
- plain HTTP redirects to HTTPS;
- the gallery (`/`) loads, and every image on it loads from `/static`;
- the upload form (`/upload`) is shown;
- optional: a test image posted to `/uploaded` gets processed and shows up in the gallery.

## Run locally

```bash
cd e2e
npm ci
npx playwright install chromium

npx playwright test                 # all three domains
npx playwright test --project=do    # one domain
BASE_URL=https://161-35-245-143.sslip.io npx playwright test   # any other URL
```

| Variable | Effect |
| --- | --- |
| `BASE_URL` | Test only this URL, instead of the three domains |
| `E2E_UPLOAD=1` | Also run the upload test. The uploaded image stays in the live gallery |
| `ALLOW_UNTRUSTED_TLS=1` | Accept untrusted certificates, for `letsencrypt-staging` or `mkcert` deployments |

## Run in GitHub Actions

Actions → **Mahesh-E2E Playwright crack detection** → Run workflow, then pick a `target` (`all`, `eks`, `aks` or `do`). The HTML report is attached to the run as the `playwright-report` artifact.

The HTTPS and redirect checks assume a deploy with `tls_mode=letsencrypt`. Deploys with `tls_mode=none` fail them.

---

# Deploy the app with Playwright

`tests/deploy-app.spec.ts` replaces the manual step **Actions → \<cloud\>-deploy crack detection → Run workflow**, for whichever cluster you created:

| `DEPLOY_PROVIDER` | Workflow | Default domain |
| --- | --- | --- |
| `gke` | `MAHESH_DEPLOY-SSL-GKE.yaml` | maheshconcretegallery.online |
| `eks` | `MAHESH_DEPLOY-EKS.yaml` | crackdetectioneks.online |
| `aks` | `MAHESH_DEPLOY-AKS.yaml` | crackdetectionaks.online |
| `do` | `MAHESH_DEPLOY-SSL-DO.yaml` | crackdetectiondo.online |

A deploy run does three things:

1. **setup:** checks the saved GitHub session in `.auth/`. If it's missing or expired, a Chrome window opens and the terminal shows **"ACTION NEEDED: sign in to GitHub"**. Sign in by hand and the run continues by itself. No password is stored anywhere.
2. **deploy:** fills in "Run workflow" from `.env` and starts it, then follows the run until it succeeds. It reads the app URL from the run summary (this also works for `<ip>.sslip.io`) and waits until the app answers there.
3. **app:** runs every check in `tests/app.spec.ts` against that URL (HTTPS, redirect, gallery, upload form). Add `E2E_UPLOAD=1` to also upload a test image.

## Setup

```bash
cd e2e
npm ci
cp .env.example .env     # set DEPLOY_PROVIDER and that cloud's settings
```

Requires Google Chrome, which is used for the GitHub sign-in.

## Run

```bash
npm run deploy           # cluster from DEPLOY_PROVIDER in .env
npm run deploy:gke       # or name it: deploy:gke | deploy:eks | deploy:aks | deploy:do
npm run uninstall        # eks / aks only: remove the app again
npm run auth             # sign in to GitHub again
npm run report           # HTML report of the last run
```

Credentials the workflows need come from `.env` and are only ever logged as a length:

- **gke:** `GCP_SA_KEY_FILE`, which points at the key JSON or its base64 copy
- **do:** `DO_TOKEN`
- **eks / aks:** the keys can stay blank, and the workflow then uses the repository secrets

`.env` and `.auth/` are git-ignored. Never commit them.

Notes:

- With `TLS_MODE=letsencrypt-staging` or `mkcert`, the app checks accept the untrusted certificate.
- With `TLS_MODE=none`, the app checks are skipped, because they test HTTPS.
- The GitHub selectors are all in `lib/github.ts`.
