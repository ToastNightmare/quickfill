import { expect, test } from '@playwright/test';

test('Homepage loads', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: 'Fill PDF Forms Online' })).toBeVisible();
  await expect(page).toHaveTitle(/QuickFill/);
  await expect(page.locator('a[href="/sign-up"], a[href="/editor"]').first()).toBeVisible();
  expect(errors).toHaveLength(0);
});

test('Templates page loads', async ({ page }) => {
  await page.goto('/templates', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Form Templates' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Find a template' })).toBeVisible();
  await expect(page.getByPlaceholder('Search forms, agencies or tasks')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Popular' })).toBeVisible();

  await page.mouse.wheel(0, 900);
  const fillLinks = page.getByRole('link', { name: /Fill form/i });
  await expect(fillLinks.first()).toBeVisible();
  expect(await fillLinks.count()).toBeGreaterThanOrEqual(5);
});

test('Editor loads', async ({ page }) => {
  await page.goto('/editor', { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveURL('/editor');
  await expect(page.getByText('Upload a PDF, JPG, or PNG. Up to 15MB.')).toBeVisible();
  await expect(page.getByTestId('document-upload-input')).toBeAttached();
});

test('Pricing redirects to upload-first homepage', async ({ page }) => {
  await page.goto('/pricing', { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Fill PDF Forms Online' })).toBeVisible();
  await expect(page.locator('a[href="/editor"]').first()).toBeVisible();
});

test('Template opens in editor', async ({ page }) => {
  await page.goto('/templates', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Form Templates' })).toBeVisible();

  const fillButton = page.getByRole('link', { name: /Fill form/i }).first();
  await expect(fillButton).toBeVisible();
  await fillButton.click();

  await expect(page).toHaveURL(/\/editor\?template=/);
  await expect(page.getByTestId('pdf-page')).toBeVisible({ timeout: 15_000 });
});

test('Navigation links work', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const templatesLink = page.locator('a[href="/templates"]').first();
  await expect(templatesLink).toBeVisible();
  await templatesLink.click();
  await expect(page).toHaveURL('/templates');
  await expect(page.getByRole('heading', { name: 'Form Templates' })).toBeVisible();

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('a[href="/pricing"]')).toHaveCount(0);
  await expect(page.locator('a[href="/editor"]').first()).toBeVisible();

  const supportLink = page.getByRole('link', { name: 'Support' }).first();
  await expect(supportLink).toBeVisible();
  await supportLink.click();
  await expect(page).toHaveURL('/support');
  await expect(page.getByRole('heading', { name: 'Support', exact: true })).toBeVisible();
  await expect(page.locator('body')).toContainText('upload issues');
  await expect(page.locator('body')).not.toContainText('A$2');
  await expect(page.locator('body')).not.toContainText('A$25');
  await expect(page.locator('body')).not.toContainText('A$149');
  await expect(page.locator('body')).not.toContainText(`A$${"12"}.50`);
  await expect(page.locator('body')).not.toContainText('Upgrade');
});

test('Templates page shows public form badge', async ({ page }) => {
  await page.goto('/templates', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText('Public Form').first()).toBeVisible();
});

test('Homepage comparison table exists', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('columnheader', { name: 'QuickFill' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'General PDF suites' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'E-signature tools' })).toBeVisible();
});

test('Homepage FAQ section exists', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: 'Frequently asked questions' })).toBeVisible();
  await expect(page.locator('body')).toContainText('When do I see download options?');
});

test('Pricing route keeps upload-first flow', async ({ page }) => {
  await page.goto('/pricing', { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveURL('/');
  await expect(page.locator('body')).not.toContainText(`A$${"12"}.50`);
  await expect(page.locator('body')).not.toContainText('Get Pro');
});

test('Editor upload surface loads', async ({ page }) => {
  await page.goto('/editor', { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveURL('/editor');
  await expect(page.getByText('Upload a PDF, JPG, or PNG. Up to 15MB.')).toBeVisible();
  await expect(page.getByTestId('document-upload-input')).toBeAttached();
  await expect(page).toHaveTitle(/QuickFill/);
});
