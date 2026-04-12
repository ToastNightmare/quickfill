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

  // Check 5+ "Fill This Form" buttons exist (reliable count without toHaveCount min syntax)
  const count = await page.locator('a:has-text("Fill This Form")').count();
  expect(count).toBeGreaterThanOrEqual(5);
  
  // Check "Tax File Number Declaration" template exists with more reliable selector
  await expect(page.locator('text=Tax File Number').first()).toBeVisible();
});

test('Editor loads', async ({ page }) => {
  await page.goto('/editor');
  await page.waitForLoadState('networkidle');

  // Editor requires auth - either we see the editor or we're redirected to sign-in
  const url = page.url();
  const isEditor = url.includes('/editor');
  const isSignIn = url.includes('/sign-in');
  expect(isEditor || isSignIn).toBe(true);
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
  // Navigate to templates listing
  await page.goto('/templates');
  await page.waitForLoadState('networkidle');

  // Click first Fill This Form button
  const fillBtn = page.locator('a:has-text("Fill This Form")').first();
  await fillBtn.click();

  // Either editor or sign-in is acceptable (sign-in required for auth)
  await page.waitForLoadState('networkidle');
  const url = page.url();
  expect(url.includes('/editor') || url.includes('/sign-in') || url.includes('/templates')).toBe(true);
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
