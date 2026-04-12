import { test, expect } from '@playwright/test';

test('Homepage loads', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Check title contains "QuickFill"
  await expect(page).toHaveTitle(/QuickFill/);
  
  // Check hero headline exists
  const heroHeadline = page.locator('h1').first();
  await expect(heroHeadline).toBeVisible();
  
  // Check CTA button visible (Start filling forms free or Fill a PDF)
  const ctaButton = page.locator('a[href="/sign-up"], a[href="/editor"]').first();
  await expect(ctaButton).toBeVisible();
  
  // Check no console errors
  expect(errors).toHaveLength(0);
});

test('Templates page loads', async ({ page }) => {
  await page.goto('/templates');
  await page.waitForLoadState('networkidle');

  // Check 10+ template cards
  const templateCards = page.locator('div:has-text("Fill This Form")');
  await expect(templateCards).toHaveCount({ min: 10 });
  
  // Check "Fill This Form" buttons exist
  const fillButtons = page.locator('text=Fill This Form');
  await expect(fillButtons).toHaveCount({ min: 10 });
  
  // Check "Tax File Number Declaration" template exists
  const tfnTemplate = page.locator('text="Tax File Number Declaration"');
  await expect(tfnTemplate).toBeVisible();
});

test('Editor loads', async ({ page }) => {
  await page.goto('/editor');
  await page.waitForLoadState('networkidle');

  // Check page loads (should see upload zone or editor)
  // The editor should have either an upload zone or the editor interface
  const uploadZone = page.locator('text=Upload PDF').first();
  const toolbar = page.locator('button').filter({ hasText: /Download|Text|Checkbox/ }).first();
  
  // Either upload zone or toolbar should be visible
  const hasUploadZone = await uploadZone.count() > 0;
  const hasToolbar = await toolbar.count() > 0;
  
  expect(hasUploadZone || hasToolbar).toBe(true);
});

test('Pricing page loads', async ({ page }) => {
  await page.goto('/pricing');
  await page.waitForLoadState('networkidle');

  // Check "$12" is visible (Pro monthly price)
  const priceElement = page.locator('text="$12"').first();
  await expect(priceElement).toBeVisible();
  
  // Check Pro upgrade button exists
  const proButton = page.locator('button:has-text("Upgrade to Pro"), a:has-text("Upgrade to Pro")').first();
  await expect(proButton).toBeVisible();
});

test('Template opens in editor', async ({ page }) => {
  await page.goto('/templates');
  await page.waitForLoadState('networkidle');

  // Click first template card
  const firstTemplate = page.locator('div:has-text("Fill This Form")').first();
  await firstTemplate.click();
  
  // Wait for URL to change to /editor
  await page.waitForURL(/\/editor/);
  
  // Check PDF canvas appears (either upload zone gone or canvas visible)
  // After template loads, we should see the editor with a PDF
  const pdfViewer = page.locator('canvas').first();
  await expect(pdfViewer).toBeVisible({ timeout: 10000 });
});

test('Navigation links work', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Check Templates link works
  const templatesLink = page.locator('a[href="/templates"]').first();
  await expect(templatesLink).toBeVisible();
  await templatesLink.click();
  await page.waitForURL('/templates');
  await expect(page).toHaveURL('/templates');
  
  // Go back to homepage
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  
  // Check Pricing link works
  const pricingLink = page.locator('a[href="/pricing"]').first();
  await expect(pricingLink).toBeVisible();
  await pricingLink.click();
  await page.waitForURL('/pricing');
  await expect(page).toHaveURL('/pricing');
});
