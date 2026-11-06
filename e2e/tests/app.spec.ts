import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'concrete-crack.jpg');

test.describe('HTTPS and routing', () => {
  test('serves HTTPS with a certificate the browser trusts', async ({ page, baseURL }) => {
    // With ignoreHTTPSErrors off, goto rejects on an untrusted or wrong-name certificate.
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    expect(page.url()).toMatch(/^https:\/\//);
    expect(new URL(page.url()).host).toBe(new URL(baseURL!).host);
  });

  test('redirects plain HTTP to HTTPS', async ({ request, baseURL }) => {
    const httpURL = baseURL!.replace(/^https:/, 'http:') + '/';
    const response = await request.get(httpURL, { maxRedirects: 0 });
    expect([301, 302, 308]).toContain(response.status());
    expect(response.headers()['location']).toMatch(/^https:\/\//);
  });
});

test.describe('gallery', () => {
  test('lists processed images', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Concrete and Detected Cracks');
    await expect(page.getByRole('heading', { name: 'Concrete and Detected Cracks' })).toBeVisible();

    // Every image link must load from /static through the ingress.
    const sources = await page.locator('img').evaluateAll((imgs) => imgs.map((i) => i.getAttribute('src')!));
    for (const src of sources) {
      expect(src).toMatch(/^static\//);
      const response = await page.request.get('/' + src);
      expect(response.status(), src).toBe(200);
    }
  });
});

test.describe('upload', () => {
  test('shows the upload form', async ({ page }) => {
    await page.goto('/upload');
    await expect(page).toHaveTitle('Upload Images to Server');
    await expect(page.getByRole('heading', { name: 'Upload Concrete Images With Crack' })).toBeVisible();
    await expect(page.locator('input[type=file][name=photo]')).toBeAttached();
    await expect(page.getByRole('button', { name: 'upload' })).toBeVisible();
  });

  // Uploaded images stay in the live gallery, so this only runs when asked for.
  test('uploaded image is processed and appears in the gallery', async ({ page }) => {
    test.skip(process.env.E2E_UPLOAD !== '1', 'set E2E_UPLOAD=1 to upload a test image');
    test.setTimeout(180_000);

    const name = `e2e-${test.info().project.name}-${Date.now()}.jpg`;
    await page.goto('/upload');
    await page.locator('input[type=file][name=photo]').setInputFiles({
      name,
      mimeType: 'image/jpeg',
      buffer: readFileSync(FIXTURE),
    });
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/uploaded') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'upload' }).click(),
    ]);
    expect(response.status()).toBe(200);
    expect((await response.json()).originalname).toBe(name);

    // crack-detection polls the upload folder every 2 s and writes the result under the same name.
    await expect(async () => {
      await page.goto('/');
      await expect(page.locator(`img[src="static/${name}"]`)).toBeAttached();
    }).toPass({ timeout: 150_000, intervals: [5_000] });
    expect((await page.request.get(`/static/${name}`)).status()).toBe(200);
  });
});
