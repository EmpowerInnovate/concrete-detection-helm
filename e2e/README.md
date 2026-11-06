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
