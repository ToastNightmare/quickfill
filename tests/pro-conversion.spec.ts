import { expect, test } from '@playwright/test';

test.describe('Upload-first conversion paths', () => {
  test('Pricing route redirects to upload-first homepage', async ({ page }) => {
    await page.goto('/pricing', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Fill PDF Forms Online' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Get Pro');
    await expect(page.locator('body')).not.toContainText(`A$${"12"}.50`);
  });

  test('Dashboard redirects an anonymous user to sign in', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/sign-in(?:[/?#]|$)/);
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  });

  test('Editor keeps the public upload-first entry point', async ({ page }) => {
    await page.goto('/editor', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL('/editor');
    await expect(page.getByText('Upload a PDF, JPG, or PNG. Up to 15MB.')).toBeVisible();
    await expect(page.getByTestId('document-upload-input')).toBeAttached();
  });

  test('Template page shows public form indicators', async ({ page }) => {
    await page.goto('/templates', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL('/templates');
    await expect(page.getByRole('heading', { name: 'Form Templates' })).toBeVisible();
    await expect(page.getByText('Public Form').first()).toBeVisible();
  });

  test('Site structure keeps the upload-first navigation flow', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Fill PDF Forms Online' })).toBeVisible();
    await expect(page.locator('a[href="/editor"]').first()).toBeVisible();
    await expect(page.locator('a[href="/pricing"]')).toHaveCount(0);

    await page.goto('/templates', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL('/templates');
    await expect(page.getByRole('heading', { name: 'Form Templates' })).toBeVisible();

    await page.goto('/pricing', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Fill PDF Forms Online' })).toBeVisible();
  });
});
